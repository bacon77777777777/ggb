/**
 * news-agent — 每小時從 Google News RSS 抓取最新
 * 一番賞/盒玩/盲盒/轉蛋/卡牌資訊，用 Claude 改寫成繁中，寫入 news 表（預設下架）。
 * 排程：每小時整點（UTC 0 * * * *）
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'
import { r2Upload } from '@/lib/r2'

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
  { q: '盒玩 發售 新品',      category: 'blindbox', locale: 'TW' },
  { q: '盲盒 新品 上市',      category: 'blindbox', locale: 'TW' },
  { q: '轉蛋 新品 發售',      category: 'gacha',    locale: 'TW' },
  { q: '卡牌 新彈 發售',      category: 'tcg',      locale: 'TW' },
  { q: '扭蛋 新商品',         category: 'gacha',    locale: 'TW' },
  // ── 日文（日本）
  { q: '一番くじ 新商品 発売',           category: 'ichiban',  locale: 'JP' },
  { q: '一番くじ 予約',                  category: 'ichiban',  locale: 'JP' },
  { q: 'バンダイ ガシャポン 新商品',     category: 'gacha',    locale: 'JP' },
  { q: 'ガシャポン 発売 予約',           category: 'gacha',    locale: 'JP' },
  { q: 'ブラインドボックス 新商品 発売', category: 'blindbox', locale: 'JP' },
  { q: 'ポップマート 新商品',            category: 'blindbox', locale: 'JP' },
  { q: 'ポケモンカード 新弾 発売',       category: 'tcg',      locale: 'JP' },
  { q: '遊戯王 OCG 新カード 発売',       category: 'tcg',      locale: 'JP' },
  { q: 'デュエルマスターズ 新弾',        category: 'tcg',      locale: 'JP' },
  // ── 英文（全球）
  { q: 'gashapon new product release 2026', category: 'gacha',    locale: 'US' },
  { q: 'Pokemon TCG new set 2026',          category: 'tcg',      locale: 'US' },
  { q: 'blind box figure new release',      category: 'blindbox', locale: 'US' },
  { q: 'Pop Mart new figure',               category: 'blindbox', locale: 'US' },
  { q: 'Yu-Gi-Oh OCG new card 2026',        category: 'tcg',      locale: 'US' },
]

// ── 直接 RSS 來源（非 Google News）──────────────────────────────────────────
const DIRECT_FEEDS: Array<{ url: string; category: string; label: string }> = [
  // PR TIMES ホビー・玩具カテゴリ（日本企業プレスリリース）
  { url: 'https://prtimes.jp/rss/category/17.rss',     category: 'general',  label: 'PRTimes-hobby' },
  // 電撃ホビーウェブ
  { url: 'https://hobby.dengeki.com/feed/',             category: 'general',  label: 'DengekiHobby' },
  // Animate Times
  { url: 'https://www.animatetimes.com/rss.xml',       category: 'general',  label: 'AnimateTimes' },
  // 巴哈姆特 GNN 遊戲動漫新聞（繁中）
  { url: 'https://gnn.gamer.com.tw/rss.xml',           category: 'general',  label: 'GNN-TW' },
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
    if (title && link) items.push({ title, link, description: desc, pubDate, source, rssImage })
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

// 將可能的相對路徑解析成絕對 URL；data: URI 或解析失敗回傳空字串
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
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `你是吉吉比（GGB）台灣線上轉蛋平台的內容編輯，負責篩選「商品發售情報」。

原始資訊：
${combined}

來源：${sourceUrl}
預設分類：${defaultCategory}

【嚴格篩選原則】
只接受以下類型，其他一律回傳 null：
✅ 新商品發售消息（轉蛋/一番賞/盒玩/卡牌/扭蛋 新品上市、預售、到貨）
✅ 商品情報曝光（新品圖片首公開、品項公開）
✅ 聯名商品、限定版發售情報

直接 null 的情況（不接受）：
❌ 實體店鋪開幕、搬遷、促銷活動
❌ 公司業績、經營新聞、股價、授權合作消息
❌ 錦標賽、大會、比賽結果（除非是新卡牌發售）
❌ 玩家開箱、抽卡開箱心得
❌ 市場分析、產業報告
❌ 商品已停售、絕版回憶文

通過篩選後，改寫成繁體中文（台灣用語），輸出 JSON，只輸出 JSON 不加說明：
{
  "title": "吸引台灣玩家點擊的標題（繁體中文，25字以內，含商品名）",
  "summary": "一句話摘要，說明什麼商品、何時發售或上市（40字以內）",
  "content": "<h2>小標</h2><p>段落...</p>（繁體中文，250-400字，2-3段，從玩家視角介紹商品特色與發售資訊）",
  "tags": ["品牌","系列名","類型"],
  "category": "ichiban|gacha|blindbox|tcg|general"
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

// ─── 主流程 ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

  const body = await req.json().catch(() => ({}))
  const limitOverride: number | undefined = typeof body?.limit === 'number' ? body.limit : undefined

  const results = { written: 0, skipped: 0, errors: 0, articles: [] as string[], skipReasons: { duplicate: 0, noHtml: 0, noImage: 0, claudeReject: 0, titleDup: 0, insertErr: 0 } }
  const DEADLINE     = Date.now() + 240_000  // 最多跑 4 分鐘
  const MAX_TOTAL    = limitOverride ?? 12   // 每次全局上限（手動觸發可傳 limit:1）
  const MAX_PER_QUERY = limitOverride === 1 ? 1 : 2

  // ── 直接 RSS 來源（PR TIMES / 電撃ホビー / Animate Times 等）────────────────
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

      const articleHtml = await fetchText(realUrl, 8_000)
      let ogImage = articleHtml
        ? (resolveImageUrl(extractOgImage(articleHtml), realUrl) || resolveImageUrl(extractBodyImage(articleHtml), realUrl))
        : resolveImageUrl(item.rssImage, realUrl)
      let jinaText = ''
      if (!ogImage) {
        jinaText = await fetchViaJina(realUrl)
        if (jinaText) ogImage = extractImageFromJina(jinaText, realUrl)
      }
      if (!ogImage) ogImage = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/images/banner_defaulet.png`

      const bodyText = articleHtml
        ? articleHtml
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ').trim()
            .slice(0, 1500)
        : (jinaText || item.description).slice(0, 1500)

      const draft = await rewriteArticle(claude, item.title, item.description, bodyText, realUrl, feed.category)
      if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }
      if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

      const imageUrl = (await downloadImageToR2(ogImage)) ?? ogImage
      const id = Math.floor(10000000 + Math.random() * 90000000).toString()
      const { error } = await supabase.from('news').insert({
        id, title: draft.title, summary: draft.summary, content: draft.content,
        image_url: imageUrl, source_url: realUrl,
        category: draft.category ?? feed.category, tags: draft.tags ?? [], is_active: true,
      })
      if (!error) {
        results.written++; results.articles.push(`[${feed.label}] ${draft.title}`)
        existing.add(realUrl); sessionTitles.push(tokenize(draft.title))
        supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).catch(() => {})
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
      const articleHtml = await fetchText(realUrl, 8_000)
      let ogImage = articleHtml
        ? (resolveImageUrl(extractOgImage(articleHtml), realUrl) || resolveImageUrl(extractBodyImage(articleHtml), realUrl))
        : resolveImageUrl(item.rssImage, realUrl)
      let jinaText = ''
      if (!ogImage) {
        jinaText = await fetchViaJina(realUrl)
        if (jinaText) ogImage = extractImageFromJina(jinaText, realUrl)
      }
      if (!ogImage) ogImage = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/images/banner_defaulet.png`

      const bodyText = articleHtml
        ? articleHtml
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ').trim()
            .slice(0, 1500)
        : (jinaText || item.description).slice(0, 1500)  // HTML 抓不到，用 Jina/RSS description

      // Claude 改寫
      const draft = await rewriteArticle(
        claude, item.title, item.description, bodyText, realUrl, category
      )
      if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }

      // 標題相似度去重（同主題 Jaccard >= 0.55 視為重複）
      if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

      // 下載圖片到 R2；失敗時 fallback 用外部 og:image URL（不因圖片問題跳過文章）
      const imageUrl = (await downloadImageToR2(ogImage)) ?? ogImage

      const id = Math.floor(10000000 + Math.random() * 90000000).toString()
      const { error } = await supabase.from('news').insert({
        id,
        title:      draft.title,
        summary:    draft.summary,
        content:    draft.content,
        image_url:  imageUrl,
        source_url: realUrl,
        category:   draft.category ?? category,
        tags:       draft.tags ?? [],
        is_active:  true,
      })

      if (!error) {
        results.written++
        results.articles.push(draft.title)
        existing.add(realUrl)
        sessionTitles.push(tokenize(draft.title))  // 加入本次 session 比對池
        supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).catch(() => {})
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
