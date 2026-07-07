import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// ─── 關鍵字組合輪替 ────────────────────────────────────────────────────────

const KEYWORD_COMBOS: string[][] = [
  ['一番賞', '新品', '台灣'],
  ['盒玩', '聯名', '開賣'],
  ['轉蛋', '活動', '線上'],
  ['抽卡', '限定', '促銷'],
  ['盲盒', '新品', '台灣'],
  ['扭蛋', '檔期', '台灣'],
  ['線上一番賞', '台灣', '限定'],
  ['代抽', '新品', '一番賞'],
]

// 發現新競品用的 Google News 搜尋詞
const DISCOVERY_QUERIES = [
  '線上一番賞 台灣 平台',
  '線上轉蛋 台灣 購買',
  '台灣 線上盲盒 盒玩 平台',
  'online kuji taiwan 線上抽',
  '代抽 一番賞 台灣 網路',
]

function getWeeklyKeywordCombos(): string[][] {
  const weekNum = Math.floor(Date.now() / (7 * 86400_000))
  return [0, 1, 2].map(i => KEYWORD_COMBOS[(weekNum * 3 + i) % KEYWORD_COMBOS.length])
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 10_000, opts?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  return fetch(url, { signal: ctrl.signal, ...opts }).finally(() => clearTimeout(timer))
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Scraping ──────────────────────────────────────────────────────────────

function stripHtml(html: string, maxChars = 2000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim()
    .slice(0, maxChars)
}

function extractMeta(html: string, attr: string, key: string): string {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']{1,300})["']`, 'i')
  return html.match(re)?.[1]?.trim() ?? ''
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? ''
}

function extractNextDataSnippet(html: string): string {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]{1,50000}?)<\/script>/i)
  if (!m) return ''
  try {
    const str = JSON.stringify(JSON.parse(m[1]))
    const idx = str.search(/name|title|商品|活動|限定|新品/i)
    if (idx < 0) return ''
    return str.slice(Math.max(0, idx - 20), idx + 200).replace(/[{}"\\]/g, ' ').replace(/\s+/g, ' ')
  } catch { return '' }
}

interface SiteSnapshot {
  name: string
  url:  string
  ok:   boolean
  title:       string
  description: string
  bodyText:    string
  nextSnippet: string
  error?: string
}

async function scrapeOne(name: string, url: string): Promise<SiteSnapshot> {
  const base: SiteSnapshot = { name, url, ok: false, title: '', description: '', bodyText: '', nextSnippet: '' }
  try {
    const res = await fetchWithTimeout(url, 10_000, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.9', 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8' },
      redirect: 'follow',
    })
    if (!res.ok) return { ...base, error: `HTTP ${res.status}` }
    const html = await res.text()
    return {
      ...base,
      ok:          true,
      title:       extractTitle(html),
      description: extractMeta(html, 'name', 'description') || extractMeta(html, 'property', 'og:description'),
      bodyText:    stripHtml(html, 2000),
      nextSnippet: extractNextDataSnippet(html),
    }
  } catch (e: any) {
    return { ...base, error: e?.message?.slice(0, 80) ?? 'timeout' }
  }
}

// ─── DuckDuckGo keyword search ─────────────────────────────────────────────

interface SearchResult {
  title:   string
  url:     string
  snippet: string
  source:  string
  pubDate: string
}

// Google News RSS — 不需 API key，直接返回繁中新聞
async function searchGoogleNews(query: string, maxResults = 8): Promise<SearchResult[]> {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
    const res = await fetchWithTimeout(rssUrl, 12_000, {
      headers: { 'user-agent': UA, accept: 'application/rss+xml,text/xml,*/*' },
    })
    if (!res.ok) return []
    const xml = await res.text()

    const results: SearchResult[] = []
    const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? []

    for (const block of itemBlocks) {
      const title   = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1]?.trim()
                   ?? stripHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '', 150)
      const link    = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? ''
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? ''
      const desc    = stripHtml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '', 200)
      const source  = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]?.trim() ?? ''

      if (title && title.length > 5) {
        results.push({ title, url: link, snippet: desc, source, pubDate })
        if (results.length >= maxResults) break
      }
    }
    return results
  } catch { return [] }
}

// ─── Anomaly detection ─────────────────────────────────────────────────────

interface Anomaly {
  type:        'engagement_spike' | 'dense_posting'
  competitor:  string
  description: string
}

async function detectAnomalies(supabase: any, activeNames: string[]): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  const now = new Date()
  const last24h = new Date(now.getTime() - 86400_000).toISOString()
  const last28d  = new Date(now.getTime() - 28 * 86400_000).toISOString()

  for (const name of activeNames) {
    const { count: cnt24h } = await supabase
      .from('competitor_posts').select('id', { count: 'exact', head: true })
      .eq('competitor', name).gte('created_at', last24h)

    if ((cnt24h ?? 0) >= 3) {
      anomalies.push({ type: 'dense_posting', competitor: name, description: `${name} 24小時內新增 ${cnt24h} 筆` })
    }

    const { data: weeklyRows } = await supabase
      .from('competitor_posts').select('created_at')
      .eq('competitor', name).gte('created_at', last28d)

    const weeks = 4
    const avgPerWeek = ((weeklyRows ?? []).length) / weeks
    const { count: cntWeek } = await supabase
      .from('competitor_posts').select('id', { count: 'exact', head: true })
      .eq('competitor', name).gte('created_at', new Date(now.getTime() - 7 * 86400_000).toISOString())

    if (avgPerWeek > 0 && (cntWeek ?? 0) >= avgPerWeek * 2) {
      anomalies.push({ type: 'engagement_spike', competitor: name, description: `${name} 本週 ${cntWeek} 筆，為近4週均值(${avgPerWeek.toFixed(1)})的 ${((cntWeek ?? 0) / avgPerWeek).toFixed(1)} 倍` })
    }
  }
  return anomalies
}

// ─── Claude 分析 ───────────────────────────────────────────────────────────

interface FourLayerAnalysis {
  facts:   string
  insight: string
  compare: string
  suggest: string
  report:  string
}

async function runFourLayerAnalysis(
  snapshots:      SiteSnapshot[],
  keywordResults: { combo: string[]; results: SearchResult[] }[],
  anomalies:      Anomaly[],
): Promise<FourLayerAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const blank = '（ANTHROPIC_API_KEY 未設定）'
    return { facts: blank, insight: blank, compare: blank, suggest: blank, report: blank }
  }

  const ok = snapshots.filter(s => s.ok)

  const siteBlock = ok.map(s => {
    const parts = [
      `[${s.name}] ${s.url}`,
      s.title       ? `標題：${s.title}` : '',
      s.description ? `描述：${s.description}` : '',
      s.bodyText    ? `內容：${s.bodyText.slice(0, 600)}` : '',
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')

  const kwBlock = keywordResults.map(kw => {
    if (kw.results.length === 0) return ''
    const header = `搜尋：「${kw.combo.join(' ')}」`
    const items = kw.results.slice(0, 5).map(r =>
      `  • [${r.pubDate ? r.pubDate.slice(0, 16) : ''}] ${r.title}｜${r.source}`
    ).join('\n')
    return `${header}\n${items}`
  }).filter(Boolean).join('\n\n')

  const anomalyBlock = anomalies.length > 0
    ? `\n【即時異常偵測】\n${anomalies.map(a => `• ${a.description}`).join('\n')}`
    : ''

  const client = new Anthropic({ apiKey })

  // Step 1: 四層分析（內部使用）
  const analysisRes = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages:   [{
      role:    'user',
      content: `你是 GGB（吉吉比）轉蛋平台的市場情報官，請對以下本週競品資料做四層分析。

【競品網站監控（第一層）】
${siteBlock || '（無可用資料）'}

【關鍵字市場掃描（第二層）】
${kwBlock || '（無可用資料）'}
${anomalyBlock}

請輸出四個段落，每段以標籤開頭，各50-100字：
<facts>事實層：本期觀察到的具體動態（IP、活動、商品名稱）</facts>
<insight>解讀層：這些動作可能代表的策略意圖</insight>
<compare>對比層：與GGB自身的異同或機會點</compare>
<suggest>建議層：可考慮的1-2個因應方向</suggest>`,
    }],
  })

  const analysisText = (analysisRes.content[0] as any)?.text ?? ''
  const extract = (tag: string) => analysisText.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? ''

  const facts   = extract('facts')
  const insight = extract('insight')
  const compare = extract('compare')
  const suggest = extract('suggest')

  // Step 2: 精簡報告（對外推播用）
  const anomalySentence = anomalies.length > 0
    ? `另：${anomalies[0].description}，值得留意。`
    : ''

  const reportRes = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages:   [{
      role:    'user',
      content: `根據以下市場分析，撰寫一份給平台老闆的精簡情報報告。

事實：${facts}
解讀：${insight}
對比：${compare}
建議：${suggest}
${anomalySentence ? `即時異常：${anomalySentence}` : ''}

【報告格式規定】
- 繁體中文，總字數150-250字
- 兩段式，段落間空一行
  第一段（趨勢觀察）：綜合本期市場整體動向，需含具體IP或平台名稱
  第二段（可跟進方向）：1-2個具體可執行建議
- 若有即時異常，第二段後加一句「另：[描述]」
- 最後一行加2-3個關鍵名詞hashtag，例：#海賊王 #萬代
- 嚴格禁止：emoji、Markdown 標題（#）、條列符號（- • 1. 等）、「以下是」等說明語
- 必須是完整通順的句子，含具體名詞（IP名稱、平台名稱、數字）
- 直接輸出報告文字，不要有任何前言、標題、分隔線`,
    }],
  })

  const report = (reportRes.content[0] as any)?.text?.trim() ?? '（報告生成失敗）'

  return { facts, insight, compare, suggest, report }
}

// ─── 競品發現 ──────────────────────────────────────────────────────────────

interface DiscoveryCandidate {
  name:  string
  url:   string
  reason: string
}

async function discoverNewCompetitors(
  supabase: any,
  existingUrls: string[],
): Promise<DiscoveryCandidate[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  // 收集搜尋結果
  const allResults: SearchResult[] = []
  for (const q of DISCOVERY_QUERIES) {
    const res = await searchGoogleNews(q, 6)
    allResults.push(...res)
    await sleep(1500)
  }

  if (allResults.length === 0) return []

  // 用 Claude 篩選出可能的競品平台
  const client = new Anthropic({ apiKey })
  const existingDomains = existingUrls.map(u => {
    try { return new URL(u).hostname } catch { return u }
  })

  const resultsText = allResults
    .slice(0, 30)
    .map(r => `• ${r.title}｜${r.url}｜${r.snippet.slice(0, 100)}`)
    .join('\n')

  const res = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages:   [{
      role:    'user',
      content: `以下是搜尋「線上一番賞/轉蛋/盲盒/抽卡 台灣 平台」的搜尋結果。
請從中找出可能是「台灣線上轉蛋/一番賞/盒玩/盲盒直接競品平台」的網站。

排除條件：代購服務、教學文章、討論版、日本網站、只賣實體商品的店家。
已追蹤的域名（排除）：${existingDomains.join('、')}

搜尋結果：
${resultsText}

請輸出JSON陣列（最多5個），格式：
[{"name":"平台名稱","url":"https://...","reason":"一句說明為何是競品"}]
若沒有符合的，回傳空陣列 []。只輸出JSON，不要其他文字。`,
    }],
  })

  try {
    const text  = (res.content[0] as any)?.text?.trim() ?? '[]'
    const match = text.match(/\[[\s\S]*\]/)
    const raw   = JSON.parse(match?.[0] ?? '[]') as any[]
    return raw
      .filter(c => c.name && c.url)
      .filter(c => {
        try {
          return !existingDomains.includes(new URL(c.url).hostname)
        } catch { return false }
      })
      .slice(0, 5)
  } catch { return [] }
}

// ─── LINE push ────────────────────────────────────────────────────────────

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

// ─── Route ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = req.nextUrl.searchParams.get('mode') ?? 'weekly'

  const supabase = getSupabaseAdmin()

  // ── 競品發現模式 ──────────────────────────────────────────────────────────
  if (mode === 'discovery') {
    const { data: existing } = await supabase
      .from('competitor_watchlist').select('name, url').in('status', ['active', 'candidate'])

    const existingUrls  = (existing ?? []).map((r: any) => r.url as string)
    const existingNames = (existing ?? []).map((r: any) => r.name as string)

    const candidates = await discoverNewCompetitors(supabase, existingUrls)

    // 過濾已存在
    const truly_new = candidates.filter(c =>
      !existingNames.some(n => n.toLowerCase() === c.name.toLowerCase())
    )

    if (truly_new.length > 0) {
      // 寫入 candidate 狀態
      await supabase.from('competitor_watchlist').insert(
        truly_new.map(c => ({
          name: c.name, url: c.url, status: 'candidate',
          discovered_by: 'auto_discovery', notes: c.reason,
        }))
      )

      const listStr = truly_new.map((c, i) => `${i + 1}. ${c.name}（${c.url}）\n   ${c.reason}`).join('\n')
      await pushLine(
        `市場情報官｜發現 ${truly_new.length} 個潛在新競品\n\n${listStr}\n\n請回覆 GB哥「加入追蹤：[名稱]」或「移除候選：[名稱]」`
      )
    }

    return NextResponse.json({ ok: true, mode: 'discovery', found: truly_new.length, candidates: truly_new })
  }

  // ── 例行分析模式（weekly / manual）────────────────────────────────────────

  // 讀取追蹤清單
  const { data: watchlist } = await supabase
    .from('competitor_watchlist').select('name, url').eq('status', 'active').order('added_at')

  const competitors: { name: string; url: string }[] = watchlist ?? []

  // Layer 1: 抓取競品網站
  const snapshots: SiteSnapshot[] = []
  for (const c of competitors) {
    snapshots.push(await scrapeOne(c.name, c.url))
    await sleep(600)
  }

  // Layer 2: 關鍵字搜尋
  const combos = getWeeklyKeywordCombos()
  const keywordResults: { combo: string[]; results: SearchResult[] }[] = []
  for (const combo of combos) {
    const query   = combo.join(' ')
    const results = await searchGoogleNews(query, 6)
    keywordResults.push({ combo, results })
    // 儲存 scan log
    if (results.length > 0) {
      await supabase.from('market_keyword_scan_logs').insert({
        keywords:     combo,
        findings:     results.slice(0, 3).map(r => r.title + '：' + r.snippet.slice(0, 80)).join('；'),
        result_count: results.length,
      })
    }
    await sleep(1500)
  }

  // 異常偵測
  const activeNames = competitors.map(c => c.name)
  const anomalies   = await detectAnomalies(supabase, activeNames)

  // 四層分析 + 精簡報告
  const analysis = await runFourLayerAnalysis(snapshots, keywordResults, anomalies)

  // 儲存完整分析
  await supabase.from('market_intel_analysis').insert({
    run_type:            mode,
    competitors_scraped: snapshots.filter(s => s.ok).length,
    facts_layer:         analysis.facts,
    insight_layer:       analysis.insight,
    compare_layer:       analysis.compare,
    suggest_layer:       analysis.suggest,
    report:              analysis.report,
    anomalies:           anomalies,
    raw_data: {
      snapshots: snapshots.map(s => ({
        name: s.name, ok: s.ok, title: s.title, description: s.description,
      })),
      keywords: keywordResults.map(k => ({
        combo:   k.combo,
        results: k.results.slice(0, 3).map(r => ({ title: r.title, url: r.url })),
      })),
    },
  })

  // 也把本次抓到的資訊寫入 competitor_posts（供其他 agent 查詢）
  const postsToInsert = snapshots
    .filter(s => s.ok && (s.title || s.description))
    .map(s => ({
      competitor: s.name,
      platform:   '網站',
      content:    [s.title, s.description].filter(Boolean).join(' — ').slice(0, 500),
      url:        s.url,
      added_by:   'market_intel_v2',
    }))
  if (postsToInsert.length > 0) {
    await supabase.from('competitor_posts').insert(postsToInsert)
  }

  // 即時異常獨立推播（標明「即時異常」）
  for (const a of anomalies) {
    await pushLine(`即時異常｜${a.competitor}\n${a.description}`)
  }

  // 推播精簡報告
  const twNow  = new Date(Date.now() + 8 * 3600_000)
  const dateStr = `${twNow.getUTCFullYear()}/${String(twNow.getUTCMonth() + 1).padStart(2, '0')}/${String(twNow.getUTCDate()).padStart(2, '0')}`
  const okCount = snapshots.filter(s => s.ok).length

  await pushLine(
    `市場情報官｜${dateStr}（監控 ${okCount}/${competitors.length} 家）\n\n${analysis.report}`
  )

  return NextResponse.json({
    ok:        true,
    mode,
    scraped:   okCount,
    total:     competitors.length,
    keywords:  combos.length,
    anomalies: anomalies.length,
    failed:    snapshots.filter(s => !s.ok).map(s => ({ name: s.name, error: s.error })),
    report:    analysis.report,
  })
}
