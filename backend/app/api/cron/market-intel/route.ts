import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

// ─── 競品清單 ──────────────────────────────────────────────────────────────

const COMPETITORS = [
  { name: '91toy',         url: 'https://www.91toy.com.tw/'         },
  { name: 'SlimeToy',      url: 'https://slimetoy.com.tw/'          },
  { name: 'KujiFlip',      url: 'https://kujiflip.tw/'              },
  { name: 'Dopamine Kuji', url: 'https://dopaminekuji.com/'         },
  { name: '混線一番',       url: 'https://h5.hunxianyifan.com/'     },
  { name: 'CityDAO',       url: 'https://citydao.world/'            },
  { name: 'EggBox Kuji',   url: 'https://eggboxkuji.com/lottery'    },
  { name: 'Wonder Kuji',   url: 'https://wonderkuji.com.tw/'        },
]

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// ─── Scraping helpers ──────────────────────────────────────────────────────

function stripToText(html: string, maxChars = 2000): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, maxChars)
}

function extractMeta(html: string, attr: string, key: string): string {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']{1,300})["']`, 'i')
  return html.match(re)?.[1]?.trim() ?? ''
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? ''
}

// 從 Next.js __NEXT_DATA__ 嘗試提取商品/活動名稱（限 200 chars）
function extractNextDataSnippet(html: string): string {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]{1,50000}?)<\/script>/i)
  if (!m) return ''
  try {
    const raw = JSON.parse(m[1])
    const str = JSON.stringify(raw)
    // 找商品名稱關鍵字附近文字
    const idx = str.search(/name|title|商品|活動|限定|新品/i)
    if (idx < 0) return ''
    return str.slice(Math.max(0, idx - 20), idx + 200).replace(/[{}"\\]/g, ' ').replace(/\s+/g, ' ')
  } catch {
    return ''
  }
}

interface SiteSnapshot {
  name: string
  url: string
  ok: boolean
  title: string
  description: string
  bodyText: string
  nextSnippet: string
  error?: string
}

async function scrapeOne(competitor: { name: string; url: string }): Promise<SiteSnapshot> {
  const base: SiteSnapshot = { name: competitor.name, url: competitor.url, ok: false, title: '', description: '', bodyText: '', nextSnippet: '' }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    const res = await fetch(competitor.url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.9', 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8' },
      redirect: 'follow',
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))

    if (!res.ok) return { ...base, error: `HTTP ${res.status}` }
    const html = await res.text()

    return {
      ...base,
      ok:          true,
      title:       extractTitle(html),
      description: extractMeta(html, 'name', 'description') || extractMeta(html, 'property', 'og:description'),
      bodyText:    stripToText(html, 2000),
      nextSnippet: extractNextDataSnippet(html),
    }
  } catch (e: any) {
    return { ...base, error: e?.message?.slice(0, 80) ?? 'timeout' }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Claude analysis ──────────────────────────────────────────────────────

async function analyzeMarket(snapshots: SiteSnapshot[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '（ANTHROPIC_API_KEY 未設定）'

  const ok      = snapshots.filter(s => s.ok)
  const failed  = snapshots.filter(s => !s.ok)

  const siteBlocks = ok.map(s => {
    const parts = [
      `【${s.name}】${s.url}`,
      s.title       ? `標題：${s.title}` : '',
      s.description ? `描述：${s.description}` : '',
      s.bodyText    ? `內容節錄：${s.bodyText.slice(0, 800)}` : '',
      s.nextSnippet ? `數據節錄：${s.nextSnippet}` : '',
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n---\n\n')

  const prompt = `你是 GGB（吉吉比）轉蛋平台的市場情報官。以下是本週自動抓取的 ${ok.length} 家競品網站首頁資料。

${siteBlocks}

請整理出：
1. **各競品本週主打** — 每家 1 句，指出在推什麼商品或活動（找不到資訊就寫「無法判斷」）
2. **共同市場趨勢** — 2-3 點，市場上正在流行什麼 IP 或玩法
3. **GGB 差異化機會** — 1-2 點具體建議

格式：條列式，400 字以內，用繁體中文。不要加說明文字，直接輸出三個段落。`

  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages:   [{ role: 'user', content: prompt }],
  })

  let text = (res.content[0] as any)?.text ?? '（分析失敗）'
  if (failed.length > 0) {
    text += `\n\n（本次抓取失敗：${failed.map(f => f.name).join('、')}）`
  }
  return text
}

// ─── Main ────────────────────────────────────────────────────────────────

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 依序抓取（每次間隔 600ms，避免同時打出大量請求）
  const snapshots: SiteSnapshot[] = []
  for (const c of COMPETITORS) {
    snapshots.push(await scrapeOne(c))
    await sleep(600)
  }

  const periodEnd   = new Date()
  const periodStart = new Date(periodEnd.getTime() - 7 * 86400_000)
  const analysis    = await analyzeMarket(snapshots)

  // 存 competitor_reports
  await supabase.from('competitor_reports').insert({
    period_start: periodStart.toISOString(),
    period_end:   periodEnd.toISOString(),
    post_count:   snapshots.filter(s => s.ok).length,
    analysis,
    source:       'auto_scrape',
  })

  // 也把摘要寫入 competitor_posts（供現有手動分析 cron 看到）
  const postsToInsert = snapshots
    .filter(s => s.ok && (s.title || s.description))
    .map(s => ({
      competitor: s.name,
      platform:   '網站',
      content:    [s.title, s.description].filter(Boolean).join(' — ').slice(0, 500),
      url:        s.url,
      added_by:   'auto_scraper',
    }))
  if (postsToInsert.length > 0) {
    await supabase.from('competitor_posts').insert(postsToInsert)
  }

  // LINE 推播
  const twNow  = new Date(Date.now() + 8 * 3600_000)
  const dateStr = `${twNow.getUTCFullYear()}/${(twNow.getUTCMonth()+1).toString().padStart(2,'0')}/${twNow.getUTCDate().toString().padStart(2,'0')}`
  const okCount = snapshots.filter(s => s.ok).length
  const lineMsg = [
    `市場情報官日報｜${dateStr}`,
    `（成功抓取 ${okCount}/${COMPETITORS.length} 家競品）`,
    '',
    analysis.length > 1200 ? analysis.slice(0, 1197) + '...' : analysis,
  ].join('\n')

  await pushLine(lineMsg)

  return NextResponse.json({
    ok:       true,
    scraped:  okCount,
    total:    COMPETITORS.length,
    failed:   snapshots.filter(s => !s.ok).map(s => ({ name: s.name, error: s.error })),
  })
}
