/**
 * news-agent — 每小時從 Google News RSS 抓取最新
 * 一番賞/盒玩/盲盒/轉蛋/卡牌資訊，用 Claude 改寫成繁中，寫入 news 表（預設下架）。
 * 排程：每小時整點（UTC 0 * * * *）
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'
import { r2Upload } from '@/lib/r2'
import sharp from 'sharp'
import { brandCoverImage, contentBox, stampUrlWatermark } from '@/lib/newsBranding'
import type { WmCorner } from '@/lib/dengekiWm'
import { createClaude } from '@/lib/aiUsage'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const UA_BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

// ─── Google News RSS 搜尋詞（中文 + 日文 + 英文，多語言廣覆蓋）─────────────
// 每次全局最多 8 篇，每詞最多 2 篇

type Locale = 'TW' | 'JP' | 'US'

const RSS_QUERIES: Array<{ q: string; category: string; locale: Locale }> = [
  // ── 繁體中文（台灣）
  { q: '一番賞 發售',         category: 'ichiban',  locale: 'TW' },
  { q: '盒玩 發售 新品',      category: 'toy'    , locale: 'TW' },
  { q: '盲盒 新品 上市',      category: 'toy'    , locale: 'TW' },
  { q: '轉蛋 新品 發售',      category: 'gacha',    locale: 'TW' },
  { q: '卡牌 新彈 發售',      category: 'tcg',      locale: 'TW' },
  { q: '扭蛋 新商品',         category: 'gacha',    locale: 'TW' },
  // ── 日文（日本）
  { q: '一番くじ 新商品 発売',           category: 'ichiban',  locale: 'JP' },
  { q: '一番くじ 予約',                  category: 'ichiban',  locale: 'JP' },
  { q: 'バンダイ ガシャポン 新商品',     category: 'gacha',    locale: 'JP' },
  { q: 'ガシャポン 発売 予約',           category: 'gacha',    locale: 'JP' },
  { q: 'ブラインドボックス 新商品 発売', category: 'toy'    , locale: 'JP' },
  { q: 'ポップマート 新商品',            category: 'toy'    , locale: 'JP' },
  { q: 'ポケモンカード 新弾 発売',       category: 'tcg',      locale: 'JP' },
  { q: '遊戯王 OCG 新カード 発売',       category: 'tcg',      locale: 'JP' },
  { q: 'ヴァイスシュヴァルツ 新弾',      category: 'tcg',      locale: 'JP' },
  { q: 'ワンピースカードゲーム 新弾',    category: 'tcg',      locale: 'JP' },
  { q: '寶可夢 卡牌 新彈',               category: 'tcg',      locale: 'TW' },
  { q: '遊戲王 卡牌 新彈 上市',          category: 'tcg',      locale: 'TW' },
  { q: '食玩 新商品 発売',               category: 'toy',      locale: 'JP' },
  { q: 'ソフビ 新作 発売',               category: 'toy',      locale: 'JP' },
  { q: 'TOPTOY 盲盒 新品',               category: 'toy',      locale: 'TW' },
  { q: 'デュエルマスターズ 新弾',        category: 'tcg',      locale: 'JP' },
  // ── 英文（全球）
  { q: 'gashapon new product release 2026', category: 'gacha',    locale: 'US' },
  { q: 'Pokemon TCG new set 2026',          category: 'tcg',      locale: 'US' },
  { q: 'blind box figure new release',      category: 'toy'    , locale: 'US' },
  { q: 'Pop Mart new figure',               category: 'toy'    , locale: 'US' },
  { q: 'Yu-Gi-Oh OCG new card 2026',        category: 'tcg',      locale: 'US' },
]

// ── 直接 RSS 來源（非 Google News）──────────────────────────────────────────
/**
 * HTML 來源（無可用 RSS，需解析列表頁）
 *
 * 玩具人 toy-people.com：頁面 <head> 有宣告 rss.php 等三支 feed，但實際皆 404，
 * 故改抓列表頁的文章連結。繁中原生、內文長、圖多且無浮水印，
 * 是目前最適合的來源之一。
 */
const HTML_SOURCES: Array<{ url: string; category: string; label: string }> = [
  { url: 'https://www.toy-people.com/?cat=8', category: 'toy',    label: 'ToyPeople-新聞' },
  { url: 'https://www.toy-people.com/',       category: 'figure', label: 'ToyPeople-首頁' },
]

/** 從玩具人列表頁取出文章連結（?p=數字） */
function extractToyPeopleLinks(html: string): string[] {
  const links = [...html.matchAll(/href="(https:\/\/www\.toy-people\.com\/\?p=\d+)"/g)].map(m => m[1])
  return [...new Set(links)]
}

/**
 * oneone 宇宙（universe.oneone.com.tw）—— 繁中玩具情報，老闆 2026-08-29 指定
 *
 * 為什麼單獨寫一支而不是丟進 DIRECT_FEEDS：這個來源有三件事跟別家不一樣，
 * 走共用流程一定會出事。
 *
 * ① **它是同業**（站上就有「線上抽一番賞」與 /store）。每篇內文都被塞了
 *    「就上台港最大 oneone 線上商城」這類置入與回站連結 —— 不先清乾淨，
 *    等於在我們自己的情報頁幫對手導流。所以送進 Claude 的是
 *    `oneOneBodyText()` 清過的版本，不是整頁純文字；改寫完再檢查一次，
 *    還留著就整篇不發。
 * ② **他們的 404 頁會回一整份正常版面**（實測 /posts/6228 是 HTTP 404
 *    卻吐 46KB HTML，裡面就有紅底商城 banner）。`fetchText` 只收 res.ok，
 *    所以拿不到 404 的內容 —— 但圖片仍走下面的白名單，不靠這一層擋。
 * ③ **圖分三種路徑，只有兩種能用**（老闆特別交代：不要抓到紅底 logo 當封面）：
 *
 *      upload/featured/…            文章封面            ✅
 *      images/editor/YYYY-MM-DD/…   內文圖（官方原圖）   ✅
 *      images/<雜湊>.png            商城廣告版位         ❌ ← 紅底 oneone logo
 *      upload/author/…              作者頭像             ❌
 *      /assets/images/…             站台 logo、按鈕       ❌
 *
 *    用白名單而不是「跳過含 logo 字樣的 <img>」那種黑名單：廣告圖的檔名是
 *    雜湊（c522e1ae….png），字面上完全看不出它是 logo。
 *
 * 圖片本身沒有 oneone 浮水印 —— 他們貼的是廠商官方宣傳圖原檔，角落的
 * BANDAI／©創通・サンライズ 是**權利人標記，不可以蓋掉**（下游的浮水印
 * 流程本來就只認 WATERMARKED_SOURCES，這裡不必特別處理）。
 */
const ONEONE_FEED = 'https://universe.oneone.com.tw/feed'
const ONEONE_CDN  = 'd89889xojlqhy.cloudfront.net'
/** 一次最多看幾則；真正寫幾篇仍受 MAX_TOTAL 與分類配額管 */
const ONEONE_SCAN = 12

const isOneOneCoverUrl = (u: string) => !!u && u.includes(`${ONEONE_CDN}/upload/featured/`)
const isOneOneBodyUrl  = (u: string) => !!u && u.includes(`${ONEONE_CDN}/images/editor/`)

/** 他們自家生意的分類：4=線上抽（自家平台公告）、38=集團動態 */
const ONEONE_SKIP_CATEGORY = new Set(['4', '38'])

/** 他們的分類代碼 → 我們的 category；沒對到的交給 pickCategory 用標題判 */
const ONEONE_CATEGORY: Record<string, string> = {
  '7':  'ichiban',   // 一番賞
  '5':  'gacha',     // 盲盒扭蛋
  '12': 'figure',    // 公仔週邊
  '8':  'toy',       // 動漫
  '10': 'toy',       // 潮流文創
  '28': 'toy',       // 電影娛樂
  '53': 'toy',       // 聯名消息
}

/** 文章頁掛的分類代碼（一篇通常 2~4 個） */
function oneOneCategoryIds(html: string): string[] {
  return [...html.matchAll(/post-category-marker"\s+href="\/category\/(\d+)"/g)].map(m => m[1])
}

function oneOneCategory(html: string, fallback: string): string {
  for (const id of oneOneCategoryIds(html)) {
    if (ONEONE_CATEGORY[id]) return ONEONE_CATEGORY[id]
  }
  return fallback
}

/**
 * 商城置入的特徵字。改寫後的稿子也用它複驗 —— 漏一句就是幫對手打廣告。
 * 「快抽選」是他們的自家產品名（oneone LITE 快抽選）。
 */
const ONEONE_AD_RE = /oneone|線上商城|線上輕鬆等商品|24\s*小時線上抽|快抽選/i

/**
 * 內文純文字，商城置入整段刪掉
 *
 * 以 <p> 為單位過濾，不是逐句 —— 業配句常常沒有句號，逐句切會把它跟
 * 後面的真內容黏成同一段，一起被丟掉或一起被留下。
 * 兩層都要：整段是商城連結的（含 oneone.com.tw）先拿掉，剩下的再比對字樣，
 * 因為有些置入是純文字沒包連結。
 */
function oneOneBodyText(html: string): string {
  const i = html.indexOf('post-content')
  const seg = (i >= 0 ? html.slice(i, i + 80_000) : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
  const plain = (x: string) => x
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()

  const kept = [...seg.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1])
    .filter(b => !/oneone\.com\.tw/i.test(b))
    .map(plain)
    .filter(t => t && !ONEONE_AD_RE.test(t))
  if (kept.length) return kept.join('\n').slice(0, 1500)

  // 版型改成不用 <p> 時的退路：先拔掉回站連結整塊，再逐句過濾
  return plain(seg.replace(/<a[^>]+href="[^"]*oneone\.com\.tw[^"]*"[\s\S]*?<\/a>/gi, ' '))
    .split(/(?<=[。！？])/)
    .filter(x => !ONEONE_AD_RE.test(x))
    .join('')
    .slice(0, 1500)
}

/** 內文配圖只收 images/editor/ 底下的（廣告版位與作者頭像都不在這一層） */
function extractOneOneBodyImages(html: string, limit: number): string[] {
  const i = html.indexOf('post-content')
  const seg = i >= 0 ? html.slice(i, i + 80_000) : html
  const urls = [...seg.matchAll(/https:\/\/[^"'\s)]+/g)].map(m => m[0]).filter(isOneOneBodyUrl)
  return [...new Set(urls)].slice(0, limit)
}

const DIRECT_FEEDS: Array<{ url: string; category: string; label: string }> = [
  // PR TIMES ホビー・玩具カテゴリ（日本企業プレスリリース）
  { url: 'https://prtimes.jp/rss/category/17.rss',     category: 'figure',   label: 'PRTimes-hobby' },
  // 電撃ホビーウェブ
  { url: 'https://hobby.dengeki.com/feed/',             category: 'figure',   label: 'DengekiHobby' },
  // Animate Times
  { url: 'https://www.animatetimes.com/rss.xml',       category: 'figure',   label: 'AnimateTimes' },
  // 巴哈姆特 GNN 遊戲動漫新聞（繁中）
  { url: 'https://gnn.gamer.com.tw/rss.xml',           category: 'figure',   label: 'GNN-TW' },
]

const LOCALE_PARAMS: Record<Locale, { hl: string; gl: string; ceid: string }> = {
  TW: { hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant' },
  JP: { hl: 'ja',    gl: 'JP', ceid: 'JP:ja'       },
  US: { hl: 'en-US', gl: 'US', ceid: 'US:en'       },
}

function rssUrl(q: string, locale: Locale) {
  const { hl, gl, ceid } = LOCALE_PARAMS[locale]
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${ceid}`
}

// ─── RSS 解析 ────────────────────────────────────────────────────────────────

interface RssItem {
  title:       string
  link:        string
  description: string
  pubDate:     string
  source:      string
  rssImage:    string  // enclosure / media:thumbnail / content:encoded 內的圖片
  // content:encoded 原文。抓 RSS 時就一起下載了，不是額外請求。
  // 文章頁抓不到時用它當內文配圖的來源（電擊的 feed 一則就帶 18 張圖）
  rssHtml:     string
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
      ?.replace(/<[^>]+>/g, '').trim() ?? ''
    const link  = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? ''
    const desc  = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1]
      ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
      ?.replace(/<a[^>]+>|<\/a>|<font[^>]+>|<\/font>/gi, '').trim() ?? ''
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? ''
    const source  = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]?.trim() ?? ''
    // 從 enclosure / media:content / media:thumbnail / content:encoded 取圖片
    const contentEncoded = block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)?.[1]
      ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1') ?? ''
    const rssImage =
      block.match(/enclosure[^>]+url=["']([^"']+)/i)?.[1] ??
      block.match(/media:content[^>]+url=["']([^"']+)/i)?.[1] ??
      block.match(/media:thumbnail[^>]+url=["']([^"']+)/i)?.[1] ??
      contentEncoded.match(/<img[^>]+src=["']([^"']+)/i)?.[1] ??
      block.match(/<img[^>]+src=["']([^"']+)/i)?.[1] ??
      ''
    if (title && link) items.push({ title, link, description: desc, pubDate, source, rssImage, rssHtml: contentEncoded })
  }
  return items
}

// 跳過太舊的文章（超過 7 天）
function isRecent(pubDate: string, days = 7): boolean {
  if (!pubDate) return true
  const d = new Date(pubDate)
  return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < days * 86400_000
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  for (const ua of [UA, UA_MOBILE, UA_BOT]) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'ja,zh-TW;q=0.9,en;q=0.7',
        },
        redirect: 'follow',
      })
      if (res.ok) return await res.text()
    } catch { continue }
  }
  return ''
}

function extractMeta(html: string, prop: string): string {
  return (
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']{1,500})["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))?.[1] ??
    ''
  ).trim()
}

function extractOgImage(html: string): string {
  return extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || ''
}

// og:image 抓不到時，從 <img> 標籤掃描（跳過小圖示）
function extractBodyImage(html: string): string {
  const matches = [...html.matchAll(/<img[^>]+src=["']([^"']{20,500})["'][^>]*/gi)]
  for (const m of matches) {
    const src = m[0]
    if (/logo|icon|avatar|pixel|spacer|sprite|banner_\d+x\d+/i.test(src)) continue
    const url = m[1]
    if (!url || url.startsWith('data:')) continue
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (BLOCKED_IMG_DOMAINS.some(d => url.includes(d))) continue
      return url
    }
  }
  return ''
}

// 內文配圖：沿用單圖的過濾規則，取前 N 張不重複的圖（文章 HTML 已抓過，不額外耗成本）
function extractBodyImages(html: string, limit: number): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']{20,500})["'][^>]*/gi)) {
    if (out.length >= limit) break
    const tag = m[0]
    if (/logo|icon|avatar|pixel|spacer|sprite|banner_\d+x\d+/i.test(tag)) continue
    const url = m[1]
    if (!url || url.startsWith('data:')) continue
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue
    if (BLOCKED_IMG_DOMAINS.some(d => url.includes(d))) continue
    if (out.includes(url)) continue
    out.push(url)
  }
  return out
}

// 將可能的相對路徑解析成絕對 URL；data: URI 或解析失敗回傳空字串
/*
 * 會在圖片上壓站方浮水印的來源。
 *
 * 「要不要蓋 GGB logo」由這份名單決定，不由偵測分數決定 ——
 * 2026-08-07 實測（見 lib/dengekiWm.ts 的註解）：帶浮水印的圖分數
 * 0.183~0.248，乾淨的 BANDAI 商品照卻可以到 0.253，兩群完全重疊。
 * 靠分數判斷的結果是「四張漏兩張，四張乾淨圖誤蓋一張」——
 * 玩家會看到官方商品照上莫名其妙多一個 GGB logo。
 *
 * 網域是 100% 準確的訊號，偵測只用來挑角落（實測 3/4 正確）。
 * 角落不寫死：同一個電ホビ，實測四張分別在 右下／右上／左上／右上，
 * 寫死 bottom-right 只會有 1/4 正確。
 */
const WATERMARKED_SOURCES = ['dengeki.com']

/**
 * 「這是權利人自己的標記，不是新聞網站的浮水印」—— 用來否決視覺誤判
 *
 * 版權／免責聲明（©、※画像は…）與廠商官方標記（BANDAI 食玩圓標之類）
 * 是誤判的兩大宗。清單只放**權利人**的東西，不放新聞網站的名字。
 */
const RIGHTS_MARK_RE = /©|\(c\)|copyright|画像は|イメージです|創通|サンライズ|東映|集英社|BANDAI|バンダイ|食玩|SHOKUGAN|GASHAPON|ガシャポン|TAKARA|TOMY|GOOD ?SMILE|グッドスマイル|MEGAHOUSE|FURYU|フリュー|SEGA|セガ|TAITO|タイトー|KOTOBUKIYA|コトブキヤ/i

/** 這張圖是不是來自會壓浮水印的站 */
const isWatermarkedSource = (...urls: string[]) =>
  urls.some(u => WATERMARKED_SOURCES.some(d => u?.includes(d)))
/**
 * 封面圖體檢：擋掉「站方拿自家 logo 當 og:image」的文章
 *
 * 玩具人與 oneone universe 在沒有專屬 og:image 時會回傳站標，結果文章
 * 封面就是一塊紅底白字的 logo（老闆截圖回報）。老闆的規則是
 * 「沒圖就不要生成此文章，找別篇」—— 所以這裡回 false 就整篇跳過。
 *
 * 兩個門檻是拿實際資料量出來的（站上 14 張正常封面 vs 那兩張 logo）：
 *
 *   尺寸    正常封面最小 640×360；玩具人站標只有 161×50
 *   色彩數  縮到 32×32 後數不重複顏色，正常封面 505～1021；
 *           oneone 站標只有 123（純色塊 + 白字）
 *
 * 為什麼兩個都要：玩具人站標太小，縮放到 32×32 反而被插值撐出 853 色，
 * 光看色彩數抓不到；oneone 是 700×700 的正方形，光看尺寸也抓不到。
 *
 * 全程本地 sharp，不呼叫付費服務。放在 Claude 改寫「之前」——
 * 多抓一張圖是幾十 KB，改寫一篇才是真的成本。
 */
/*
 * 同一次執行內，同一張圖只下載一次、只問一次 Claude。
 *
 * 封面圖會被摸兩次（先體檢、再處理），內文圖也常常就是封面的同一張，
 * 每次都重抓重問等於白花額度。用網址擋下載、用內容雜湊擋視覺呼叫 ——
 * 網址不同但內容相同的縮圖變體也擋得掉。
 */
const imgBufCache = new Map<string, Buffer | null>()
const wmVerdictCache = new Map<string, WmVisionResult | null>()

async function fetchImageOnce(url: string): Promise<Buffer | null> {
  if (imgBufCache.has(url)) return imgBufCache.get(url) ?? null
  let out: Buffer | null = null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
    })
    if (res.ok) {
      const b = Buffer.from(await res.arrayBuffer())
      if (b.length >= 3_000) out = b
    }
  } catch { out = null }
  // 單次執行的快取，超過就整個清掉（serverless 實例可能被重用）
  if (imgBufCache.size > 60) imgBufCache.clear()
  imgBufCache.set(url, out)
  return out
}

const MIN_COVER_W = 480
const MIN_COVER_H = 270
const MIN_COVER_COLORS = 300

async function isUsableCover(url: string): Promise<boolean> {
  try {
    const buf = await fetchImageOnce(url)
    if (!buf) return false
    const meta = await sharp(buf).metadata()
    const W = meta.width ?? 0, H = meta.height ?? 0
    if (W < MIN_COVER_W || H < MIN_COVER_H) return false

    const { data, info } = await sharp(buf).resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
    const seen = new Set<string>()
    for (let i = 0; i < data.length; i += info.channels) {
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
    }
    return seen.size >= MIN_COVER_COLORS
  } catch {
    return false
  }
}

const DEFAULT_NEWS_IMAGE =
  `${(process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://www.ggb.com.tw').replace(/\/$/, '')}/images/banner_defaulet.png`


/**
 * 浮水印偵測：讓 Claude 視覺看四個角（**所有來源、所有圖都跑**）
 *
 * 原本只有 dengeki 走這條，其他來源的圖完全不檢查、原樣轉存 ——
 * 只要哪家開始壓站標就會直接出現在文章裡。老闆的要求是「百分之百
 * 無差錯，不要看到別人 logo」，所以改成不分來源一律檢查。
 *
 * 為什麼不用本地模板比對當主判準：那支是照電ホビ浮水印做的邊緣模板，
 * 只認得那一種；而且實測三張電ホビ原圖只挑對一張（分數 0.175／0.176／
 * 0.140，全都低於門檻）。半透明疊白的浮水印本來就沒什麼邊緣可對。
 *
 * 兩個關鍵細節：
 *   1. 角落裁切先做 normalise（直方圖拉伸）—— 浮水印是半透明的，
 *      拉伸後對比才看得出來，直接送原圖 Claude 也容易漏。
 *   2. Prompt 必須講清楚「商品包裝上的品牌 logo（BANDAI／GASHAPON／
 *      TOMY…）不算浮水印」，否則商品照會被誤判，蓋在商品本體上。
 *
 * 回傳 'none' = 乾淨；回傳角落 = 那一角有站方浮水印；
 * 回傳 null = 呼叫失敗／看不懂 → 呼叫端一律當作不確定，整張不用。
 */
type WmVisionResult = WmCorner | 'none'

type Box = { left: number; top: number; width: number; height: number }

/**
 * 上緣／下緣兩條長條（取自內容區，已拉高對比）—— 送給模型看的就是這兩張
 *
 * `box` 一定要由呼叫端算好傳進來，不要在這裡自己算：蓋完 logo 之後那塊
 * 白墊會跟左右的白色留白連成一片，trim 會多吃掉一截，量出來的內容區
 * 跟原圖不一樣，複驗裁到的位置就整個歪掉（實跑一輪 6 篇全被誤判擋下）。
 */
async function edgeStrips(buf: Buffer, box: Box): Promise<[string, string] | null> {
  try {
    const W = box.width, H = box.height
    if (!W || !H) return null
    const sh = Math.max(40, Math.round(H * 0.16))
    const top = await sharp(buf).extract({ left: box.left, top: box.top, width: W, height: sh })
      .resize(700, null).normalise().png().toBuffer()
    const bottom = await sharp(buf).extract({ left: box.left, top: box.top + H - sh, width: W, height: sh })
      .resize(700, null).normalise().png().toBuffer()
    return [top.toString('base64'), bottom.toString('base64')]
  } catch { return null }
}

async function askVision(strips: [string, string], prompt: string): Promise<string> {
  const claude = createClaude('news-agent-wm-verify', process.env.ANTHROPIC_API_KEY)
  const res = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    /*
     * 給它思考空間再作答。逼它一個字答完反而會亂猜 —— 實測「不准說明」時
     * 三張錯兩張，允許先描述再作答是三張全對。
     *
     * **但 150 太小**（2026-08-29）：說明還沒講完就被截斷，結論那行根本沒寫出來，
     * 而解析是「取全文最後一次出現的代碼」—— 於是從說明文字裡的「（BR区域）」
     * 把答案撿走。實測一張的判定是 BR，它自己的理由卻寫著
     * 「属于商品本身的官方logo，不算网站浮水印…未发现浮水印」。
     * 老闆回報的「浮水印在右下角但你蓋左下角」就是這樣來的。
     */
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'text', text: '上緣：' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: strips[0] } },
        { type: 'text', text: '下緣：' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: strips[1] } },
      ],
    }],
  })
  return (res.content[0] as { text?: string }).text ?? ''
}

/**
 * 從回答裡取結論。**只認 `ANSWER=` 那一行**，不從說明文字裡撿。
 *
 * 舊版是「全文最後一次出現的代碼」，遇到說明被截斷（或說明裡順口提到
 * 「下緣的右側（BR区域）」）就會把說明當成結論 —— 見上面 max_tokens 的說明。
 */
function readAnswer(raw: string, re: RegExp): string | null {
  const m = [...raw.toUpperCase().matchAll(re)].map(x => x[1])
  return m.length ? m[m.length - 1] : null
}

/**
 * 浮水印偵測：**所有來源、所有圖都跑**（老闆：百分之百不要看到別人 logo）
 *
 * 送的是「上緣整條 + 下緣整條」而不是四張角落裁圖。實測差很多：
 * 四張角落裁圖時 Haiku 三張錯兩張、換 Sonnet 才全對；改成兩條長條之後
 * Haiku 就三張全對，而且 input 從約 800 token 掉到約 400 —— 模型看得到
 * 整條邊，比看四塊各自孤立的裁圖好判斷。既準又便宜。
 *
 * 三個關鍵細節：
 *   1. 長條取自**內容區**而非畫布。電ホビ的 og:image 常是直式照片放進
 *      1200×630 畫布、左右補白，站標壓在照片角落 —— 用畫布角落去找，
 *      差半張圖（老闆截圖那張的內容區從 x=286 才開始）
 *   2. normalise() 拉高對比，半透明站標才看得出來
 *   3. prompt 必須列出「不算浮水印」的東西：商品／包裝上的品牌標誌、
 *      廠商 logo（BANDAI、GASHAPON、FuRyu…）、作品 logo、價格規格文字
 *
 * 回 'none' = 乾淨；回角落 = 那一角有站方浮水印；回 null = 不確定 →
 * 呼叫端一律不用這張圖。
 */
async function findWatermarkWithVision(buf: Buffer, sourceUrl = '', box?: Box): Promise<WmVisionResult | null> {
  const hash = crypto.createHash('sha1').update(buf).digest('hex')
  if (wmVerdictCache.has(hash)) return wmVerdictCache.get(hash) ?? null
  const remember = (v: WmVisionResult | null) => {
    if (wmVerdictCache.size > 120) wmVerdictCache.clear()
    wmVerdictCache.set(hash, v)
    return v
  }
  try {
    const strips = await edgeStrips(buf, box ?? await contentBox(buf))
    if (!strips) return remember(null)
    let host = ''
    try { host = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { host = '' }

    const raw = await askVision(strips, [
      '兩張圖分別是同一張照片的「上緣整條」與「下緣整條」（已拉高對比）。',
      host ? `照片取自新聞網站 ${host}。` : '',
      '請判斷這個新聞網站有沒有在角落壓上自己的站標／浮水印（通常半透明、低對比，跟照片內容無關）。',
      '有的話在哪一角：TL（上緣的左邊三分之一）、TR（上緣的右邊三分之一）、BL（下緣的左邊三分之一）、BR（下緣的右邊三分之一）；沒有就 NONE。',
      '注意：商品或包裝上印的品牌標誌、玩具廠商官方 logo（BANDAI、GASHAPON、FuRyu、TOMY、Good Smile…）、',
      '作品本身的 logo、宣傳圖裡的價格與規格文字，都**不算**浮水印，不要選它們。',
      '先用一到兩句話說明，然後換兩行：倒數第二行寫 MARK=<你在那一角看到的文字，逐字照抄；沒有文字就寫 MARK=->，',
      '最後一行寫 ANSWER=TL 或 ANSWER=TR 或 ANSWER=BL 或 ANSWER=BR 或 ANSWER=NONE。這兩行不可以有其他文字。',
    ].join(''))

    const ans = readAnswer(raw, /ANSWER\s*=\s*(TL|TR|BL|BR|NONE)/g)
    if (!ans) return remember(null)
    if (ans === 'NONE') return remember('none')

    /*
     * 用「它讀到的字」否決誤判（2026-08-29）
     *
     * 模型很容易把**廠商官方標記**與**版權／免責聲明**當成新聞網站的浮水印。
     * 實測 oneone 的四張官方宣傳圖，三張被判成有站標，MARK 分別是
     * 「©universe」「※画像はイメージです…サンライズ」「BANDAI 食玩」——
     * 全都是權利人自己的東西，蓋掉比露出來更糟。
     * 同一輪的電ホビ 對照組 MARK 是「電撃hobby.net」，不在這份清單裡，照樣保留。
     *
     * 只做否決、不做「一定要含站名才算」：有些站的浮水印是沒有字的圖樣，
     * 要求含站名會把真的漏掉。寧可多蓋，不要漏蓋（老闆的原則）。
     */
    const mark = raw.match(/MARK\s*=\s*(.+)/i)?.[1]?.trim() ?? ''
    if (mark && RIGHTS_MARK_RE.test(mark)) return remember('none')

    const map: Record<string, WmCorner> = { TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right' }
    return remember(map[ans])
  } catch {
    return remember(null)  // 看不出來就是不確定 —— 寧可不用這張圖
  }
}

/**
 * 蓋完之後的複驗：白框以外還看不看得到原本的站標
 *
 * 問的是二元問題而不是再問一次「浮水印在哪一角」—— 後者在蓋完之後會把
 * 我們自己的 GGB logo 當成浮水印指回來，等於每張都被判失敗。
 * 誤判成 DIRTY 只是多跳一篇（實測三張中一張），誤判成 CLEAN 才會漏圖，
 * 所以這裡寧可保守。
 */
async function verifyBrandedClean(buf: Buffer, sourceUrl = '', box?: Box): Promise<boolean> {
  try {
    const strips = await edgeStrips(buf, box ?? await contentBox(buf))
    if (!strips) return false
    let host = ''
    try { host = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { host = '' }
    const raw = await askVision(strips, [
      '兩張圖分別是同一張照片的「上緣整條」與「下緣整條」（已拉高對比）。',
      '我們已經在其中一角蓋上白色方塊＋粉紅色扭蛋機的「吉吉比」logo，那是我們自己的，請完全忽略它。',
      `請問在那個白色方塊以外，還看不看得到${host ? ` ${host}` : '原本新聞網站'}壓上去的站標／浮水印？`,
      '商品或包裝上的品牌標誌、玩具廠商 logo、作品 logo、版權與免責聲明都不算。',
      '先用一句話說明，最後單獨一行寫 ANSWER=CLEAN 或 ANSWER=DIRTY，那一行不可以有其他文字。',
    ].join(''))
    return readAnswer(raw, /ANSWER\s*=\s*(CLEAN|DIRTY)/g) === 'CLEAN'
  } catch { return false }
}

// 下載浮水印來源圖 → 壓 GGB logo → 上傳 R2；失敗回 null（呼叫端用預設圖）
/**
 * 內文配圖：把來源文章的 2 張圖插進生成內容的段落之間
 *
 * 圖片來自已經抓下來的文章 HTML，不額外發請求、不做圖片生成，
 * 成本僅為 R2 儲存。轉存 R2 而非直接外連，是因為部分來源站擋 hotlink。
 * 每張圖都會偵測浮水印，偵測到就比照封面蓋上 GGB logo 蓋掉，
 * 沒偵測到就原樣轉存 —— 不會為了保險而在乾淨的圖上亂蓋 logo。
 */
async function injectBodyImages(
  content: string,
  articleHtml: string,
  coverUrl: string,
  pageUrl: string,
  forceBrand = false,
  seen?: Set<string>,
  /** 自訂取圖規則（oneone 只收 images/editor/，見該來源的說明） */
  pickImages?: (html: string, limit: number) => string[],
): Promise<string> {
  if (!content || !articleHtml) return content

  const candidates = (pickImages ?? extractBodyImages)(articleHtml, 6)
    .map(u => resolveImageUrl(u, pageUrl))
    .filter(u => u && u !== coverUrl)
  if (candidates.length === 0) return content

  const hosted: string[] = []
  for (const u of candidates) {
    if (hosted.length >= 2) break
    // 逐張偵測：有浮水印就蓋 logo，沒有就原樣轉存
    const r = await downloadSmartToR2(u, forceBrand, pageUrl, seen, 'body')
    if (r) hosted.push(r)
  }
  if (hosted.length === 0) return content

  // 插在第 1、2 個 </p> 之後；段落不足就接在文末
  const parts = content.split('</p>')
  if (parts.length <= 1) {
    return content + hosted.map(figureHtml).join('')
  }
  let out = ''
  let used = 0
  parts.forEach((seg, i) => {
    out += seg + (i < parts.length - 1 ? '</p>' : '')
    const insertAfter = i === 0 || i === 2
    if (insertAfter && used < hosted.length && i < parts.length - 1) {
      out += figureHtml(hosted[used]); used++
    }
  })
  if (used < hosted.length) out += hosted.slice(used).map(figureHtml).join('')
  return out
}

function figureHtml(url: string): string {
  // 來源圖多半只有 800px，讓它跟著容器寬度拉伸就會糊。
  // max-width 讓它最多顯示到原始尺寸，容器再寬也不放大
  return `<figure style="margin:1.5rem auto;max-width:800px"><img src="${url}" alt="" loading="lazy" style="width:100%;height:auto;border-radius:8px" /></figure>`
}

/**
 * 轉存到 R2，來源會壓浮水印時蓋上 GGB logo
 *
 * 封面圖與內文圖共用同一條路徑。**不分來源，每一張都檢查**（老闆要求：
 * 百分之百不要看到別人的 logo）。原本只查 dengeki，其他來源原樣轉存，
 * 只要哪家開始壓站標就會直接漏出去。
 *
 * 流程（封面）：
 *   1. Claude 視覺看上下緣 → 乾淨就原樣轉存
 *   2. 有浮水印 → 蓋 GGB logo → **再驗一次**，確認蓋完真的看不到了
 *   3. 任何一步不確定（API 失敗、蓋完還看得到、已知會壓浮水印的站卻
 *      回報乾淨）→ 回 null，呼叫端整篇不發
 *
 * 內文配圖走簡化版：**有浮水印就丟掉那張圖**，不蓋也不複驗；
 * 已知會壓浮水印的站連下載都省。內文圖少一兩張不影響文章，
 * 為它多花兩次視覺呼叫不划算（老闆規則）。
 *
 * 第 2 步是關鍵：驗的是「實際成品」而不是「兩個定位方法有沒有共識」，
 * 直接對應我們真正在意的事 —— 成品上還看不看得到別人的浮水印。
 *
 * forceBrand 已無作用（現在一律檢查），保留參數避免動到所有呼叫端。
 */
async function downloadSmartToR2(
  imgUrl: string,
  forceBrand = false,
  sourceUrl = '',
  seen?: Set<string>,
  /**
   * 'cover' = 封面，蓋得掉就蓋，蓋不掉整篇不發
   * 'body'  = 內文配圖，**有浮水印就直接不要這張**，不花力氣蓋也不複驗
   *
   * 老闆規則：難蓋的內文圖就捨棄，網上文章多的是，主圖顧好就行。
   * 這樣一張有浮水印的內文圖從「2 次視覺呼叫 + 蓋圖」變成「1 次呼叫」，
   * 已知一定會壓浮水印的站更是連下載都省。
   */
  role: 'cover' | 'body' = 'cover',
): Promise<string | null> {
  try {
    // 已知一定會壓浮水印的站，內文圖直接放棄 —— 連圖都不用抓、更不用問 Claude
    if (role === 'body' && isWatermarkedSource(sourceUrl, imgUrl)) return null

    // 封面圖在 isUsableCover 已經抓過一次，這裡直接吃快取，不重抓
    const buf = await fetchImageOnce(imgUrl)
    if (!buf) return null

    // 同一張圖只處理一次。
    // 封面的 og:image 常常就是內文的第一張圖，只是網址不同（縮圖變體、帶 query）——
    // 用網址比對抓不到，結果同一張圖被下載、去浮水印、上傳兩次，
    // 而且兩次偵測到的角落可能不一樣，於是同一張圖出現兩個不同位置的 logo。
    // 比對內容雜湊才擋得住。
    if (seen) {
      const h = crypto.createHash('sha1').update(buf).digest('hex')
      if (seen.has(h)) return null
      seen.add(h)
    }

    // 不分來源一律檢查
    // 內容區只量原圖這一次，蓋完之後不能重量（白墊會跟留白邊連成一片）
    const box = await contentBox(buf)
    const found = await findWatermarkWithVision(buf, sourceUrl || imgUrl, box)
    if (found === null) return null   // 看不出來 = 不確定 → 不用這張

    const alwaysWatermarked = isWatermarkedSource(sourceUrl, imgUrl)
    if (found === 'none') {
      // 已知一定會壓浮水印的站卻回報乾淨 → 是漏看，不是真的乾淨
      if (alwaysWatermarked) return null
      // 來源圖多半只有 800px 寬（電擊、PR TIMES 都是），quality 82 壓完
      // 220KB → 44KB，放到內文的容器寬度就明顯糊掉。改成 92 並把上限拉到
      // 1600 —— withoutEnlargement 保證不會把小圖硬撐大，只是不再多壓一手
      // 先縮到最終尺寸再蓋浮水印 —— 字級是照圖寬算的，順序反了字會跟著縮
      const resized = await sharp(buf).resize(1600, null, { withoutEnlargement: true }).toBuffer()
      const webp = await sharp(await stampUrlWatermark(resized)).webp({ quality: 92 }).toBuffer()
      const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
      return await r2Upload(key, webp, 'image/webp')
    }

    // 內文圖有浮水印就丟掉，不蓋也不複驗（省一次視覺呼叫）
    if (role === 'body') return null

    const branded = await brandCoverImage(buf, found)
    if (!branded) return null
    // 蓋完再驗一次：還看得到就是沒蓋乾淨（挑錯角、或浮水印比白墊大）
    if (!await verifyBrandedClean(branded, sourceUrl || imgUrl, box)) return null
    // 複驗過了才蓋自家網址：滿版文字會讓那道視覺複驗整張判成髒的
    const stamped = await sharp(await stampUrlWatermark(branded)).jpeg({ quality: 88 }).toBuffer()
    const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-gg.jpg`
    return await r2Upload(key, stamped, 'image/jpeg')
  } catch { return null }
}


/**
 * 標題分類 —— 比 Claude 的答案優先
 *
 * 「《直到你死去的那一天》一番賞登場！」被標成轉蛋（news id 26078565）：
 * 那篇從電擊ホビー（DIRECT_FEEDS，來源提示 figure）進來，Claude 回 gacha，
 * 而原本的規則是「只要 Claude 回的不是 toy 就照收」，所以沒人攔。
 *
 * 標題直接寫了品類的，那就是最強的訊號，不需要模型判斷 ——
 * 一篇標題有「一番賞」的文章不會是轉蛋新聞。順序照專一性排：
 * 一番賞 > 卡牌 > 轉蛋 > 盒玩（一番賞新聞常同時提到轉蛋與景品，先攔的贏）。
 *
 * 只吃標題、不吃內文：內文順帶提一句「同系列也有一番くじ」很常見，
 * 拿全文比對反而會把轉蛋新聞誤判成一番賞。
 */
function classifyByTitle(title: string): string | null {
  if (!title) return null
  if (/一番賞|一番くじ|ichiban ?kuji/i.test(title)) return 'ichiban'
  if (/ポケモンカード|ポケカ|遊戯王|遊戲王|デュエマ|デュエル・?マスターズ|ヴァイスシュヴァルツ|カードゲーム|トレカ|卡牌|卡包|新弾|新彈|TCG/i.test(title)) return 'tcg'
  if (/ガシャポン|ガチャポン|カプセルトイ|扭蛋|轉蛋/.test(title)) return 'gacha'
  if (/ブラインドボックス|盲盒|盒玩|ポップマート|POP ?MART|食玩/i.test(title)) return 'toy'
  return null
}

// Claude 回 general 時的關鍵字兜底分類
function classifyByKeywords(text: string): string | null {
  if (/一番賞|一番くじ/.test(text)) return 'ichiban'
  if (/ガシャポン|ガチャ|カプセル|扭蛋|轉蛋/.test(text)) return 'gacha'
  if (/ポケモンカード|ポケカ|遊戯王|デュエマ|ヴァイス|カードゲーム|卡牌|TCG|新弾/i.test(text)) return 'tcg'
  if (/景品|プライズ|フィギュア|公仔|手辦|模型|Figuarts|ROBOT魂|ねんどろいど|黏土人/i.test(text)) return 'figure'
  if (/ブラインドボックス|盲盒|盒玩|ポップマート|POP ?MART|食玩|ソフビ|軟膠|周邊|グッズ/i.test(text)) return 'toy'
  return null
}

/**
 * 三條取材路徑共用的最終分類。優先序：
 *   標題明講 > Claude 的判斷（非 toy）> 全文關鍵字 > 來源提示
 */
function pickCategory(
  draft: { category?: string; title?: string; tags?: string[] },
  titles: (string | undefined)[],
  fallback: string,
): string {
  for (const t of titles) {
    const byTitle = classifyByTitle(t ?? '')
    if (byTitle) return byTitle
  }
  if (draft.category && draft.category !== 'toy') return draft.category
  return classifyByKeywords(`${draft.title ?? ''} ${titles.join(' ')} ${(draft.tags ?? []).join(',')}`) ?? fallback
}

const BLOCKED_IMG_DOMAINS = [
  'google.com', 'googleapis.com', 'googleusercontent.com',
  'gstatic.com', 'ggpht.com', 'lh3.google', 'lh4.google',
  'news.google.', 'encrypted-tbn', 'facebook.com/images', 'fbcdn.net',
]

function resolveImageUrl(imgUrl: string, pageUrl: string): string {
  if (!imgUrl) return ''
  if (imgUrl.startsWith('data:')) return ''
  if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
    if (BLOCKED_IMG_DOMAINS.some(d => imgUrl.includes(d))) return ''
    return imgUrl
  }
  try { return new URL(imgUrl, pageUrl).href } catch { return '' }
}

// Jina Reader API — 繞過反爬蟲，返回 Markdown（含圖片 URL）
async function fetchViaJina(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': UA,
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
      },
    })
    if (res.ok) return await res.text()
  } catch {
    // fetch 失敗，回傳空字串
  }
  return ''
}

// 從 Jina Markdown 提取第一張有效圖片
function extractImageFromJina(jinaText: string, pageUrl: string): string {
  // 格式: ![alt](url) 或 Image: url
  const patterns = [
    /!\[[^\]]*\]\((https?:\/\/[^)\s]{10,})\)/g,
    /Image:\s*(https?:\/\/\S+)/g,
    /Cover Image:\s*(https?:\/\/\S+)/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(jinaText)) !== null) {
      const url = m[1].replace(/[)>\s]+$/, '')
      if (!url || BLOCKED_IMG_DOMAINS.some(d => url.includes(d))) continue
      if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) || url.includes('img') || url.includes('image') || url.includes('photo')) {
        return resolveImageUrl(url, pageUrl) || url
      }
    }
  }
  return ''
}

// Google News link → 실제 기사 URL（follow redirect）
async function resolveGoogleLink(googleUrl: string): Promise<string> {
  try {
    const res = await fetch(googleUrl, {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    })
    return res.url !== googleUrl ? res.url : googleUrl
  } catch { return googleUrl }
}

// ─── 圖片下載至 R2 ───────────────────────────────────────────────────────────

async function downloadImageToR2(imgUrl: string): Promise<string | null> {
  // 嘗試多種 Referer 策略繞過 hotlink 保護
  const origin = (() => { try { return new URL(imgUrl).origin } catch { return '' } })()
  const strategies: Record<string, string>[] = [
    { 'Referer': origin, 'Origin': origin },
    { 'Referer': imgUrl },
    {},
  ]

  for (const extraHeaders of strategies) {
    try {
      const res = await fetch(imgUrl, {
        headers: {
          'User-Agent': UA,
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'ja,zh-TW;q=0.9,en;q=0.7',
          'Cache-Control': 'no-cache',
          ...extraHeaders,
        },
        signal: AbortSignal.timeout(12_000),
        redirect: 'follow',
      })
      if (!res.ok) continue
      const ct = res.headers.get('content-type') ?? ''
      // 接受 image/* 以及未明確 content-type 但確實為圖片的情況
      if (ct && !ct.startsWith('image/') && !ct.startsWith('application/octet-stream')) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 3_000) continue  // 排除 tracking pixel（降至 3KB）
      // 嘗試從 magic bytes 判斷副檔名
      const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8
      const isPng  = buf[0] === 0x89 && buf[1] === 0x50
      const isWebp = buf.slice(8, 12).toString() === 'WEBP'
      const isGif  = buf.slice(0, 3).toString() === 'GIF'
      const ext = isJpeg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : isGif ? 'gif' : 'jpg'
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
      const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const uploaded = await r2Upload(key, buf, contentType)
      if (uploaded) return uploaded
    } catch { continue }
  }
  return null
}

// ─── Claude 改寫 ─────────────────────────────────────────────────────────────

interface ArticleDraft {
  title:    string
  summary:  string
  content:  string
  tags:     string[]
  category: string
}

async function rewriteArticle(
  claude: Anthropic,
  rssTitle: string,
  rssDesc: string,
  articleBody: string,
  sourceUrl: string,
  defaultCategory: string,
): Promise<ArticleDraft | null> {
  const combined = [rssTitle, rssDesc, articleBody].filter(Boolean).join('\n').slice(0, 2000)
  if (!combined.trim()) return null

  const resp = await claude.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: `你是吉吉比（GGB）台灣線上轉蛋平台的內容編輯，負責篩選「商品發售情報」。

原始資訊：
${combined}

來源：${sourceUrl}
預設分類：${defaultCategory}

【嚴格篩選原則】
只接受以下類型，其他一律回傳 null：
✅ 新商品發售消息（轉蛋/一番賞/盒玩/卡牌/扭蛋/公仔景品 新品上市、預售、到貨）
✅ 商品情報曝光（新品圖片首公開、品項公開）
✅ 聯名商品、限定版發售情報

直接 null 的情況（不接受）：
❌ 實體店鋪開幕、搬遷、促銷活動
❌ 公司業績、經營新聞、股價、授權合作消息
❌ 錦標賽、大會、比賽結果（除非是新卡牌發售）
❌ 玩家開箱、抽卡開箱心得
❌ 市場分析、產業報告
❌ 商品已停售、絕版回憶文

【重寫要求 —— 務必遵守】
標題與內文都必須是**你自己重新撰寫的原創文字**，不可整句照抄原文。
來源若已是繁體中文（如玩具人、巴哈 GNN），更要留意：
請用不同的句型與敘述順序重組，不可只改幾個字就當作改寫。
商品名稱、品牌、系列名、發售日期、價格等事實資訊必須忠實保留，
但描述、評論、鋪陳一律用自己的話寫。

【假名一律不留】標題與內文都不可出現平假名或片假名。台灣讀者看不懂
「ゾイド」「ズゴック」「ムチュート」「デク」這種字，看到只會直接跳過。
處理方式：
- 有台灣官方譯名就用官方譯名（ゾイド→索斯機獸、ズゴック→茲寇克、デク→出久）
- 沒有官方譯名但有官方英文/羅馬字就用英文（萬代的產品線名如 MASTERLISE、
  ichiban kuji 的英文標示等，台灣玩家本來就用英文搜尋）
- 兩者都沒有就音譯成中文
英文與數字可以保留，那不影響閱讀。

通過篩選後，改寫成繁體中文（台灣用語），輸出 JSON，只輸出 JSON 不加說明：
{
  "title": "吸引台灣玩家點擊的標題（繁體中文，25字以內，含商品名）",
  "summary": "一句話摘要，說明什麼商品、何時發售或上市（40字以內）",
  "content": "<h2>小標</h2><p>段落...</p><h2>小標</h2><p>段落...</p>（繁體中文，550-750字，4~5段並用 2~3 個 <h2> 分段，從玩家視角介紹：商品特色與造型細節、系列背景或角色亮點、發售與預購資訊、值得入手的理由；資訊不足處以既有內容延伸描述，不可捏造價格或日期）",
  "tags": ["品牌","系列名","類型"],
  "category": "ichiban|gacha|tcg|figure|toy（figure＝公仔/景品/模型/プライズ；toy＝盒玩/盲盒/食玩/周邊商品/軟膠/展會；分不出來就用 toy。標題或內文寫明「一番賞／一番くじ」一律 ichiban，寫明卡牌／新彈／TCG 一律 tcg —— 這兩類不可退回 figure 或 gacha）"
}

若不符合篩選條件，直接回傳：null`,
    }],
  })

  const text = (resp.content[0] as any)?.text?.trim() ?? ''
  if (text === 'null' || !text) return null
  const m = text.match(/\{[\s\S]+\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) as ArticleDraft }
  catch { return null }
}

// ─── 標題相似度去重 ──────────────────────────────────────────────────────────

// 把標題拆成 CJK 單字 + 英數詞，過濾掉短於 2 字的助詞雜訊
function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[！？。、，【】「」『』《》〈〉・\-\s]+/g, ' ')
      .split(' ')
      .filter(t => t.length >= 2)
  )
}

// Jaccard 相似度：兩組 token 交集 / 聯集
function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  const inter = [...a].filter(t => b.has(t)).length
  const union  = new Set([...a, ...b]).size
  return inter / union
}

// ─── AI 留言生成 + 時間分布植入 ─────────────────────────────────────────────

const CATEGORY_TONE: Record<string, string> = {
  ichiban:  '一番賞景品，語氣可以興奮、期待、或喊衝',
  gacha:    '扭蛋/轉蛋商品，語氣可以可愛、期待、或問哪裡買',
  toy:      '盒玩/盲盒/食玩/周邊商品，語氣可以可愛、驚喜、或分享收藏心情',
  tcg:      '集換式卡牌，語氣可以討論強度、卡圖、或問價格',
  figure:   '公仔景品/模型，語氣可以讚嘆做工、討論比例、或喊要收',
  // 舊分類值保留對照，避免既有文章取不到語氣設定
  blindbox: '盒玩/盲盒商品，語氣可以可愛、驚喜、或分享收藏心情',
  general:  '周邊商品情報，語氣自然，依內容決定',
}

async function generateAndSeedComments(
  supabase: ReturnType<typeof import('@/lib/supabaseAdmin').getSupabaseAdmin>,
  claude: import('@anthropic-ai/sdk').default,
  newsId: string,
  title: string,
  summary: string,
  category: string,
): Promise<void> {
  try {
    // 防止重複種（若已有留言則跳過）
    const { count } = await supabase
      .from('news_comments')
      .select('*', { count: 'exact', head: true })
      .eq('news_id', newsId)
    if (count && count > 0) return

    const tone = CATEGORY_TONE[category] ?? CATEGORY_TONE.general
    const n    = 3 + Math.floor(Math.random() * 3) // 3~5 則
    const negCount = Math.random() < 0.7 ? 1 : 0  // 70% 機率有 1 則負面/酸民留言

    const msg = await claude.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content:
`你是台灣社群上各種類型的用戶混合體。根據以下文章，用台灣網友口吻寫 ${n} 則留言。

規則：
- 繁體中文，可加少量 emoji（最多 1 則加 emoji，其他不要加）
- 文章類型：${tone}
- 字數極短：絕大多數 1~8 個字元（如「好想要」「哇」「先等等」「有點貴」「衝了」「太可愛了」），偶爾 1 則最多 15 字元
- 不要寫完整句子，只寫短感嘆或反應
- 不要直接複製標題文字
- 必須包含 ${negCount} 則負面/酸民留言（如「沒興趣」「普通」「又貴了」「買不起」「太醜了」「早知道」「差評」「騙人的」），其他則正面或中性
- 只回傳 JSON array of strings，不含任何其他說明文字

標題：${title}
摘要：${summary.slice(0, 200)}`
      }]
    })

    const raw      = ((msg.content[0] as { text?: string }).text ?? '').trim()
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return
    const comments: string[] = JSON.parse(jsonMatch[0])
    if (!Array.isArray(comments) || comments.length === 0) return

    // 取隨機 bot 用戶
    const { data: bots } = await supabase
      .from('users')
      .select('id')
      .eq('is_bot', true)
      .limit(30)
    if (!bots?.length) return

    const shuffled = [...bots].sort(() => Math.random() - 0.5)
    const maxHours = 8 * 60 * 60 * 1000 // 8 小時分布

    // 生成並按時間排序（讓留言看起來是陸續出現的）
    const rows = comments
      .slice(0, Math.min(comments.length, shuffled.length))
      .map((content, i) => ({
        news_id:    newsId,
        user_id:    shuffled[i].id,
        content:    String(content).slice(0, 200),
        created_at: new Date(Date.now() - Math.random() * maxHours).toISOString(),
      }))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    await supabase.from('news_comments').insert(rows)
  } catch (err) {
    console.error('[news-agent] AI comment seed error:', err)
  }
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const claude   = createClaude('news-agent', process.env.ANTHROPIC_API_KEY)

  // 已寫入的 source_url 集合（防重複 URL）
  const { data: existingRows } = await supabase
    .from('news')
    .select('source_url, title, created_at, image_url, category')
    .not('source_url', 'is', null)
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
  const existing      = new Set((existingRows ?? []).map((r: any) => r.source_url as string))
  // 近 7 天標題的 token set，用於主題去重
  const recentTitles  = (existingRows ?? [])
    .filter((r: any) => new Date(r.created_at ?? 0).getTime() > Date.now() - 7 * 86400_000)
    .map((r: any) => tokenize(r.title ?? ''))
  // 歷史上成功抓到圖片的來源域名（優先處理）
  const trustedDomains = new Set(
    (existingRows ?? [])
      .filter((r: any) => r.image_url)
      .map((r: any) => { try { return new URL(r.source_url).hostname } catch { return '' } })
      .filter(Boolean)
  )
  // 本次 session 已寫入的標題也加入比對（防止同一次跑多篇同主題）
  const sessionTitles: Set<string>[] = []

  function isDuplicateTopic(newTitle: string): boolean {
    const tokens = tokenize(newTitle)
    return [...recentTitles, ...sessionTitles].some(t => jaccardSim(tokens, t) >= 0.55)
  }

  /**
   * 改寫「之前」先用來源標題擋掉重複主題
   *
   * 原本只在改寫後比對重寫標題，等於重複文章已經燒掉一次 Claude 呼叫。
   * 來源標題與既有文章高度重疊時直接跳過，不進改寫流程。
   * 門檻放寬到 0.45：來源標題與我方改寫後的標題本就不會完全一致，
   * 太嚴會擋不掉；真的誤擋也還有後面的正式比對兜底。
   */
  function isDuplicateSource(rawTitle: string): boolean {
    if (!rawTitle) return false
    const tokens = tokenize(rawTitle)
    if (tokens.size === 0) return false
    return [...recentTitles, ...sessionTitles].some(t => jaccardSim(tokens, t) >= 0.45)
  }

  const body = await req.json().catch(() => ({}))
  const limitOverride: number | undefined = typeof body?.limit === 'number' ? body.limit : undefined

  const results = { written: 0, skipped: 0, errors: 0, articles: [] as string[], skipReasons: { duplicate: 0, noHtml: 0, noImage: 0, claudeReject: 0, titleDup: 0, insertErr: 0, wmUnsafe: 0, logoCover: 0, catQuota: 0, selfPromo: 0, adLeak: 0 } }
  const DEADLINE     = Date.now() + 240_000  // 最多跑 4 分鐘
  const MAX_TOTAL    = limitOverride ?? 3    // 每次全局上限（手動觸發可傳 limit:1）
  const MAX_PER_QUERY = limitOverride === 1 ? 1 : 2

  /**
   * 分類配額 —— 一番賞與卡牌長期掛零的原因
   *
   * 來源是照「HTML → DIRECT_FEEDS → Google News」的順序跑，寫滿 MAX_TOTAL 就 break。
   * 而 DIRECT_FEEDS 四個（PR TIMES／電擊／Animate／巴哈）**來源分類全是 figure**，
   * 一番賞與卡牌只存在於最後那組 Google News 查詢裡 —— 前面兩組先把 3 篇的額度用完，
   * 那組查詢等於從來沒跑到。近 14 天實際比例：figure 95、toy 28、gacha 28、
   * ichiban 2、tcg 2。不是抓不到，是根本沒輪到。
   *
   * 兩件事一起做：
   *   1. 同一分類一次最多 1 篇（3 篇＝三個不同分類），figure 吃不完整場
   *   2. Google News 查詢照「近 7 天誰最少」排序 —— 不寫死輪值表，DB 就是進度表
   */
  const CATEGORIES = ['ichiban', 'tcg', 'gacha', 'figure', 'toy']
  const countSince = (ms: number) => {
    const out: Record<string, number> = {}
    for (const r of (existingRows ?? []) as any[]) {
      if (new Date(r.created_at ?? 0).getTime() < Date.now() - ms) continue
      const c = String(r.category ?? 'toy')
      out[c] = (out[c] ?? 0) + 1
    }
    return out
  }
  const last24h = countSince(86400_000)
  const last7d  = countSince(7 * 86400_000)

  // 排序看近 24 小時（當天輪替），同分再看近 7 天（長期落後的先補）
  const categoryRank = new Map(
    [...CATEGORIES]
      .sort((a, b) =>
        ((last24h[a] ?? 0) - (last24h[b] ?? 0)) || ((last7d[a] ?? 0) - (last7d[b] ?? 0))
      )
      .map((c, i) => [c, i] as const)
  )

  /**
   * 兩層額度：
   *   單次   —— 一次 3 篇，同分類最多 1 篇 → 一次跑出三個不同分類
   *   單日   —— 一天 4 次共 12 篇要分給 5 類（12 ÷ 5 ≈ 2.4），任一類近 24 小時
   *              滿 3 篇就讓位，把剩下的次數讓給還沒補到的分類
   *
   * 走一天看得出效果：前三次各拿 toy／figure／一個稀缺分類，第四次 toy 與 figure
   * 都滿 3 篇被擋下，整場讓給 Google News 那組查詢（一番賞／卡牌／轉蛋都在那裡），
   * 一天收斂成 3/3/2/2/2。手動觸發（帶 limit）不套單日上限，否則測試時可能一篇都寫不出來。
   */
  const DAILY_PER_CATEGORY = 3
  const MAX_PER_CATEGORY = Math.max(1, Math.ceil(MAX_TOTAL / 3))
  const catWritten: Record<string, number> = {}
  const quotaFull = (c: string) =>
    (catWritten[c] ?? 0) >= MAX_PER_CATEGORY ||
    (limitOverride === undefined && (last24h[c] ?? 0) + (catWritten[c] ?? 0) >= DAILY_PER_CATEGORY)

  const runHtmlSources = async () => {
    for (const src of HTML_SOURCES) {
      if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

      const listHtml = await fetchText(src.url, 10_000)
      if (!listHtml) { results.errors++; continue }

      for (const realUrl of extractToyPeopleLinks(listHtml).slice(0, 8)) {
        if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break
        if (existing.has(realUrl)) { results.skipped++; results.skipReasons.duplicate++; continue }

        const articleHtml = await fetchText(realUrl, 10_000)
        if (!articleHtml) { results.skipped++; results.skipReasons.noHtml++; continue }

        const ogImage = resolveImageUrl(extractOgImage(articleHtml), realUrl)
                     || resolveImageUrl(extractBodyImage(articleHtml), realUrl)
        if (!ogImage) { results.skipped++; results.skipReasons.noImage++; continue }
        // 站方拿自家 logo 當 og:image → 這篇不發，換下一篇（老闆指定）
        if (!(await isUsableCover(ogImage))) { results.skipped++; results.skipReasons.logoCover++; continue }

        const title = extractMeta(articleHtml, 'og:title') || ''
        const desc  = extractMeta(articleHtml, 'og:description') || ''
        const bodyText = articleHtml
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ').trim()
          .slice(0, 1500)

        if (isDuplicateSource(title)) { results.skipped++; results.skipReasons.titleDup++; continue }
        if (quotaFull(classifyByTitle(title) ?? src.category)) { results.skipped++; results.skipReasons.catQuota++; continue }

        const draft = await rewriteArticle(claude, title, desc, bodyText, realUrl, src.category)
        if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }
        if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

        // 每張圖都驗浮水印，轉存不成功就整篇不發（老闆規則：百分之百不要
        // 看到別人的 logo）。原本會退回 ogImage hotlink —— 那等於把沒驗過的
        // 原圖直接端到玩家面前，是這條路最後一個漏洞
        const seenImages = new Set<string>()
        const hostedCover = await downloadSmartToR2(ogImage, false, realUrl, seenImages)
        if (!hostedCover) { results.skipped++; results.skipReasons.wmUnsafe++; continue }
        const imageUrl = hostedCover
        // 玩具人是直接解析列表頁抓連結，沒有 RSS 可退，articleHtml 抓不到就沒有內文圖
        const contentWithImages = await injectBodyImages(draft.content, articleHtml, ogImage, realUrl, false, seenImages)
        const finalCategory = pickCategory(draft, [draft.title, title], src.category)

        const id = Math.floor(10000000 + Math.random() * 90000000).toString()
        const { error } = await supabase.from('news').insert({
          id, title: draft.title, summary: draft.summary, content: contentWithImages,
          image_url: imageUrl, source_url: realUrl,
          category: finalCategory, tags: draft.tags ?? [], is_active: !!imageUrl,
        })
        if (!error) {
          results.written++
          catWritten[finalCategory] = (catWritten[finalCategory] ?? 0) + 1
          results.articles.push(`[${src.label}] ${draft.title}`)
          existing.add(realUrl)
          sessionTitles.push(tokenize(draft.title))
          await generateAndSeedComments(supabase, claude, id, draft.title, draft.summary, finalCategory)
          void supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).then(null, () => {})
          await new Promise(r => setTimeout(r, 300))
        } else {
          results.errors++; results.skipReasons.insertErr++
          console.error('[news-agent] insert error:', error.message)
        }
      }
    }
  }

  /**
   * oneone 宇宙 —— 繁中來源，圖是廠商官方原圖（老闆 2026-08-29 指定）
   *
   * 流程跟其他來源一樣，多了四道只有這個來源需要的關卡（理由見檔案上方
   * ONEONE_FEED 那段的說明）：
   *   1. 標題出現 oneone → 那是他們自家平台公告，不是商品情報
   *   2. 分類掛到 線上抽／集團動態 → 同上
   *   3. 封面**只認 upload/featured/**，og:image 不合就跳過，
   *      不退回掃 <img>（掃到的第一張很可能是紅底商城 banner）
   *   4. 改寫完再比對一次商城字樣，還留著就整篇不發
   */
  const runOneOne = async () => {
    if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) return

    const xml = await fetchText(ONEONE_FEED, 12_000)
    if (!xml) { results.errors++; return }

    for (const item of parseRss(xml).slice(0, ONEONE_SCAN)) {
      if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

      const realUrl = item.link
      if (!realUrl || existing.has(realUrl)) { results.skipped++; results.skipReasons.duplicate++; continue }
      // 他們自家平台的公告（「oneone LITE 快抽選開幕」那種）從標題就擋掉，省一趟 fetch
      if (ONEONE_AD_RE.test(item.title)) { results.skipped++; results.skipReasons.selfPromo++; continue }
      if (isDuplicateSource(item.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

      const articleHtml = await fetchText(realUrl, 12_000)
      if (!articleHtml) { results.skipped++; results.skipReasons.noHtml++; continue }
      if (oneOneCategoryIds(articleHtml).some(id => ONEONE_SKIP_CATEGORY.has(id))) {
        results.skipped++; results.skipReasons.selfPromo++; continue
      }

      const ogImage = extractOgImage(articleHtml)
      if (!isOneOneCoverUrl(ogImage)) { results.skipped++; results.skipReasons.noImage++; continue }
      if (!(await isUsableCover(ogImage))) { results.skipped++; results.skipReasons.logoCover++; continue }

      const srcCategory = oneOneCategory(articleHtml, 'toy')
      if (quotaFull(classifyByTitle(item.title) ?? srcCategory)) { results.skipped++; results.skipReasons.catQuota++; continue }

      const bodyText = oneOneBodyText(articleHtml)
      const draft = await rewriteArticle(claude, item.title, item.description, bodyText, realUrl, srcCategory)
      if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }
      if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }
      // 改寫後複驗：對手商城字樣一句都不能漏到我們的情報頁
      if ([draft.title, draft.summary, draft.content].some(t => ONEONE_AD_RE.test(t ?? ''))) {
        results.skipped++; results.skipReasons.adLeak++; continue
      }

      const seenImages = new Set<string>()
      const hostedCover = await downloadSmartToR2(ogImage, false, realUrl, seenImages)
      if (!hostedCover) { results.skipped++; results.skipReasons.wmUnsafe++; continue }
      const contentWithImages = await injectBodyImages(
        draft.content, articleHtml, ogImage, realUrl, false, seenImages, extractOneOneBodyImages,
      )
      const finalCategory = pickCategory(draft, [draft.title, item.title], srcCategory)

      const id = Math.floor(10000000 + Math.random() * 90000000).toString()
      const { error } = await supabase.from('news').insert({
        id, title: draft.title, summary: draft.summary, content: contentWithImages,
        image_url: hostedCover, source_url: realUrl,
        category: finalCategory, tags: draft.tags ?? [], is_active: !!hostedCover,
      })
      if (!error) {
        results.written++
        catWritten[finalCategory] = (catWritten[finalCategory] ?? 0) + 1
        results.articles.push(`[oneone] ${draft.title}`)
        existing.add(realUrl)
        sessionTitles.push(tokenize(draft.title))
        await generateAndSeedComments(supabase, claude, id, draft.title, draft.summary, finalCategory)
        void supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).then(null, () => {})
        await new Promise(r => setTimeout(r, 300))
      } else {
        results.errors++; results.skipReasons.insertErr++
        console.error('[news-agent] insert error:', error.message)
      }
    }
  }

  const runDirectFeeds = async () => {
    for (const feed of DIRECT_FEEDS) {
      if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

      const xml = await fetchText(feed.url)
      if (!xml) { results.errors++; continue }

      const rawItems = parseRss(xml).filter(it => isRecent(it.pubDate, 3)) // 只抓 3 天內
      const items = rawItems.sort((a, b) => {
        const da = (() => { try { return new URL(a.link).hostname } catch { return '' } })()
        const db = (() => { try { return new URL(b.link).hostname } catch { return '' } })()
        return (trustedDomains.has(db) ? 1 : 0) - (trustedDomains.has(da) ? 1 : 0)
      })
      for (const item of items) {
        if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

        const realUrl = item.link
        if (!realUrl || existing.has(realUrl)) { results.skipped++; results.skipReasons.duplicate++; continue }
        // 配額檢查放在抓文章之前 —— RSS 標題就足夠判斷，額度滿了不必付一趟 fetch
        if (quotaFull(classifyByTitle(item.title) ?? feed.category)) { results.skipped++; results.skipReasons.catQuota++; continue }

        const articleHtml = await fetchText(realUrl, 15_000)
        let ogImage = articleHtml
          ? (resolveImageUrl(extractOgImage(articleHtml), realUrl) || resolveImageUrl(extractBodyImage(articleHtml), realUrl))
          : resolveImageUrl(item.rssImage, realUrl)
        let jinaText = ''
        if (!ogImage) {
          jinaText = await fetchViaJina(realUrl)
          if (jinaText) ogImage = extractImageFromJina(jinaText, realUrl)
        }
        // 沒有真實圖片 → 直接跳過，不呼叫 Claude，省 token
        if (!ogImage) { results.skipped++; results.skipReasons.noImage++; continue }
        // 站方拿自家 logo 當 og:image → 這篇不發，換下一篇（老闆指定）
        if (!(await isUsableCover(ogImage))) { results.skipped++; results.skipReasons.logoCover++; continue }

        const bodyText = articleHtml
          ? articleHtml
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ').trim()
              .slice(0, 1500)
          : (jinaText || item.description).slice(0, 1500)

        if (isDuplicateSource(item.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

        const draft = await rewriteArticle(claude, item.title, item.description, bodyText, realUrl, feed.category)
        if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }
        if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

        const isWatermarked = WATERMARKED_SOURCES.some(d => realUrl.includes(d) || ogImage.includes(d))
        // 封面與內文圖共用同一條路徑：每張都用 Claude 視覺驗浮水印，
        // 有就蓋 GGB logo 再驗一次確認蓋乾淨了
        // 同一篇文章共用一份已處理清單，封面先進去，內文圖就不會重複處理同一張
        const seenImages = new Set<string>()
        const hostedCover = await downloadSmartToR2(ogImage, isWatermarked, realUrl, seenImages)
        // 轉存不成功 = 沒驗過或沒蓋乾淨 → 整篇不發，不退回原圖 hotlink
        if (!hostedCover) { results.skipped++; results.skipReasons.wmUnsafe++; continue }
        const imageUrl = hostedCover
        const finalCategory = pickCategory(draft, [draft.title, item.title], feed.category)
        const id = Math.floor(10000000 + Math.random() * 90000000).toString()
        // 內文配圖。這條路徑（DIRECT_FEEDS：電擊ホビー / PR TIMES / Animate Times）
        // 原本完全沒有這一步 —— 另外兩條有，只有這條漏了。
        // 而 485 篇文章裡有 359 篇是走這條進來的，所以「內文都沒有圖」看起來像
        // 功能沒做，其實是主力來源那條路徑根本沒接上。
        // articleHtml 抓不到就退回 RSS 的 content:encoded，跟 Google News 那條一致。
        const contentWithImages = await injectBodyImages(
          draft.content, articleHtml || item.rssHtml, ogImage, realUrl, isWatermarked, seenImages
        )

        const { error } = await supabase.from('news').insert({
          id, title: draft.title, summary: draft.summary, content: contentWithImages,
          image_url: imageUrl, source_url: realUrl,
          category: finalCategory, tags: draft.tags ?? [], is_active: !!imageUrl,
        })
        if (!error) {
          results.written++
          catWritten[finalCategory] = (catWritten[finalCategory] ?? 0) + 1
          results.articles.push(`[${feed.label}] ${draft.title}`)
          existing.add(realUrl); sessionTitles.push(tokenize(draft.title))
          await generateAndSeedComments(supabase, claude, id, draft.title, draft.summary, draft.category ?? feed.category)
          void supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).then(null, () => {})
        } else if (error.code === '23505') {
          results.skipped++; results.skipReasons.duplicate++
        } else {
          results.errors++
        }
        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  // ── Google News RSS ──────────────────────────────────────────────────────
  // 查詢也照缺稿程度排：一番賞／卡牌落後時，它們的查詢先跑
  const orderedQueries = [...RSS_QUERIES].sort(
    (a, b) => (categoryRank.get(a.category) ?? 99) - (categoryRank.get(b.category) ?? 99)
  )
  const runGoogleNews = async () => {
    for (const { q, category, locale } of orderedQueries) {
      if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

      const xml = await fetchText(rssUrl(q, locale))
      if (!xml) { results.errors++; continue }

      const rawItems = parseRss(xml).filter(it => isRecent(it.pubDate))
      // trusted domain 排前面
      const items = rawItems.sort((a, b) => {
        const da = (() => { try { return new URL(a.link).hostname } catch { return '' } })()
        const db = (() => { try { return new URL(b.link).hostname } catch { return '' } })()
        return (trustedDomains.has(db) ? 1 : 0) - (trustedDomains.has(da) ? 1 : 0)
      })
      let perQuery = 0

      for (const item of items) {
        if (Date.now() > DEADLINE || perQuery >= MAX_PER_QUERY || results.written >= MAX_TOTAL) break

        // 配額檢查在 resolve redirect 之前 —— 額度滿了不必付這趟 fetch
        if (quotaFull(classifyByTitle(item.title) ?? category)) { results.skipped++; results.skipReasons.catQuota++; continue }

        // Google News 的 link 是 redirect，先 resolve 到真實 URL
        const realUrl = await resolveGoogleLink(item.link)
        if (existing.has(realUrl) || existing.has(item.link)) { results.skipped++; results.skipReasons.duplicate++; continue }

        // 抓實際文章頁：取 og:image + body text（若 block 仍繼續用 RSS 資料）
        const articleHtml = await fetchText(realUrl, 15_000)
        let ogImage = articleHtml
          ? (resolveImageUrl(extractOgImage(articleHtml), realUrl) || resolveImageUrl(extractBodyImage(articleHtml), realUrl))
          : resolveImageUrl(item.rssImage, realUrl)
        let jinaText = ''
        if (!ogImage) {
          jinaText = await fetchViaJina(realUrl)
          if (jinaText) ogImage = extractImageFromJina(jinaText, realUrl)
        }
        // 沒有真實圖片 → 直接跳過，不呼叫 Claude，省 token
        if (!ogImage) { results.skipped++; results.skipReasons.noImage++; continue }
        // 站方拿自家 logo 當 og:image → 這篇不發，換下一篇（老闆指定）
        if (!(await isUsableCover(ogImage))) { results.skipped++; results.skipReasons.logoCover++; continue }

        const bodyText = articleHtml
          ? articleHtml
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ').trim()
              .slice(0, 1500)
          : (jinaText || item.description).slice(0, 1500)

        if (isDuplicateSource(item.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

        // Claude 改寫
        const draft = await rewriteArticle(
          claude, item.title, item.description, bodyText, realUrl, category
        )
        if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }

        // 標題相似度去重（同主題 Jaccard >= 0.55 視為重複）
        if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

        const isWatermarked = WATERMARKED_SOURCES.some(d => realUrl.includes(d) || ogImage.includes(d))
        // 封面與內文圖共用同一條路徑：每張都用 Claude 視覺驗浮水印，
        // 有就蓋 GGB logo 再驗一次確認蓋乾淨了
        // 同一篇文章共用一份已處理清單，封面先進去，內文圖就不會重複處理同一張
        const seenImages = new Set<string>()
        const hostedCover = await downloadSmartToR2(ogImage, isWatermarked, realUrl, seenImages)
        // 轉存不成功 = 沒驗過或沒蓋乾淨 → 整篇不發，不退回原圖 hotlink
        if (!hostedCover) { results.skipped++; results.skipReasons.wmUnsafe++; continue }
        const imageUrl = hostedCover
        const finalCategory = pickCategory(draft, [draft.title, item.title], category)

        // 內文配圖：從已抓過的文章 HTML 取 2 張（非封面），轉存 R2 後插在段落之間。
        // 不做圖片生成、不額外請求文章頁，成本只有 R2 儲存。
        // 文章頁抓不到就退回 RSS 的 content:encoded。
        // 電擊的文章頁常在 8 秒內回不來（160KB、三種 UA 都試過），
        // 封面因為有 item.rssImage 兜底所以看不出來，內文圖卻是直接整段放棄 ——
        // 489 篇裡只有 1 篇有內文圖就是這樣來的。
        const contentWithImages = await injectBodyImages(
          draft.content, articleHtml || item.rssHtml, ogImage, realUrl, isWatermarked, seenImages
        )

        const id = Math.floor(10000000 + Math.random() * 90000000).toString()
        const { error } = await supabase.from('news').insert({
          id,
          title:      draft.title,
          summary:    draft.summary,
          content:    contentWithImages,
          image_url:  imageUrl,
          source_url: realUrl,
          category:   finalCategory,
          tags:       draft.tags ?? [],
          is_active:  !!imageUrl,
        })

        if (!error) {
          results.written++
          catWritten[finalCategory] = (catWritten[finalCategory] ?? 0) + 1
          results.articles.push(draft.title)
          existing.add(realUrl)
          sessionTitles.push(tokenize(draft.title))  // 加入本次 session 比對池
          await generateAndSeedComments(supabase, claude, id, draft.title, draft.summary, draft.category ?? category)
          void supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).then(null, () => {})
          perQuery++
        } else if (error.code === '23505') {
          results.skipped++; results.skipReasons.duplicate++
        } else {
          console.error('[news-agent] insert error:', error.message)
          results.errors++
        }

        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  /**
   * 來源組的執行順序照「現在最缺哪一類」決定，不是寫死的。
   *
   * 原本永遠是 HTML → DIRECT_FEEDS → Google News，而前兩組只產得出 toy 與 figure，
   * 每次都先把 3 篇額度吃掉兩篇，一番賞／卡牌只能撿最後一格。
   * 現在每跑完一組就重排一次：哪一組供得出「目前最落後的分類」，哪一組先上。
   * cats 要照實列 —— Google News 沒有 figure 的查詢，寫進去它會永遠排第一。
   */
  const groups = [
    // oneone 供得出一番賞／扭蛋／公仔／盒玩四類，是目前唯一補得到 ichiban 的非 Google 來源
    { cats: ['ichiban', 'gacha', 'figure', 'toy'], run: runOneOne      },
    { cats: ['toy', 'figure'],                     run: runHtmlSources },
    { cats: ['figure'],                            run: runDirectFeeds },
    { cats: ['ichiban', 'tcg', 'gacha', 'toy'],    run: runGoogleNews  },
  ]
  const groupRank = (g: { cats: string[] }) => {
    const open = g.cats.filter(c => !quotaFull(c)).map(c => categoryRank.get(c) ?? 99)
    return open.length ? Math.min(...open) : 99   // 全滿的組排最後
  }
  while (groups.length > 0 && results.written < MAX_TOTAL && Date.now() < DEADLINE) {
    groups.sort((a, b) => groupRank(a) - groupRank(b))
    await groups.shift()!.run()
  }


  return NextResponse.json({ ok: true, ...results, byCategory: catWritten, last24h })
}
