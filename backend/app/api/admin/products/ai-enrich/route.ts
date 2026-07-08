import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const JA = 'ja,zh-TW;q=0.9,en;q=0.7'

function cleanName(name: string) {
  return name.replace(/[《》【】〔〕「」『』〈〉★☆♪]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchPage(url: string, timeout = 8000): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': JA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(timeout),
    })
    if (!r.ok) return null
    return await r.text()
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 0: 萬代官方目錄（JAN 條碼精確命中，最準確）
// 直接回傳：主圖 + 品項圖（官方順序）+ 日幣定價 + distributor
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeBandaiCatalog(barcode: string): Promise<{
  jp_price_yen: number | null
  images: string[]   // [0]=主圖, [1..]=品項圖（官方排序）
} | null> {
  const html = await fetchPage(`https://www.bandai.co.jp/catalog/item.php?jan_cd=${barcode}000`)
  if (!html) return null
  const name = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim()
  if (!name) return null
  const jp_price_yen = html.match(/<span>(\d+)<\/span>円/)?.[1]
    ? parseInt(html.match(/<span>(\d+)<\/span>円/)![1]) : null
  const thumbSection = html.match(/thumbnails[\s\S]*?(?=pg-productFlex|$)/)?.[0] ?? ''
  const images = [...thumbSection.matchAll(/src="(https:\/\/bandai-a\.akamaihd\.net\/bc\/img\/model\/[^"]+\.jpg)"/g)]
    .map(m => m[1])
  if (!images.length) return null
  return { jp_price_yen, images }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1: Yahoo Japan Shopping（廣覆蓋，任何廠牌）
// 搜尋頁取主圖候選；找到 detail URL 再抓品項圖
// ─────────────────────────────────────────────────────────────────────────────
async function searchYahoo(name: string, typeKeyword: string, barcode?: string | null) {
  const q = barcode
    ? encodeURIComponent(barcode)
    : encodeURIComponent(`${cleanName(name)} ${typeKeyword}`)
  const html = await fetchPage(`https://shopping.yahoo.co.jp/search?p=${q}&tab_ex=commerce`)
  if (!html) return { mainImages: [], detailImages: [] }

  // 搜尋結果主圖（高可信度域名）
  const mainImages = [...html.matchAll(/src=["'](https?:\/\/item-shopping\.c\.yimg\.jp\/i\/[^"']+)["']/g)]
    .map(m => m[1]).slice(0, 6)

  // 第一個商品 detail URL
  const detailUrl = html.match(/href=["'](https?:\/\/shopping\.yahoo\.co\.jp\/product\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)["']/)?.[1]
  let detailImages: string[] = []
  if (detailUrl) {
    const dHtml = await fetchPage(detailUrl)
    if (dHtml) {
      detailImages = [...dHtml.matchAll(/src=["'](https?:\/\/item-shopping\.c\.yimg\.jp\/i\/[^"']+)["']/g)]
        .map(m => m[1]).slice(0, 12)
    }
  }
  return { mainImages, detailImages }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2: AmiAmi（アニメ/フィギュア専門，品項圖較可靠）
// 只從 detail 頁抓產品圖，不從搜尋結果頁抓（避免抓到 icon）
// ─────────────────────────────────────────────────────────────────────────────
async function searchAmiAmi(name: string, barcode?: string | null): Promise<string[]> {
  const q = encodeURIComponent(barcode ?? cleanName(name))
  const html = await fetchPage(`https://search.amiami.com/top/search/list?s_keywords=${q}`)
  if (!html) return []

  // 找 detail 頁 URL（/detail/ 路徑）
  const detailPath = html.match(/href=["']([^"']*\/detail\/[A-Za-z0-9_-]+)["']/)?.[1]
  if (!detailPath) return []

  const base = detailPath.startsWith('http') ? detailPath : `https://www.amiami.com${detailPath}`
  const dHtml = await fetchPage(base)
  if (!dHtml) return []

  // 只取 AmiAmi 產品圖路徑（cc/series, cc/main, images/product 等）
  const imgs: string[] = []
  for (const m of dHtml.matchAll(/src=["'](https?:\/\/img\.amiami\.com\/cc\/(?:series|main|goods)[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)) {
    imgs.push(m[1])
  }
  return [...new Set(imgs)].slice(0, 12)
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3: Rakuten（廣泛品牌，主圖候選）
// ─────────────────────────────────────────────────────────────────────────────
async function searchRakuten(name: string, typeKeyword: string, barcode?: string | null): Promise<string[]> {
  const q = encodeURIComponent(barcode ?? `${cleanName(name)} ${typeKeyword}`)
  const html = await fetchPage(`https://search.rakuten.co.jp/search/mall/${q}/`)
  if (!html) return []
  const imgs: string[] = []
  for (const m of html.matchAll(/src=["'](https?:\/\/thumbnail\.image\.rakuten\.co\.jp[^"']+)["']/g)) imgs.push(m[1])
  return [...new Set(imgs)].slice(0, 6)
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 4: Suruga-ya（駿河屋，覆蓋率極高）
// ─────────────────────────────────────────────────────────────────────────────
async function searchSurugaya(name: string, barcode?: string | null): Promise<string[]> {
  const q = encodeURIComponent(barcode ?? cleanName(name))
  const html = await fetchPage(`https://www.suruga-ya.jp/search?search_word=${q}&kind=5`)
  if (!html) return []
  const imgs: string[] = []
  for (const m of html.matchAll(/src=["'](https?:\/\/[^"']*suruga-ya[^"']*\.(?:jpg|jpeg|png|webp))["']/gi)) imgs.push(m[1])
  return [...new Set(imgs)].slice(0, 6)
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 5: DuckDuckGo image search
// ─────────────────────────────────────────────────────────────────────────────
async function ddgImages(query: string): Promise<string[]> {
  try {
    const htmlRes = await fetch(
      'https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images',
      { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(7000) }
    )
    if (!htmlRes.ok) return []
    const vqd = (await htmlRes.text()).match(/vqd=['"]([^'"]+)['"]/)?.[1]
    if (!vqd) return []
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&s=0&u=bing&f=,,,,,&l=us-en&vqd=${vqd}`,
      { headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' }, signal: AbortSignal.timeout(7000) }
    )
    if (!imgRes.ok) return []
    const data = await imgRes.json()
    return (data.results ?? []).map((r: any) => r.image).filter(Boolean)
  } catch { return [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// 圖片評分
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_DOMAINS = ['google', 'gstatic', 'facebook', 'twitter', 'instagram', 'youtube', 'blogspot', 'pinterest', 'wikimedia']
const TRUSTED: { d: string; s: number }[] = [
  { d: 'bandai-a.akamaihd.net',      s: 95 },
  { d: 'img.amiami.com/cc',          s: 90 },
  { d: 'item-shopping.c.yimg.jp',    s: 80 },
  { d: 'thumbnail.image.rakuten',    s: 70 },
  { d: 'suruga-ya.jp',               s: 60 },
  { d: 'ec.amiami.com',              s: 55 },
  { d: 'shopping.c.yimg.jp',         s: 50 },
]

function scoreImage(url: string, barcode: string | null): number {
  if (!url?.startsWith('http')) return -1
  const lower = url.toLowerCase()
  if (SKIP_DOMAINS.some(d => lower.includes(d))) return -1
  // filter out obvious icons/UI elements
  if (['icon', 'logo', 'banner', 'avatar', 'sprite', 'button', 'blank', 'pixel',
    'cart', 'bell', 'badge', 'new_', '_new', 'star', 'nav', 'menu'].some(k => lower.includes(k))) return -1
  let s = 0
  if (barcode && url.includes(barcode)) s += 100
  for (const t of TRUSTED) { if (lower.includes(t.d)) { s += t.s; break } }
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) s += 5
  return s
}

function topN(candidates: string[], barcode: string | null, n: number): string[] {
  const seen = new Set<string>()
  return candidates
    .map(url => ({ url, score: scoreImage(url, barcode) }))
    .filter(r => r.score >= 0 && !seen.has(r.url) && seen.add(r.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(r => r.url)
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Vision：從候選圖選最佳主圖
// ─────────────────────────────────────────────────────────────────────────────
async function claudePickBestImage(candidates: string[], productName: string): Promise<string | null> {
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: [
          ...candidates.slice(0, 5).map(url => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
          { type: 'text', text: `商品名稱「${productName}」。哪張圖最符合此商品的主圖？只回答數字 1~${Math.min(candidates.length, 5)}，不要其他文字。` },
        ],
      }],
    })
    const picked = parseInt(((msg.content[0] as any).text ?? '').trim())
    return (picked >= 1 && picked <= candidates.length) ? candidates[picked - 1] : candidates[0]
  } catch { return candidates[0] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Vision：看圖命名品項
// ─────────────────────────────────────────────────────────────────────────────
async function nameVariantsByVision(productName: string, imageUrls: string[], zhLabel: string): Promise<string[]> {
  if (!imageUrls.length) return []
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          ...imageUrls.slice(0, 10).map(url => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
          { type: 'text', text: `這是${zhLabel}商品「${productName}」的 ${Math.min(imageUrls.length, 10)} 款品項圖（依序排列）。用繁體中文為每款命名（3-8字，識別角色/款式/造型）。輸出 ${Math.min(imageUrls.length, 10)} 行，每行一個名稱，看不出來就留空行，不加編號。` },
        ],
      }],
    })
    return ((msg.content[0] as any).text as string).trim()
      .split('\n')
      .map((l: string) => l.replace(/^[\d.\-*、。\s]+/, '').trim())
      .filter((l: string) => l.length <= 20)
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

  const pType     = TYPE_JP_KEYWORD[product_type] ? product_type : 'gacha'
  const jpKeyword = TYPE_JP_KEYWORD[pType]
  const zhLabel   = TYPE_ZH_LABEL[pType]
  const hintCount = Math.max(Number(variants_count) || 0, 0)
  const clean     = cleanName(product_name)
  const isHardType = pType === 'card' || pType === 'custom'

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // Layer 0: 萬代官方目錄（有 JAN 條碼時最優先）
    // 命中 → 直接用，完全跳過其他搜尋，確保主圖/品項/代理商最精確
    // ══════════════════════════════════════════════════════════════════════════
    if (barcode) {
      const bandai = await scrapeBandaiCatalog(barcode)
      if (bandai && bandai.images.length > 0) {
        const mainImage     = bandai.images[0]
        const variantImages = bandai.images.slice(1)
        // 用 hintCount 修正品項數（有時 Bandai 圖多於實際款式）
        const sliced = hintCount > 0 && hintCount < variantImages.length
          ? variantImages.slice(0, hintCount)
          : variantImages

        const visionNames = sliced.length > 0
          ? await nameVariantsByVision(product_name, sliced, zhLabel)
          : []
        const variants = sliced.map((imgUrl, i) => ({
          name:      visionNames[i] ?? '',
          image_url: imgUrl,
        }))

        return NextResponse.json({
          ok: true,
          source: 'bandai_catalog',
          data: {
            image_url:     mainImage,
            variants,
            variant_count: variants.length,
            jp_price_yen:  bandai.jp_price_yen,
            distributor:   '萬代股份有限公司（BANDAI）',
          },
          aiStatus: 'done',
        })
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Layer 1-5: 非萬代 / 條碼找不到 → 多平台並行搜尋
    // ══════════════════════════════════════════════════════════════════════════
    const [yahoo, amiami, rakuten, surugaya, ddg1, ddg2] = await Promise.all([
      searchYahoo(product_name, jpKeyword, barcode),
      searchAmiAmi(product_name, barcode),
      searchRakuten(product_name, jpKeyword, barcode),
      searchSurugaya(product_name, barcode),
      ddgImages(`${clean} ${jpKeyword}`),
      ddgImages(`${clean} フィギュア 商品`),
    ])

    // 主圖候選（只用搜尋結果頁的高可信域名圖）
    const mainCandidates = topN([
      ...yahoo.mainImages,
      ...amiami.slice(0, 2),
      ...rakuten,
      ...surugaya,
      ...ddg1,
      ...ddg2,
    ], barcode ?? null, 6)

    const mainImage = mainCandidates.length === 0
      ? null
      : isHardType
        ? mainCandidates[0]
        : await claudePickBestImage(mainCandidates, product_name)

    // 品項圖：只從 detail 頁（Yahoo detail + AmiAmi detail）取，不從搜尋結果取
    // 這樣可避免抓到搜尋頁的 UI icon
    const variantPool = [
      ...yahoo.detailImages.filter(u => u !== mainImage),
      ...amiami.slice(0, hintCount > 0 ? hintCount + 2 : 10).filter(u => u !== mainImage),
    ].slice(0, hintCount > 0 ? hintCount + 3 : 12)

    let variants: { name: string; image_url: string | null }[] = []
    if (variantPool.length > 0) {
      const visionNames = await nameVariantsByVision(product_name, variantPool, zhLabel)
      variants = variantPool.map((imgUrl, i) => ({
        name:      visionNames[i] ?? '',
        image_url: imgUrl,
      }))
    }

    const source = amiami.length     ? 'amiami'
      : yahoo.mainImages.length      ? 'yahoo_japan'
      : rakuten.length               ? 'rakuten'
      : surugaya.length              ? 'surugaya'
      : 'duckduckgo'

    return NextResponse.json({
      ok: true,
      source,
      data: {
        image_url:     mainImage,
        variants,
        variant_count: variants.length,
        jp_price_yen:  null,      // 非萬代時不自動填（由 xlsx 帶入）
        distributor:   null,      // 非萬代無法確定代理商
      },
      aiStatus: mainImage ? (isHardType ? 'partial' : 'done') : 'partial',
    })

  } catch (err: any) {
    console.error('[ai-enrich]', err)
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
