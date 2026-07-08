import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const JA = 'ja,en;q=0.8'

// ─────────────────────────────────────────────────────────────────────────────
// 工具：清理商品名（去掉《》【】等干擾 DDG/Yahoo 搜尋的括號）
// ─────────────────────────────────────────────────────────────────────────────
function cleanName(name: string) {
  return name.replace(/[《》【】〔〕「」『』〈〉★☆]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 1：Bandai catalog（需要 JAN 條碼，最精確）
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeBandaiCatalog(barcode: string) {
  try {
    const res = await fetch(
      `https://www.bandai.co.jp/catalog/item.php?jan_cd=${barcode}000`,
      { headers: { 'User-Agent': UA, 'Accept-Language': JA }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const html = await res.text()
    const name = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim() ?? null
    if (!name) return null
    const jp_price_yen = html.match(/<span>(\d+)<\/span>円/)?.[1] ? parseInt(html.match(/<span>(\d+)<\/span>円/)![1]) : null
    const thumbSection = html.match(/thumbnails[\s\S]*?(?=pg-productFlex|$)/)?.[0] ?? ''
    const images = [...thumbSection.matchAll(/src="(https:\/\/bandai-a\.akamaihd\.net\/bc\/img\/model\/[^"]+\.jpg)"/g)].map(m => m[1])
    if (!images.length) return null
    return { name, jp_price_yen, images, source: 'bandai_catalog' as const }
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 2a：一番くじ 官方（kuji.co.jp）
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeKujiCoJp(name: string) {
  try {
    const q = encodeURIComponent(cleanName(name))
    const searchRes = await fetch(
      `https://kuji.co.jp/search/?keyword=${q}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': JA }, signal: AbortSignal.timeout(7000) }
    )
    if (!searchRes.ok) return null
    const html = await searchRes.text()

    // 從搜尋結果找第一個商品連結
    const productUrl = html.match(/href="(https:\/\/kuji\.co\.jp\/[^"]*kuji[^"]+)"/)?.[1]
    if (!productUrl) return null

    const detailRes = await fetch(productUrl, {
      headers: { 'User-Agent': UA, 'Accept-Language': JA }, signal: AbortSignal.timeout(7000)
    })
    if (!detailRes.ok) return null
    const detail = await detailRes.text()

    // 主圖
    const mainImage = detail.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null

    // 賞項圖片（尋找所有 kuji CDN 圖）
    const prizeImages = [...detail.matchAll(/src="(https?:\/\/[^"]*kuji[^"]*\.(jpg|jpeg|png|webp))"/gi)]
      .map(m => m[1]).filter(u => !u.includes('logo') && !u.includes('icon')).slice(0, 20)

    // 定價
    const priceMatch = detail.match(/(\d{1,3}(?:,\d{3})*)\s*円/)
    const jp_price_yen = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null

    return { mainImage, prizeImages, jp_price_yen, source: 'kuji_co_jp' as const }
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 2b：Gashapon 官方（gashapon.jp）
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeGashapon(name: string) {
  try {
    const q = encodeURIComponent(cleanName(name))
    const res = await fetch(
      `https://gashapon.jp/products/search.html?keyword=${q}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': JA }, signal: AbortSignal.timeout(7000) }
    )
    if (!res.ok) return null
    const html = await res.text()

    const mainImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
      ?? html.match(/<img[^>]+class="[^"]*product[^"]*"[^>]+src="([^"]+)"/)?.[1]
      ?? null

    const prizeImages = [...html.matchAll(/src="(https?:\/\/gashapon\.jp[^"]*\.(jpg|jpeg|png|webp))"/gi)]
      .map(m => m[1]).filter(u => !u.includes('logo')).slice(0, 15)

    const priceMatch = html.match(/(\d{1,3}(?:,\d{3})*)\s*円/)
    const jp_price_yen = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null

    return { mainImage, prizeImages, jp_price_yen, source: 'gashapon_jp' as const }
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 3a：Yahoo Japan Shopping（涵蓋所有廠牌）
// 支援：用商品名搜、或直接用 JAN 條碼搜（任何廠牌都能找到）
// ─────────────────────────────────────────────────────────────────────────────
async function searchYahooJapan(name: string, typeKeyword: string, barcode?: string | null) {
  try {
    // 有條碼優先用條碼搜（精確），否則用名稱
    const q = barcode
      ? encodeURIComponent(barcode)
      : encodeURIComponent(`${cleanName(name)} ${typeKeyword}`)
    const res = await fetch(
      `https://shopping.yahoo.co.jp/search?p=${q}&tab_ex=commerce`,
      { headers: { 'User-Agent': UA, 'Accept-Language': JA, 'Accept': 'text/html' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const html = await res.text()
    const images = [...html.matchAll(/src="(https?:\/\/item-shopping\.c\.yimg\.jp\/i\/[^"]+)"/g)]
      .map(m => m[1]).slice(0, 10)
    return images
  } catch { return [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 3b：DuckDuckGo image search（廣泛備援）
// ─────────────────────────────────────────────────────────────────────────────
async function ddgImages(query: string): Promise<{ image: string }[]> {
  try {
    const htmlRes = await fetch(
      'https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images',
      { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(7000) }
    )
    if (!htmlRes.ok) return []
    const html = await htmlRes.text()
    const vqd = html.match(/vqd=['"]([^'"]+)['"]/)?.[1]
    if (!vqd) return []
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&s=0&u=bing&f=,,,,,&l=us-en&vqd=${vqd}`,
      { headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' }, signal: AbortSignal.timeout(7000) }
    )
    if (!imgRes.ok) return []
    const data = await imgRes.json()
    return data.results ?? []
  } catch { return [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// 圖片評分（從 DDG/Yahoo 結果選最可信的主圖）
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_DOMAINS = ['google', 'gstatic', 'facebook', 'twitter', 'instagram', 'youtube', 'blogspot', 'pinterest', 'wikimedia']
const TRUSTED: { d: string; s: number }[] = [
  { d: 'bandai-a.akamaihd.net',   s: 90 },
  { d: 'kuji.co.jp',              s: 85 },
  { d: '1kuji.com',               s: 85 },
  { d: 'gashapon.jp',             s: 80 },
  { d: 'item-shopping.c.yimg.jp', s: 75 },
  { d: 'ec.amiami.com',           s: 65 },
  { d: 'img.hobbyco.net',         s: 65 },
  { d: 'www.amiami.com',          s: 60 },
  { d: 'suruga-ya.jp',            s: 55 },
  { d: 'rakuten.co.jp',           s: 50 },
  { d: 'amazon.co.jp',            s: 50 },
  { d: 'shopping.c.yimg.jp',      s: 45 },
]

function bestImage(candidates: string[], barcode: string | null): string | null {
  const scored = candidates.map(url => {
    if (!url?.startsWith('http')) return { url, score: -1 }
    const lower = url.toLowerCase()
    if (SKIP_DOMAINS.some(d => lower.includes(d))) return { url, score: -1 }
    let score = 0
    if (barcode && url.includes(barcode)) score += 100
    for (const t of TRUSTED) { if (lower.includes(t.d)) { score += t.s; break } }
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) score += 5
    return { url, score }
  }).filter(r => r.score >= 0).sort((a, b) => b.score - a.score)
  return scored[0]?.url ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 4a：Claude Vision 選最佳主圖（從多個候選圖中選最符合商品名的）
// ─────────────────────────────────────────────────────────────────────────────
async function claudePickBestImage(candidates: string[], productName: string): Promise<string | null> {
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const imageContent = candidates.slice(0, 5).map(url => ({
      type: 'image' as const,
      source: { type: 'url' as const, url },
    }))
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: `這些是第 1~${candidates.length} 張圖。商品名稱是「${productName}」。哪張圖最像這個商品？只回答數字（1~${candidates.length}），不要其他文字。` },
        ],
      }],
    })
    const picked = parseInt(((msg.content[0] as any).text ?? '').trim())
    if (picked >= 1 && picked <= candidates.length) return candidates[picked - 1]
    return candidates[0]
  } catch { return candidates[0] }
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 4b：Claude Vision 看圖命名品項
// ─────────────────────────────────────────────────────────────────────────────
async function nameVariantsByVision(productName: string, imageUrls: string[], zhLabel: string): Promise<string[]> {
  if (!imageUrls.length) return []
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          ...imageUrls.map(url => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
          { type: 'text', text: `這是${zhLabel}商品「${productName}」的 ${imageUrls.length} 款品項圖片（依序排列）。請看圖，用台灣繁體中文為每款命名（3-8字，要能識別是哪個角色或款式）。只輸出 ${imageUrls.length} 行名稱，每行一個，不加編號，不加其他文字。` },
        ],
      }],
    })
    return ((msg.content[0] as any).text as string).trim()
      .split('\n').map((l: string) => l.replace(/^[\d.\-*、。\s]+/, '').trim())
      .filter((l: string) => l.length > 0 && l.length <= 20)
  } catch { return [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// 型別對應
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_JP_KEYWORD: Record<string, string> = {
  ichiban:  '一番くじ',
  blindbox: 'ブラインドボックス フィギュア',
  gacha:    'ガチャ カプセルトイ',
  card:     'トレーディングカード',
  custom:   'フィギュア',
}
const TYPE_ZH_LABEL: Record<string, string> = {
  ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '集換式卡牌', custom: '自製賞',
}

// ─────────────────────────────────────────────────────────────────────────────
// 主 Handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { barcode, product_name, variants_count, product_type } = await req.json()
  if (!product_name) return NextResponse.json({ error: 'product_name required' }, { status: 400 })

  const hintCount  = Math.max(Number(variants_count) || 0, 0)
  const pType      = TYPE_JP_KEYWORD[product_type] ? product_type : 'gacha'
  const jpKeyword  = TYPE_JP_KEYWORD[pType]
  const zhLabel    = TYPE_ZH_LABEL[pType]
  const name       = product_name
  const clean      = cleanName(name)

  try {
    // ── 層 1+2+3 全部並行跑 ───────────────────────────────────────────────
    const [
      bandai,
      kuji,
      gashapon,
      yahooImages,
      ddg1,
      ddg2,
    ] = await Promise.all([
      barcode ? scrapeBandaiCatalog(barcode) : Promise.resolve(null),
      pType === 'ichiban' ? scrapeKujiCoJp(name) : Promise.resolve(null),
      pType === 'gacha'   ? scrapeGashapon(name) : Promise.resolve(null),
      searchYahooJapan(name, jpKeyword, barcode),  // 有條碼就用條碼搜（任何廠牌）
      ddgImages(`${clean} ${jpKeyword}`),
      ddgImages(`${clean} フィギュア 商品`),
    ])

    // ── 收集所有主圖候選（優先順序：Bandai > 官方站 > Yahoo > DDG）──────
    const mainCandidates: string[] = [
      bandai?.images[0],
      kuji?.mainImage,
      gashapon?.mainImage,
      ...yahooImages,
      ...ddg1.map(r => r.image),
      ...ddg2.map(r => r.image),
    ].filter(Boolean) as string[]

    // ── 用評分先篩一輪，再讓 Claude 從前幾名選最準的 ─────────────────────
    const topCandidates = mainCandidates
      .map(url => ({ url, score: (() => {
        const lower = url.toLowerCase()
        if (SKIP_DOMAINS.some(d => lower.includes(d))) return -1
        let s = 0
        if (barcode && url.includes(barcode)) s += 100
        for (const t of TRUSTED) { if (lower.includes(t.d)) { s += t.s; break } }
        if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) s += 5
        return s
      })() }))
      .filter(r => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(r => r.url)

    // 層 4a：Claude Vision 選主圖（如果有多個候選）
    const pickedImage = topCandidates.length > 1
      ? await claudePickBestImage(topCandidates, name)
      : topCandidates[0] ?? null

    // 驗證圖片可存取（HEAD check），失敗則嘗試下一個候選
    let mainImage: string | null = null
    const tryUrls = pickedImage
      ? [pickedImage, ...topCandidates.filter(u => u !== pickedImage)]
      : topCandidates
    for (const url of tryUrls) {
      try {
        const headRes = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(4000),
        })
        if (headRes.ok) { mainImage = url; break }
      } catch { /* 繼續嘗試下一個 */ }
    }

    // ── 品項圖（只用可信來源，不亂用 DDG）────────────────────────────────
    let variants: { name: string; image_url: string | null }[] = []
    const officialPrizeImages: (string | null)[] =
      bandai  ? Array.from({ length: hintCount || Math.max(bandai.images.length - 1, 0) }, (_, k) => bandai.images[k + 1] ?? null)
      : kuji?.prizeImages?.length ? kuji.prizeImages.map(img => img)
      : gashapon?.prizeImages?.length ? gashapon.prizeImages.map(img => img)
      : []

    if (officialPrizeImages.length) {
      const validUrls = officialPrizeImages.filter(Boolean) as string[]
      // 層 4b：Claude Vision 看圖命名
      const visionNames = await nameVariantsByVision(name, validUrls, zhLabel)
      let ni = 0
      variants = officialPrizeImages.map(imgUrl => ({
        name: imgUrl ? (visionNames[ni++] ?? '') : '',
        image_url: imgUrl,
      }))
    }

    // distributor 只在確認是萬代官方來源時標記，否則不推測
    const distributor = bandai ? '萬代股份有限公司（BANDAI）'
      : kuji ? '一番くじ（BANDAI）'
      : gashapon ? 'BANDAI Gashapon'
      : null  // 非萬代廠牌不自動填，讓使用者或廠商資料填

    const jp_price_yen = bandai?.jp_price_yen ?? kuji?.jp_price_yen ?? gashapon?.jp_price_yen ?? null

    const source = bandai ? 'bandai_catalog'
      : kuji ? 'kuji_co_jp'
      : gashapon ? 'gashapon_jp'
      : yahooImages.length ? 'yahoo_japan'
      : 'duckduckgo'

    return NextResponse.json({
      ok: true,
      source,
      data: {
        jp_price_yen,
        image_url: mainImage,
        variants,
        distributor,
        variant_count: variants.length,
      },
      aiStatus: mainImage ? 'done' : 'partial',
    })

  } catch (err: any) {
    console.error('[ai-enrich]', err)
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
