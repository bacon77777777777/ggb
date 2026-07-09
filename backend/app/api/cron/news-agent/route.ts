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

// ─── Google News RSS 搜尋詞（中文 + 日文 + 英文，多語言廣覆蓋）─────────────
// 每次全局最多 8 篇，每詞最多 2 篇

type Locale = 'TW' | 'JP' | 'US'

const RSS_QUERIES: Array<{ q: string; category: string; locale: Locale }> = [
  // ── 繁體中文（台灣）—— 主力
  { q: '一番賞 發售',   category: 'ichiban',  locale: 'TW' },
  { q: '盒玩 發售',     category: 'blindbox', locale: 'TW' },
  { q: '盲盒 新品',     category: 'blindbox', locale: 'TW' },
  { q: '轉蛋 新品 發售', category: 'gacha',   locale: 'TW' },
  { q: '卡牌 新彈 發售', category: 'tcg',     locale: 'TW' },
  // ── 日文（日本）—— 商品情報主要來源
  { q: '一番くじ 新商品 発売',            category: 'ichiban',  locale: 'JP' },
  { q: 'ガシャポン 新商品 発売',          category: 'gacha',    locale: 'JP' },
  { q: 'ブラインドボックス 新商品',       category: 'blindbox', locale: 'JP' },
  { q: 'ポケモンカード 新弾 発売',        category: 'tcg',      locale: 'JP' },
  { q: '遊戯王 OCG 新カード 発売',        category: 'tcg',      locale: 'JP' },
  // ── 英文（全球）—— 補充英語圈資訊
  { q: 'gashapon new product release',  category: 'gacha',    locale: 'US' },
  { q: 'OCG new card release',          category: 'tcg',      locale: 'US' },
  { q: 'TCG new set announcement',      category: 'tcg',      locale: 'US' },
  { q: 'blind box new figure release',  category: 'blindbox', locale: 'US' },
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
    if (title && link) items.push({ title, link, description: desc, pubDate, source })
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
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8' },
    })
    return await res.text()
  } catch { return '' }
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
  try {
    const res = await fetch(imgUrl, {
      headers: { 'User-Agent': UA, 'Referer': new URL(imgUrl).origin },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.startsWith('image/')) return null   // 確保是圖片
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 10_000) return null         // 排除 favicon / icon / tracking pixel（真實文章圖 > 10KB）
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg'
    const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    return await r2Upload(key, buf, ct)
  } catch { return null }
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
    .select('source_url, title')
    .not('source_url', 'is', null)
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
  const existing      = new Set((existingRows ?? []).map((r: any) => r.source_url as string))
  // 近 7 天標題的 token set，用於主題去重
  const recentTitles  = (existingRows ?? [])
    .filter((r: any) => new Date(r.created_at ?? 0).getTime() > Date.now() - 7 * 86400_000)
    .map((r: any) => tokenize(r.title ?? ''))
  // 本次 session 已寫入的標題也加入比對（防止同一次跑多篇同主題）
  const sessionTitles: Set<string>[] = []

  function isDuplicateTopic(newTitle: string): boolean {
    const tokens = tokenize(newTitle)
    return [...recentTitles, ...sessionTitles].some(t => jaccardSim(tokens, t) >= 0.55)
  }

  const body = await req.json().catch(() => ({}))
  const limitOverride: number | undefined = typeof body?.limit === 'number' ? body.limit : undefined

  const results = { written: 0, skipped: 0, errors: 0, articles: [] as string[] }
  const DEADLINE     = Date.now() + 240_000  // 最多跑 4 分鐘
  const MAX_TOTAL    = limitOverride ?? 8    // 每次全局上限（手動觸發可傳 limit:1）
  const MAX_PER_QUERY = limitOverride === 1 ? 1 : 2

  for (const { q, category, locale } of RSS_QUERIES) {
    if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

    const xml = await fetchText(rssUrl(q, locale))
    if (!xml) { results.errors++; continue }

    const items = parseRss(xml).filter(it => isRecent(it.pubDate))
    let perQuery = 0

    for (const item of items) {
      if (Date.now() > DEADLINE || perQuery >= MAX_PER_QUERY || results.written >= MAX_TOTAL) break

      // Google News 的 link 是 redirect，先 resolve 到真實 URL
      const realUrl = await resolveGoogleLink(item.link)
      if (existing.has(realUrl) || existing.has(item.link)) { results.skipped++; continue }

      // 抓實際文章頁：取 og:image（必須有圖才處理）+ body text
      const articleHtml = await fetchText(realUrl, 8_000)
      if (!articleHtml) { results.skipped++; continue }

      const ogImage = resolveImageUrl(extractOgImage(articleHtml), realUrl)
      if (!ogImage) { results.skipped++; continue }  // 沒有有效圖片 URL 直接跳過

      const bodyText = articleHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').trim()
        .slice(0, 1500)

      // Claude 改寫
      const draft = await rewriteArticle(
        claude, item.title, item.description, bodyText, realUrl, category
      )
      if (!draft) { results.skipped++; continue }

      // 標題相似度去重（同主題 Jaccard >= 0.55 視為重複）
      if (isDuplicateTopic(draft.title)) { results.skipped++; continue }

      // 下載圖片到 R2（失敗直接 skip，不接受外部 URL fallback）
      const imageUrl = await downloadImageToR2(ogImage)
      if (!imageUrl) { results.skipped++; continue }

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
        is_active:  false,
      })

      if (!error) {
        results.written++
        results.articles.push(draft.title)
        existing.add(realUrl)
        sessionTitles.push(tokenize(draft.title))  // 加入本次 session 比對池
        perQuery++
      } else if (error.code === '23505') {
        results.skipped++
      } else {
        console.error('[news-agent] insert error:', error.message)
        results.errors++
      }

      await new Promise(r => setTimeout(r, 300))
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
