import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

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

// ── Claude Vision: 看圖命名，名稱與圖片天然配對 ───────────────────────────────
async function nameVariantsByVision(
  productName: string,
  imageUrls: string[],  // variant images only (no main image)
  zhLabel = '轉蛋'
): Promise<string[]> {
  if (imageUrls.length === 0) return []
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const imageContent = imageUrls.map(url => ({
      type: 'image' as const,
      source: { type: 'url' as const, url },
    }))

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `這是${zhLabel}商品「${productName}」的 ${imageUrls.length} 款品項圖片（依序排列）。請看圖，用台灣繁體中文為每款命名（3-8字，要能識別是哪個角色或款式）。只輸出 ${imageUrls.length} 行名稱，每行一個，不加編號，不加其他文字。`,
          },
        ],
      }],
    })

    const text = ((msg.content[0] as any).text as string).trim()
    const names = text.split('\n')
      .map(l => l.replace(/^[\d.\-*、。\s]+/, '').trim())
      .filter(l => l.length > 0 && l.length <= 20)

    return names
  } catch { return [] }
}

// ── DuckDuckGo image search (fallback) ───────────────────────────────────────
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

// 各類型信任圖片來源（分數越高越可信）
const TRUSTED_DOMAINS: { domain: string; score: number }[] = [
  { domain: 'bandai-a.akamaihd.net',    score: 80 }, // Bandai 官方 CDN
  { domain: 'kuji.co.jp',               score: 75 }, // 一番くじ 官方
  { domain: '1kuji.com',                score: 75 }, // 一番くじ 另站
  { domain: 'item-shopping.c.yimg.jp',  score: 70 }, // Yahoo Japan 商品圖
  { domain: 'gashapon.jp',              score: 65 }, // Bandai 官方轉蛋站
  { domain: 'ec.amiami.com',            score: 60 }, // AmiAmi（模型大站）
  { domain: 'img.hobbyco.net',          score: 60 }, // HobbySearch
  { domain: 'suruga-ya.jp',             score: 50 }, // 駿河屋
  { domain: 'amazon.co.jp',             score: 45 }, // Amazon JP
  { domain: 'shopping.c.yimg.jp',       score: 40 }, // Yahoo Japan 一般
]

function bestImage(results: { image: string }[], barcode: string | null): string | null {
  const scored = results
    .map(r => {
      const url = r.image
      if (!url?.startsWith('http')) return { url, score: -1 }
      const lower = url.toLowerCase()
      if (SKIP.some(d => lower.includes(d))) return { url, score: -1 }
      let score = 0
      if (barcode && url.includes(barcode)) score += 100
      for (const t of TRUSTED_DOMAINS) {
        if (lower.includes(t.domain)) { score += t.score; break }
      }
      if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) score += 5
      return { url, score }
    })
    .filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.url ?? null
}

// 一番くじ 官方站搜尋（不需要條碼）
async function scrapeIchibanKuji(productName: string): Promise<{ image: string | null }> {
  try {
    const query = encodeURIComponent(productName.replace(/[《》【】]/g, ' ').trim())
    const res = await fetch(
      `https://kuji.co.jp/search/?keyword=${query}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return { image: null }
    const html = await res.text()
    // 抓第一個商品圖
    const img = html.match(/class="[^"]*product[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1]
      ?? html.match(/<img[^>]+src="(https:\/\/kuji\.co\.jp[^"]+\.(jpg|png|webp))"/)?.[1]
      ?? null
    return { image: img }
  } catch { return { image: null } }
}

// Type-specific Japanese search keywords for DuckDuckGo
const TYPE_JP_KEYWORD: Record<string, string> = {
  ichiban:  '一番くじ',
  blindbox: 'ブラインドボックス',
  gacha:    'カプセルトイ',
  card:     'トレーディングカード',
  custom:   '一番くじ',
}

// Type-specific Chinese label for Claude Vision prompt
const TYPE_ZH_LABEL: Record<string, string> = {
  ichiban:  '一番賞',
  blindbox: '盒玩',
  gacha:    '轉蛋',
  card:     '集換式卡牌',
  custom:   '自製賞',
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { barcode, product_name, variants_count, product_type } = await req.json()
  if (!product_name) return NextResponse.json({ error: 'product_name required' }, { status: 400 })

  const hintCount = Math.max(Number(variants_count) || 0, 0)
  const pType = product_type && TYPE_JP_KEYWORD[product_type] ? product_type : 'gacha'
  const jpKeyword = TYPE_JP_KEYWORD[pType]
  const zhLabel   = TYPE_ZH_LABEL[pType]

  // 清除 《》【】〔〕等括號（保留內容）以提升 DDG 搜尋命中率
  const cleanName = product_name
    .replace(/[《》【】〔〕「」『』〈〉]/g, ' ')
    .replace(/\s+/g, ' ').trim()

  try {
    // Step 1: 並行抓各來源
    const [bandai, ichibanResult, ddgMain] = await Promise.all([
      barcode ? scrapeBandaiCatalog(barcode) : Promise.resolve(null),
      pType === 'ichiban' ? scrapeIchibanKuji(cleanName) : Promise.resolve({ image: null }),
      ddgImages((barcode ?? '') + ' ' + cleanName + ' ' + jpKeyword),
    ])

    // 主圖：Bandai 官方 > 一番くじ官方 > DDG 最佳
    const mainImage = bandai?.images[0] ?? ichibanResult.image ?? bestImage(ddgMain, barcode ?? null)

    // 品項圖：只用 Bandai 官方圖（有條碼才可信）
    // 沒有 Bandai 來源時不亂填 DDG 圖，避免填入不相關圖片
    let variants: { name: string; image_url: string | null }[] = []
    if (bandai && bandai.images.length > 1) {
      const variantCount = hintCount > 0 ? hintCount : Math.max(bandai.images.length - 1, 0)
      const variantImages = Array.from({ length: variantCount }, (_, k) => bandai.images[k + 1] ?? null)
      const validImageUrls = variantImages.filter(url => url !== null) as string[]
      const visionNames = validImageUrls.length > 0
        ? await nameVariantsByVision(product_name, validImageUrls, zhLabel)
        : []
      let nameIdx = 0
      variants = variantImages.map(imgUrl => ({
        name: imgUrl ? (visionNames[nameIdx++] ?? '') : '',
        image_url: imgUrl,
      }))
    }

    const distributor = bandai ? '萬代股份有限公司（BANDAI）' : null
    const aiStatus = mainImage ? 'done' : 'partial'

    return NextResponse.json({
      ok: true,
      source: bandai ? 'bandai_catalog' : 'duckduckgo',
      data: {
        jp_price_yen: bandai?.jp_price_yen ?? null,
        image_url: mainImage,
        variants,
        distributor,
        variant_count: variants.length,
      },
      aiStatus,
    })
  } catch (err: any) {
    console.error('[ai-enrich]', err)
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
