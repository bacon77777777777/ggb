import sharp from 'sharp'
import { r2Upload, R2_PUBLIC_URL } from '@/lib/r2'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * 找圖
 *
 * ai-enrich 那支（單筆新增用）本來就有完整的找圖管線，但整套寫死在
 * 1000 多行的 route 裡，批量匯入完全用不到 —— 於是廠商的 list 沒帶圖時，
 * 智能上架就真的把圖片留空給你。老闆的原話：「我不要空啊，
 * 智能批量上架的用意就是我丟什麼格式都要幫我補齊，讓我無腦上架」。
 *
 * 這支把「找圖」抽出來讓兩邊共用。刻意只留免費的路徑：
 *
 *   1. 站內既有商品同名 → 直接沿用（最準，而且零外部請求）
 *   2. DuckDuckGo 圖片搜尋 → 下載、壓成 WebP、存進 R2
 *
 * 不含 Claude。ai-enrich 用 Claude 是為了「猜出品項名稱」，
 * 但批量匯入的品項名稱廠商已經給了，不需要猜 —— 缺的只有圖。
 * 這樣整條批量補圖是零 API 成本。
 *
 * 存回 R2 而不是直接用外部網址：外部圖隨時會失效或擋 referer，
 * 前台就是破圖。而且 R2 那份已經壓過，載入快得多。
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

/** 這些網域的圖不是商品照（社群縮圖、圖示、快取代理），拿到也沒用 */
const SKIP_DOMAINS = [
  'google', 'gstatic', 'facebook', 'twitter', 'instagram',
  'youtube', 'blogspot', 'pinterest', 'wikimedia', 'x.com',
]

/** 同一批匯入常有大量重複的關鍵字（同系列不同賞等），查過的記著，省掉重複往返 */
const cache = new Map<string, string | null>()

function cleanName(name: string) {
  return name
    .replace(/[《》【】〔〕「」『』〈〉★☆♪～~！!？?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchText(url: string, timeout = 8000): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,zh-TW;q=0.9,en;q=0.7' },
      signal: AbortSignal.timeout(timeout),
    })
    return r.ok ? await r.text() : null
  } catch { return null }
}

/** DuckDuckGo 圖片搜尋。不需要 API key，中日文關鍵字都吃得下來 */
async function ddgImages(query: string): Promise<string[]> {
  try {
    const html = await fetchText('https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images')
    if (!html) return []
    // vqd 是 DDG 的一次性 token，要先從搜尋頁抓出來才叫得動圖片 API
    const vqd = html.match(/vqd=['"]([^'"]+)['"]/)?.[1]
    if (!vqd) return []
    const res = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&s=0&u=bing&f=,,,,,&l=us-en&vqd=${vqd}`,
      { headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((r: { image?: string }) => r.image).filter(Boolean) as string[]
  } catch { return [] }
}

function pickBest(urls: string[], barcode?: string | null): string | null {
  const scored = urls
    .filter(u => u.startsWith('http') && !SKIP_DOMAINS.some(d => u.toLowerCase().includes(d)))
    .map(u => {
      let s = 0
      // 條碼出現在網址裡通常代表是商品頁的正圖，不是週邊的示意圖
      if (barcode && u.includes(barcode)) s += 100
      if (/item-shopping\.c\.yimg\.jp/.test(u)) s += 70   // Yahoo 拍賣的商品圖品質穩定
      if (/bandai-a\.akamaihd\.net/.test(u)) s += 60      // 萬代官方 CDN
      if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)) s += 5
      return { u, s }
    })
    .sort((a, b) => b.s - a.s)
  return scored[0]?.u ?? null
}

/** 站內同名商品已經有圖就直接沿用。零外部請求，也保證圖一定活著 */
async function reuseFromDb(name: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from('products')
    .select('image_url')
    .eq('name', name)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.image_url ?? null
}

/** 下載外部圖、壓成 WebP、存進 R2，回自家網址 */
async function mirrorToR2(url: string): Promise<string | null> {
  if (R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL)) return url
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    // 太小的多半是圖示或佔位圖，存了也只是浪費
    if (buf.byteLength < 3000) return null
    const webp = await sharp(buf)
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    const key = `products/auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
    return await r2Upload(key, webp, 'image/webp')
  } catch { return null }
}

export interface FindImageInput {
  /** 呼叫端自訂的識別碼，回應會原樣帶回，用來對回哪個商品／品項 */
  key: string
  /** 商品名。品項圖請帶「商品名 品項名」，單獨的品項名搜不出東西 */
  query: string
  barcode?: string | null
  /** 只有商品主圖才查站內同名復用；品項圖不查，避免整批品項共用同一張商品照 */
  reuse?: boolean
}

export interface FindImageResult {
  key: string
  url: string | null
  source: 'db' | 'search' | null
}

/**
 * 補一張圖。查不到就回 null —— 寧可留空讓人知道要自己補，
 * 也不要塞一張不相干的圖進去，那比沒有更糟。
 */
export async function findImage(input: FindImageInput): Promise<FindImageResult> {
  const q = cleanName(input.query)
  if (!q) return { key: input.key, url: null, source: null }

  const cacheKey = `${input.reuse ? 'p' : 'v'}:${q}`
  if (cache.has(cacheKey)) {
    const hit = cache.get(cacheKey)!
    return { key: input.key, url: hit, source: hit ? 'search' : null }
  }

  if (input.reuse) {
    const dbUrl = await reuseFromDb(input.query.trim())
    if (dbUrl) {
      cache.set(cacheKey, dbUrl)
      return { key: input.key, url: dbUrl, source: 'db' }
    }
  }

  const best = pickBest(await ddgImages(q), input.barcode)
  const mirrored = best ? await mirrorToR2(best) : null
  cache.set(cacheKey, mirrored)
  return { key: input.key, url: mirrored, source: mirrored ? 'search' : null }
}

/**
 * 批次補圖。
 *
 * 併發開 4：DDG 打太快會開始回空結果（等於白跑），
 * 而一次一張又慢到讓請求逾時。實測 4 是穩定與速度的平衡點。
 */
export async function findImages(inputs: FindImageInput[], concurrency = 4): Promise<FindImageResult[]> {
  const out: FindImageResult[] = []
  let i = 0
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (i < inputs.length) {
      const idx = i++
      out.push(await findImage(inputs[idx]))
    }
  })
  await Promise.all(workers)
  return out
}
