import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

// ── Bandai catalog scraper ────────────────────────────────────────────────────
async function scrapeBandaiCatalog(barcode: string) {
  try {
    const res = await fetch(
      `https://www.bandai.co.jp/catalog/item.php?jan_cd=${barcode}000`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const html = await res.text()
    const name = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim() ?? null
    if (!name) return null
    const jp_price_yen = html.match(/<span>(\d+)<\/span>円/) ? parseInt(html.match(/<span>(\d+)<\/span>円/)![1]) : null
    const thumbSection = html.match(/thumbnails[\s\S]*?(?=pg-productFlex|$)/)?.[0] ?? ''
    const images = [...thumbSection.matchAll(/src="(https:\/\/bandai-a\.akamaihd\.net\/bc\/img\/model\/[^"]+\.jpg)"/g)].map(m => m[1])
    if (!images.length) return null
    return { name, jp_price_yen, images }
  } catch { return null }
}

// ── Suruga-ya: Japanese name hints ───────────────────────────────────────────
async function scrapeJapaneseNameHints(barcode: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://www.suruga-ya.jp/search?category=0&search_word=${barcode}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const html = await res.text()
    const names = [...html.matchAll(/item_name:\s*common\.htmlDecode\('([^']+)'\)/g)]
      .map(m => m[1].split('「')[0].trim())
      .filter(n => n.length > 0 && !/全\d+種|セット|まとめ|BOX|\d+個セット/.test(n))
    return [...new Set(names)]
  } catch { return [] }
}

// ── DuckDuckGo image search ───────────────────────────────────────────────────
async function ddgImages(query: string): Promise<{ image: string }[]> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  }
  try {
    const htmlRes = await fetch(
      'https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images',
      { headers, signal: AbortSignal.timeout(8000) }
    )
    if (!htmlRes.ok) return []
    const html = await htmlRes.text()
    const vqd = html.match(/vqd=['"]([^'"]+)['"]/)?.[1]
    if (!vqd) return []
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&s=0&u=bing&f=,,,,,&l=us-en&vqd=${vqd}`,
      { headers: { ...headers, Referer: 'https://duckduckgo.com/' }, signal: AbortSignal.timeout(8000) }
    )
    if (!imgRes.ok) return []
    const data = await imgRes.json()
    return data.results ?? []
  } catch { return [] }
}

const SKIP = ['google', 'gstatic', 'facebook', 'twitter', 'instagram', 'youtube', 'blogspot', 'pinterest', 'wikimedia']
function scoreImage(url: string, barcode: string | null): number {
  if (!url?.startsWith('http')) return -1
  const lower = url.toLowerCase()
  if (SKIP.some(d => lower.includes(d))) return -1
  let score = 0
  if (barcode && url.includes(barcode)) score += 100
  if (lower.includes('item-shopping.c.yimg.jp')) score += 70
  if (lower.includes('bandai-a.akamaihd.net')) score += 60
  if (lower.includes('suruga-ya.jp')) score += 40
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) score += 5
  return score
}

function bestImage(results: { image: string }[], barcode: string | null): string | null {
  const scored = results
    .map(r => ({ url: r.image, score: scoreImage(r.image, barcode) }))
    .filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.url ?? null
}

// ── Claude Haiku: always generate complete Chinese variant names ───────────────
async function generateChineseNames(productName: string, count: number, jaHints: string[]): Promise<string[]> {
  if (count === 0) return []
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const hints = jaHints.length > 0 ? `參考日文名：${jaHints.join('、')}\n` : ''
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: '你是轉蛋商品命名助手，專為台灣玩家命名轉蛋品項。必須輸出剛好指定數量的繁體中文品項名稱，每行一個。不解釋、不道歉、不加編號。若日文名稱不足，根據商品類型合理推測補全。絕對不可輸出空行。',
      messages: [{ role: 'user', content: `${hints}轉蛋商品「${productName}」，輸出${count}行繁體中文品項名稱（每款3-8字）：` }],
    })
    const lines = ((msg.content[0] as any).text as string).split('\n')
    const names = lines.map(l => l.replace(/^[\d\.\-\*、。\s]+/, '').trim()).filter(l => l.length > 0 && l.length <= 20)
    // 如果 Claude 還是給少了，用商品名衍生補齊
    return Array.from({ length: count }, (_, k) => names[k] || `${productName.slice(0, 4)} ${k + 1}`)
  } catch { return [] }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { barcode, product_name, variants_count } = await req.json()
  if (!product_name) return NextResponse.json({ error: 'product_name required' }, { status: 400 })

  const variantCount = Math.max(Number(variants_count) || 0, 0)

  try {
    // Step 1+2: 免費爬蟲並行
    const [bandai, jaHints, ddgMain] = await Promise.all([
      barcode ? scrapeBandaiCatalog(barcode) : Promise.resolve(null),
      barcode ? scrapeJapaneseNameHints(barcode) : Promise.resolve([]),
      ddgImages((barcode ?? '') + ' ' + product_name + ' カプセルトイ'),
    ])

    // Step 3: Claude 生成繁中品項名（最後順位，但一定要回傳完整數量）
    const zhNames = variantCount > 0
      ? await generateChineseNames(product_name, variantCount, jaHints)
      : []

    // 主圖：Bandai 優先，fallback DDG
    const mainImage = bandai?.images[0] ?? bestImage(ddgMain, barcode ?? null)

    // 品項圖：Bandai 有就用，缺的並行補搜 DDG
    const variantImageSources = Array.from({ length: variantCount }, (_, k) => bandai?.images[k + 1] ?? null)
    const missingIndexes = variantImageSources.map((img, k) => img ? null : k).filter(k => k !== null) as number[]

    // 缺圖的品項：用品項名稱搜 DDG 補圖
    const fillImages: (string | null)[] = [...variantImageSources]
    if (missingIndexes.length > 0) {
      await Promise.all(
        missingIndexes.map(async k => {
          const variantName = zhNames[k] || product_name
          const results = await ddgImages(`${product_name} ${variantName} カプセルトイ`)
          fillImages[k] = bestImage(results, barcode ?? null) ?? bestImage(ddgMain.slice(k + 1), barcode ?? null) ?? null
        })
      )
    }

    // 如果還是有缺，從 DDG 主搜依序分配
    const ddgPool = ddgMain.slice(1)
    let ddgIdx = 0
    const variants = Array.from({ length: variantCount }, (_, k) => ({
      name: zhNames[k] ?? '',
      image_url: fillImages[k] ?? ddgPool[ddgIdx++]?.image ?? null,
    }))

    const jp_price_yen = bandai?.jp_price_yen ?? null
    const source = bandai ? 'bandai_catalog' : 'duckduckgo'

    const hasImage = !!mainImage
    const hasNames = zhNames.some(n => n.trim().length > 0)
    const aiStatus = (hasImage && hasNames) ? 'done' : 'partial'

    const distributor = bandai ? '萬代股份有限公司（BANDAI）' : null

    return NextResponse.json({
      ok: true,
      source,
      aiStatus,
      data: { jp_price_yen, image_url: mainImage, variants, distributor },
    })
  } catch (err: any) {
    console.error('[ai-enrich]', err)
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
