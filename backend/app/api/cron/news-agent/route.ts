/**
 * news-agent — 每天自動從 Google News RSS 抓取日本最新
 * 轉蛋/一番賞/盲盒/TCG 資訊，用 Claude 改寫成繁中，寫入 news 表（預設下架）。
 * 排程：每天 TW 06:30（UTC 22:30 前一天）
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'
import { r2Upload } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'

// ─── Google News RSS 搜尋詞（日文）─────────────────────────────────────────
// 每次跑最多取 5 個搜尋詞，每詞最多 3 篇新文章

const RSS_QUERIES: Array<{ q: string; category: string }> = [
  { q: '一番くじ 新商品',             category: 'ichiban'  },
  { q: 'ガチャガチャ カプセルトイ 新製品', category: 'gacha'    },
  { q: 'ブラインドボックス フィギュア 新作', category: 'blindbox' },
  { q: 'ポケモンカード 新弾 発売',      category: 'tcg'      },
  { q: '遊戯王 OCG 新カード',          category: 'tcg'      },
  { q: 'ねんどろいど 新商品 グッドスマイル', category: 'blindbox' },
  { q: 'バンダイ ガシャポン 2026',     category: 'gacha'    },
  { q: 'リーメント ぷちサンプル 新作',  category: 'blindbox' },
]

function rssUrl(q: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ja&gl=JP&ceid=JP:ja`
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
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 2000) return null
    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
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
      content: `你是吉吉比（GGB）台灣線上轉蛋平台的內容編輯。
請根據以下日本玩具新聞，改寫成繁體中文（台灣用語）文章，輸出 JSON。

原始資訊：
${combined}

來源：${sourceUrl}
預設分類：${defaultCategory}

只輸出 JSON（不加說明）：
{
  "title": "吸引人的標題（繁體中文，25字以內）",
  "summary": "一句話摘要（40字以內）",
  "content": "<h2>小標</h2><p>段落...</p>（繁體中文正文，250-400字，2-3段，台灣玩家視角）",
  "tags": ["標籤1","標籤2","標籤3"],
  "category": "ichiban|gacha|blindbox|tcg|general"
}

若此內容與玩具/轉蛋/一番賞/卡牌完全無關，回傳 null。`,
    }],
  })

  const text = (resp.content[0] as any)?.text?.trim() ?? ''
  if (text === 'null' || !text) return null
  const m = text.match(/\{[\s\S]+\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) as ArticleDraft }
  catch { return null }
}

// ─── LINE 通知 ───────────────────────────────────────────────────────────────

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // 已寫入的 source_url 集合（防重複）
  const { data: existingRows } = await supabase
    .from('news')
    .select('source_url')
    .not('source_url', 'is', null)
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
  const existing = new Set((existingRows ?? []).map((r: any) => r.source_url as string))

  const results = { written: 0, skipped: 0, errors: 0, articles: [] as string[] }
  const DEADLINE = Date.now() + 240_000  // 最多跑 4 分鐘
  const MAX_PER_QUERY = 3

  for (const { q, category } of RSS_QUERIES) {
    if (Date.now() > DEADLINE) break

    const xml = await fetchText(rssUrl(q))
    if (!xml) { results.errors++; continue }

    const items = parseRss(xml).filter(it => isRecent(it.pubDate))
    let perQuery = 0

    for (const item of items) {
      if (Date.now() > DEADLINE || perQuery >= MAX_PER_QUERY) break

      // Google News 的 link 是 redirect，先 resolve 到真實 URL
      const realUrl = await resolveGoogleLink(item.link)
      if (existing.has(realUrl) || existing.has(item.link)) { results.skipped++; continue }

      // 嘗試抓實際文章頁（取 og:image + body）
      let ogImage  = ''
      let bodyText = ''
      const articleHtml = await fetchText(realUrl, 8_000)
      if (articleHtml) {
        ogImage  = extractOgImage(articleHtml)
        bodyText = articleHtml
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ').trim()
          .slice(0, 1500)
      }

      // Claude 改寫
      const draft = await rewriteArticle(
        claude, item.title, item.description, bodyText, realUrl, category
      )
      if (!draft) { results.skipped++; continue }

      // 主圖：先嘗試下載到 R2，失敗則直接用外部 URL
      let imageUrl: string | null = null
      if (ogImage) {
        imageUrl = await downloadImageToR2(ogImage) ?? ogImage
      }

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

  if (results.written > 0) {
    const preview = results.articles.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('\n')
    await pushLine(
      `📰 今日新聞採集完成\n新增 ${results.written} 篇（全部下架待審）\n\n${preview}` +
      (results.articles.length > 3 ? `\n...共 ${results.articles.length} 篇` : '') +
      '\n\n➡️ 後台 > 文章管理 審閱後上架'
    )
  }

  return NextResponse.json({ ok: true, ...results })
}
