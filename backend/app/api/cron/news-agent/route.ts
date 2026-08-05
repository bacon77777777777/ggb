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
import { brandCoverImage } from '@/lib/newsBranding'
import { detectWatermark, type WmCorner } from '@/lib/dengekiWm'
import { createClaude } from '@/lib/aiUsage'

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
// 圖片帶站方浮水印的來源：不用其圖，改用平台預設圖
const WATERMARKED_SOURCES = ['dengeki.com']
const DEFAULT_NEWS_IMAGE =
  `${(process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://www.ggb.com.tw').replace(/\/$/, '')}/images/banner_defaulet.png`


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
): Promise<string> {
  if (!content || !articleHtml) return content

  const candidates = extractBodyImages(articleHtml, 6)
    .map(u => resolveImageUrl(u, pageUrl))
    .filter(u => u && u !== coverUrl)
  if (candidates.length === 0) return content

  const hosted: string[] = []
  for (const u of candidates) {
    if (hosted.length >= 2) break
    // 逐張偵測：有浮水印就蓋 logo，沒有就原樣轉存
    const r = await downloadSmartToR2(u, forceBrand)
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
  return `<figure><img src="${url}" alt="" loading="lazy" /></figure>`
}

/**
 * 轉存到 R2，並在偵測到浮水印時蓋上 GGB logo
 *
 * 封面圖與內文圖共用同一條路徑：四個角落都做模板比對，偵測到浮水印才蓋 GGB logo，
 * 乾淨的圖原樣轉存，不會為了保險而亂蓋。
 * forceBrand 供已知帶浮水印的來源使用：即使偵測未達門檻也照蓋，避免漏網。
 * 只抓一次圖，偵測為本地模板比對，不產生額外費用。
 */
async function downloadSmartToR2(imgUrl: string, forceBrand = false): Promise<string | null> {
  try {
    const res = await fetch(imgUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 3_000) return null

    // 四個角落都比對；已知帶浮水印的來源即使偵測未達門檻也照蓋（用偵測到分數最高的角）
    const wm = await detectWatermark(buf)
    if (wm.found || forceBrand) {
      const branded = await brandCoverImage(buf, wm.corner)
      if (branded) {
        const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-gg.jpg`
        return await r2Upload(key, branded, 'image/jpeg')
      }
    }
    const webp = await sharp(buf).resize(1200, null, { withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
    return await r2Upload(key, webp, 'image/webp')
  } catch { return null }
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

通過篩選後，改寫成繁體中文（台灣用語），輸出 JSON，只輸出 JSON 不加說明：
{
  "title": "吸引台灣玩家點擊的標題（繁體中文，25字以內，含商品名）",
  "summary": "一句話摘要，說明什麼商品、何時發售或上市（40字以內）",
  "content": "<h2>小標</h2><p>段落...</p><h2>小標</h2><p>段落...</p>（繁體中文，550-750字，4~5段並用 2~3 個 <h2> 分段，從玩家視角介紹：商品特色與造型細節、系列背景或角色亮點、發售與預購資訊、值得入手的理由；資訊不足處以既有內容延伸描述，不可捏造價格或日期）",
  "tags": ["品牌","系列名","類型"],
  "category": "ichiban|gacha|tcg|figure|toy（figure＝公仔/景品/模型/プライズ；toy＝盒玩/盲盒/食玩/周邊商品/軟膠/展會；分不出來就用 toy）"
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
    .select('source_url, title, created_at, image_url')
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

  const results = { written: 0, skipped: 0, errors: 0, articles: [] as string[], skipReasons: { duplicate: 0, noHtml: 0, noImage: 0, claudeReject: 0, titleDup: 0, insertErr: 0 } }
  const DEADLINE     = Date.now() + 240_000  // 最多跑 4 分鐘
  const MAX_TOTAL    = limitOverride ?? 3    // 每次全局上限（手動觸發可傳 limit:1）
  const MAX_PER_QUERY = limitOverride === 1 ? 1 : 2

  // ── 直接 RSS 來源（PR TIMES / 電撃ホビー / Animate Times 等）────────────────
  // ── HTML 來源（無 RSS，解析列表頁）──────────────────────────
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

      const title = extractMeta(articleHtml, 'og:title') || ''
      const desc  = extractMeta(articleHtml, 'og:description') || ''
      const bodyText = articleHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').trim()
        .slice(0, 1500)

      if (isDuplicateSource(title)) { results.skipped++; results.skipReasons.titleDup++; continue }

      const draft = await rewriteArticle(claude, title, desc, bodyText, realUrl, src.category)
      if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }
      if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

      // 玩具人圖片無浮水印，仍走偵測式轉存（偵測到才蓋 logo）
      const imageUrl = (await downloadSmartToR2(ogImage)) ?? ogImage
      // 玩具人是直接解析列表頁抓連結，沒有 RSS 可退，articleHtml 抓不到就沒有內文圖
      const contentWithImages = await injectBodyImages(draft.content, articleHtml, ogImage, realUrl)
      const finalCategory = (draft.category && draft.category !== 'toy')
        ? draft.category
        : (classifyByKeywords(`${draft.title} ${title} ${(draft.tags ?? []).join(',')}`) ?? src.category)

      const id = Math.floor(10000000 + Math.random() * 90000000).toString()
      const { error } = await supabase.from('news').insert({
        id, title: draft.title, summary: draft.summary, content: contentWithImages,
        image_url: imageUrl, source_url: realUrl,
        category: finalCategory, tags: draft.tags ?? [], is_active: !!imageUrl,
      })
      if (!error) {
        results.written++
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
      // 封面與內文圖共用同一條路徑：四角比對，偵測到才蓋 logo；
      // 已知帶浮水印的來源即使未達門檻也照蓋
      const imageUrl = (await downloadSmartToR2(ogImage, isWatermarked))
        ?? (isWatermarked ? DEFAULT_NEWS_IMAGE : ogImage)
      const finalCategory = (draft.category && draft.category !== 'toy')
        ? draft.category
        : (classifyByKeywords(`${draft.title} ${item.title} ${(draft.tags ?? []).join(',')}`) ?? 'toy')
      const id = Math.floor(10000000 + Math.random() * 90000000).toString()
      const { error } = await supabase.from('news').insert({
        id, title: draft.title, summary: draft.summary, content: draft.content,
        image_url: imageUrl, source_url: realUrl,
        category: finalCategory, tags: draft.tags ?? [], is_active: !!imageUrl,
      })
      if (!error) {
        results.written++; results.articles.push(`[${feed.label}] ${draft.title}`)
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

  // ── Google News RSS ────────────────────────────────────────────────────────
  for (const { q, category, locale } of RSS_QUERIES) {
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
      // 封面與內文圖共用同一條路徑：四角比對，偵測到才蓋 logo；
      // 已知帶浮水印的來源即使未達門檻也照蓋
      const imageUrl = (await downloadSmartToR2(ogImage, isWatermarked))
        ?? (isWatermarked ? DEFAULT_NEWS_IMAGE : ogImage)
      const finalCategory = (draft.category && draft.category !== 'toy')
        ? draft.category
        : (classifyByKeywords(`${draft.title} ${item.title} ${(draft.tags ?? []).join(',')}`) ?? 'toy')

      // 內文配圖：從已抓過的文章 HTML 取 2 張（非封面），轉存 R2 後插在段落之間。
      // 不做圖片生成、不額外請求文章頁，成本只有 R2 儲存。
      // 文章頁抓不到就退回 RSS 的 content:encoded。
      // 電擊的文章頁常在 8 秒內回不來（160KB、三種 UA 都試過），
      // 封面因為有 item.rssImage 兜底所以看不出來，內文圖卻是直接整段放棄 ——
      // 489 篇裡只有 1 篇有內文圖就是這樣來的。
      const contentWithImages = await injectBodyImages(
        draft.content, articleHtml || item.rssHtml, ogImage, realUrl, isWatermarked
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

  return NextResponse.json({ ok: true, ...results })
}
