import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'

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

// ── DuckDuckGo image search (fallback when no barcode / Bandai fails) ─────────
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
function bestImage(results: { image: string }[], barcode: string | null): string | null {
  const scored = results
    .map(r => {
      const url = r.image
      if (!url?.startsWith('http')) return { url, score: -1 }
      const lower = url.toLowerCase()
      if (SKIP.some(d => lower.includes(d))) return { url, score: -1 }
      let score = 0
      if (barcode && url.includes(barcode)) score += 100
      if (lower.includes('item-shopping.c.yimg.jp')) score += 70
      if (lower.includes('bandai-a.akamaihd.net')) score += 60
      if (lower.includes('suruga-ya.jp')) score += 40
      if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) score += 5
      return { url, score }
    })
    .filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.url ?? null
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { barcode, product_name, variants_count } = await req.json()
  if (!product_name) return NextResponse.json({ error: 'product_name required' }, { status: 400 })

  const hintCount = Math.max(Number(variants_count) || 0, 0)

  try {
    // 免費爬蟲：Bandai 官方目錄（主圖 + 品項圖）
    const [bandai, ddgMain] = await Promise.all([
      barcode ? scrapeBandaiCatalog(barcode) : Promise.resolve(null),
      ddgImages((barcode ?? '') + ' ' + product_name + ' カプセルトイ'),
    ])

    // 品項數：從 Bandai 圖片數推算（images[0]=主圖，其餘=品項）
    const variantCount = hintCount > 0
      ? hintCount
      : bandai
        ? Math.max(bandai.images.length - 1, 0)
        : 0

    // 主圖：Bandai 優先，fallback DDG
    const mainImage = bandai?.images[0] ?? bestImage(ddgMain, barcode ?? null)

    // 品項圖：Bandai 官方目錄圖（順序可信），缺的才補 DDG
    const variantImageSources = Array.from({ length: variantCount }, (_, k) => bandai?.images[k + 1] ?? null)
    const missingIndexes = variantImageSources.map((img, k) => img ? null : k).filter(k => k !== null) as number[]

    const fillImages: (string | null)[] = [...variantImageSources]
    if (missingIndexes.length > 0) {
      const ddgPool = ddgMain.slice(1)
      missingIndexes.forEach((k, i) => {
        fillImages[k] = ddgPool[i]?.image ?? null
      })
    }

    // 品項名稱一律空白，讓用戶進編輯頁面看圖填名稱（AI 猜測的名稱不可靠）
    const variants = Array.from({ length: variantCount }, (_, k) => ({
      name: '',
      image_url: fillImages[k] ?? null,
    }))

    const jp_price_yen = bandai?.jp_price_yen ?? null
    const distributor = bandai ? '萬代股份有限公司（BANDAI）' : null
    const hasImage = !!mainImage
    const aiStatus = hasImage ? 'done' : 'partial'

    return NextResponse.json({
      ok: true,
      source: bandai ? 'bandai_catalog' : 'duckduckgo',
      data: { jp_price_yen, image_url: mainImage, variants, distributor, variant_count: variantCount },
      aiStatus,
    })
  } catch (err: any) {
    console.error('[ai-enrich]', err)
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
