/**
 * news-agent — 每天自動爬取日本最新轉蛋/一番賞/盒玩/TCG 資訊，
 * 用 Claude 改寫成繁體中文（台灣用語），寫入 news 表（預設下架）。
 * 排程：每天 08:00 台灣時間（00:00 UTC）
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'
import { r2Upload } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'

// ─── 日本玩具新聞來源（RSS + 一般頁面）────────────────────────────────────

const NEWS_SOURCES = [
  // 一番賞
  { name: 'Ichiban Kuji Official',   url: 'https://ichiban-kuji.com/new_product/',        category: 'ichiban' },
  { name: 'BANDAI Products News',    url: 'https://www.bandai.co.jp/products/index.html',  category: 'ichiban' },
  // 轉蛋/扭蛋
  { name: 'Gashapon Official',       url: 'https://gashapon.jp/products/new.html',          category: 'gacha' },
  { name: 'TAKARA TOMY A.R.T.S',    url: 'https://www.takaratomy-arts.co.jp/items/',       category: 'gacha' },
  // 盒玩/盲盒
  { name: 'MegaHouse News',          url: 'https://www.megahouse.co.jp/new/',               category: 'blindbox' },
  { name: 'Re-Ment Products',        url: 'https://www.re-ment.co.jp/new/',                 category: 'blindbox' },
  { name: 'Good Smile Company News', url: 'https://www.goodsmile.info/ja/products/category/nendoroid-mini/', category: 'blindbox' },
  // TCG
  { name: 'Pokemon Card JP News',    url: 'https://www.pokemon-card.com/information/',      category: 'tcg' },
  { name: 'YGO OCG News',            url: 'https://www.yugioh-card.com/japan/topics/',      category: 'tcg' },
  // 綜合玩具媒體
  { name: 'Akiba Souken',           url: 'https://akiba-souken.com/article/',              category: 'general' },
  { name: 'Figure.fm',              url: 'https://figure.fm/ja/posts/',                    category: 'general' },
  { name: 'Hobby Japan Web',        url: 'https://hobbyjapan.co.jp/hjweb/news/',           category: 'general' },
]

// ─── HTTP 工具 ──────────────────────────────────────────────────────────────

async function fetchHtml(url: string, timeoutMs = 12_000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8' },
    })
    return await res.text()
  } catch { return '' }
  finally { clearTimeout(t) }
}

function stripHtml(html: string, max = 3000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim()
    .slice(0, max)
}

function extractMeta(html: string, prop: string): string {
  const m = html.match(new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']{1,400})["']`, 'i'
  )) ?? html.match(new RegExp(
    `<meta[^>]+content=["']([^"']{1,400})["'][^>]*(?:property|name)=["']${prop}["']`, 'i'
  ))
  return m?.[1]?.trim() ?? ''
}

function extractOgImage(html: string): string {
  return extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || ''
}

function extractTitle(html: string): string {
  const og = extractMeta(html, 'og:title')
  if (og) return og
  return html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? ''
}

// 從頁面抓取最近文章連結（簡易解析）
function extractArticleLinks(html: string, baseUrl: string, limit = 8): string[] {
  const base = new URL(baseUrl)
  const links = new Set<string>()
  const re = /href=["']([^"'#?]{10,}?)["']/gi
  let m
  while ((m = re.exec(html)) !== null && links.size < limit * 3) {
    try {
      const abs = new URL(m[1], baseUrl).href
      if (abs.startsWith(base.origin) && abs !== baseUrl && abs.length < 200) {
        links.add(abs)
      }
    } catch {}
  }
  // 優先取含 news/article/product/topics 的連結
  const prioritized = [...links].filter(l => /news|article|product|topics|info|post|item|new/i.test(l))
  return prioritized.slice(0, limit)
}

// ─── 已知來源的 URL（防重複）──────────────────────────────────────────────

async function getExistingSourceUrls(supabase: any): Promise<Set<string>> {
  const { data } = await supabase
    .from('news')
    .select('source_url')
    .not('source_url', 'is', null)
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
  return new Set((data ?? []).map((r: any) => r.source_url))
}

// ─── 圖片上傳至 R2 ─────────────────────────────────────────────────────────

async function downloadImageToR2(imgUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imgUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000) return null
    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const publicUrl = await r2Upload(key, buf, ct)
    return publicUrl
  } catch { return null }
}

// ─── Claude 改寫 ────────────────────────────────────────────────────────────

interface ArticleDraft {
  title:    string
  summary:  string
  content:  string  // HTML
  tags:     string[]
  category: string
}

async function rewriteArticle(
  claude: Anthropic,
  rawTitle: string,
  rawBody: string,
  sourceUrl: string,
  defaultCategory: string,
): Promise<ArticleDraft | null> {
  if (!rawTitle && !rawBody) return null

  const resp = await claude.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `你是吉吉比（GGB）台灣線上轉蛋平台的內容編輯。
請將以下來自日本的玩具新聞改寫成繁體中文（台灣用語）的文章，輸出 JSON。

來源標題：${rawTitle.slice(0, 200)}
來源內容摘要：${rawBody.slice(0, 1500)}
來源網址：${sourceUrl}
預設分類：${defaultCategory}

輸出格式（只輸出 JSON，不要說明）：
{
  "title": "文章標題（繁體中文，吸引人，30字以內）",
  "summary": "一句話摘要（50字以內）",
  "content": "HTML 格式正文（300-500字，包含 <h2>、<p> 段落，讀者友善。不要抄原文，用台灣玩家角度撰寫）",
  "tags": ["標籤1", "標籤2", "標籤3"],
  "category": "ichiban|gacha|blindbox|tcg|general 其中一個"
}

規則：
- 全部繁體中文，台灣慣用語（不用「盲盒」用「盲盒」，不用「扭蛋」用「扭蛋/轉蛋」）
- 標題要有吸引力，可以加入台灣玩家的視角
- 不要寫「來源：xxx」或廣告語
- 若內容與玩具/轉蛋/一番賞/TCG 無關，回傳 null`,
    }],
  })

  const text = (resp.content[0] as any)?.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]+\}/)
  if (!jsonMatch || text.trim() === 'null') return null
  try {
    return JSON.parse(jsonMatch[0]) as ArticleDraft
  } catch { return null }
}

// ─── LINE 通知 ──────────────────────────────────────────────────────────────

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

// ─── 主流程 ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const existing = await getExistingSourceUrls(supabase)
  const results  = { written: 0, skipped: 0, errors: 0, articles: [] as string[] }

  for (const source of NEWS_SOURCES) {
    try {
      const indexHtml = await fetchHtml(source.url)
      if (!indexHtml) { results.errors++; continue }

      const links = extractArticleLinks(indexHtml, source.url)
      if (!links.length) { results.skipped++; continue }

      for (const link of links) {
        if (existing.has(link)) continue

        const articleHtml = await fetchHtml(link)
        if (!articleHtml) continue

        const rawTitle = extractTitle(articleHtml) || extractMeta(articleHtml, 'og:title')
        const rawBody  = extractMeta(articleHtml, 'og:description') + ' ' + stripHtml(articleHtml, 2000)
        const ogImg    = extractOgImage(articleHtml)

        // 跳過明顯無關的頁面
        const relevant = /一番|ichiban|ガチャ|扭蛋|転がし|盲盒|フィギュア|figure|toy|ポケカ|遊戯王|カード/i
        if (!relevant.test(rawTitle + rawBody)) continue

        const draft = await rewriteArticle(claude, rawTitle, rawBody, link, source.category)
        if (!draft) continue

        // 下載主圖到 R2
        let imageUrl: string | null = null
        if (ogImg) {
          imageUrl = await downloadImageToR2(ogImg)
        }

        const id = Math.floor(10000000 + Math.random() * 90000000).toString()
        const { error } = await supabase.from('news').insert({
          id,
          title:      draft.title,
          summary:    draft.summary,
          content:    draft.content,
          image_url:  imageUrl ?? ogImg ?? null,
          source_url: link,
          category:   draft.category ?? source.category,
          tags:       draft.tags ?? [],
          is_active:  false,  // 預設下架，管理員審閱後手動上架
        })

        if (!error) {
          results.written++
          results.articles.push(draft.title)
          existing.add(link)
        } else if (error.code === '23505') {
          // 重複 source_url，正常情況
        } else {
          results.errors++
        }

        // 每篇間隔 1s 避免爬蟲封鎖
        await new Promise(r => setTimeout(r, 1000))
      }
    } catch (e: any) {
      console.error(`[news-agent] ${source.name}:`, e?.message)
      results.errors++
    }
  }

  // LINE 通知
  if (results.written > 0) {
    const preview = results.articles.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('\n')
    await pushLine(
      `📰 今日新聞自動採集完成\n` +
      `新增 ${results.written} 篇（全部下架待審）\n\n` +
      `${preview}${results.articles.length > 3 ? `\n...共 ${results.articles.length} 篇` : ''}\n\n` +
      `➡️ 後台 > 文章管理 審閱後上架`
    )
  }

  return NextResponse.json({ ok: true, ...results })
}
