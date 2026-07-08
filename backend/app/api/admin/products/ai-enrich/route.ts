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

// ─────────────────────────────────────────────────────────────────────────────
// 通用：從 HTML 頁面擷取商品圖片
// ─────────────────────────────────────────────────────────────────────────────
function extractImages(html: string): string[] {
  const seen = new Set<string>()
  const imgs: string[] = []
  const add = (url: string) => {
    if (!url || !url.startsWith('http') || seen.has(url)) return
    const lower = url.toLowerCase()
    if (['icon', 'logo', 'banner', 'avatar', 'sprite', 'button', 'blank', 'pixel'].some(k => lower.includes(k))) return
    seen.add(url); imgs.push(url)
  }
  // og:image first (most reliable main image)
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/)?.[1]
  if (og) add(og)
  // All img src
  for (const m of html.matchAll(/src=["'](https?:\/\/[^"'?\s]+\.(?:jpg|jpeg|png|webp|gif))["'?]/gi)) add(m[1])
  for (const m of html.matchAll(/data-src=["'](https?:\/\/[^"'?\s]+\.(?:jpg|jpeg|png|webp))["'?]/gi)) add(m[1])
  return imgs.slice(0, 25)
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': JA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    return await r.text()
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 1：Yahoo Japan Shopping（最廣覆蓋，任何廠牌）
// ─────────────────────────────────────────────────────────────────────────────
async function searchYahoo(name: string, typeKeyword: string, barcode?: string | null): Promise<{ images: string[]; detailUrl: string | null }> {
  const q = barcode ? encodeURIComponent(barcode) : encodeURIComponent(`${cleanName(name)} ${typeKeyword}`)
  const html = await fetchPage(`https://shopping.yahoo.co.jp/search?p=${q}&tab_ex=commerce`)
  if (!html) return { images: [], detailUrl: null }
  const images = [...html.matchAll(/src=["'](https?:\/\/item-shopping\.c\.yimg\.jp\/[^"']+)["']/g)].map(m => m[1])
  // Try to get first product detail URL
  const detailUrl = html.match(/href=["'](https?:\/\/shopping\.yahoo\.co\.jp\/product\/[^"']+)["']/)?.[1] ?? null
  return { images: images.slice(0, 8), detailUrl }
}

async function fetchYahooDetail(url: string): Promise<string[]> {
  const html = await fetchPage(url)
  if (!html) return []
  return extractImages(html).filter(u => u.includes('yimg.jp') || u.includes('yahoo'))
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 2：AmiAmi（アニメ・フィギュア専門）
// ─────────────────────────────────────────────────────────────────────────────
async function searchAmiAmi(name: string, barcode?: string | null): Promise<string[]> {
  const q = encodeURIComponent(barcode ?? cleanName(name))
  const html = await fetchPage(`https://search.amiami.com/top/search/list?s_keywords=${q}`)
  if (!html) return []
  const imgs: string[] = []
  for (const m of html.matchAll(/src=["'](https?:\/\/img\.amiami\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)) imgs.push(m[1])
  // Try first product detail
  const detailPath = html.match(/href=["']([^"']*\/detail\/[^"']+)["']/)?.[1]
  if (detailPath) {
    const base = detailPath.startsWith('http') ? detailPath : `https://www.amiami.com${detailPath}`
    const detail = await fetchPage(base)
    if (detail) {
      for (const m of detail.matchAll(/src=["'](https?:\/\/img\.amiami\.com\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)) imgs.push(m[1])
    }
  }
  return [...new Set(imgs)].slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 3：Rakuten（樂天市場，廣泛品牌）
// ─────────────────────────────────────────────────────────────────────────────
async function searchRakuten(name: string, typeKeyword: string, barcode?: string | null): Promise<string[]> {
  const q = encodeURIComponent(barcode ?? `${cleanName(name)} ${typeKeyword}`)
  const html = await fetchPage(`https://search.rakuten.co.jp/search/mall/${q}/`)
  if (!html) return []
  const imgs: string[] = []
  for (const m of html.matchAll(/src=["'](https?:\/\/thumbnail\.image\.rakuten\.co\.jp\/[^"']+)["']/g)) imgs.push(m[1])
  for (const m of html.matchAll(/src=["'](https?:\/\/shop\.r10s\.jp\/[^"']+\.(?:jpg|png|webp))["']/gi)) imgs.push(m[1])
  return [...new Set(imgs)].slice(0, 8)
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 4：Suruga-ya（駿河屋，日本最大二手，覆蓋率高）
// ─────────────────────────────────────────────────────────────────────────────
async function searchSurugaya(name: string, barcode?: string | null): Promise<string[]> {
  const q = encodeURIComponent(barcode ?? cleanName(name))
  const html = await fetchPage(`https://www.suruga-ya.jp/search?search_word=${q}&kind=5`)
  if (!html) return []
  const imgs: string[] = []
  for (const m of html.matchAll(/src=["'](https?:\/\/[^"']*suruga-ya[^"']*\.(?:jpg|jpeg|png|webp))["']/gi)) imgs.push(m[1])
  for (const m of html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["'][^>]*class=["'][^"']*product/gi)) imgs.push(m[1])
  return [...new Set(imgs)].slice(0, 8)
}

// ─────────────────────────────────────────────────────────────────────────────
// 層 5：DuckDuckGo image search（廣泛備援）
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
// 圖片評分（域名可信度）
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_DOMAINS = ['google', 'gstatic', 'facebook', 'twitter', 'instagram', 'youtube', 'blogspot', 'pinterest', 'wikimedia']
const TRUSTED: { d: string; s: number }[] = [
  { d: 'img.amiami.com',             s: 90 },
  { d: 'bandai-a.akamaihd.net',      s: 90 },
  { d: 'item-shopping.c.yimg.jp',    s: 80 },
  { d: 'thumbnail.image.rakuten',    s: 75 },
  { d: 'shop.r10s.jp',               s: 70 },
  { d: 'suruga-ya.jp',               s: 60 },
  { d: 'ec.amiami.com',              s: 65 },
  { d: 'amazon.co.jp',               s: 55 },
  { d: 'shopping.c.yimg.jp',         s: 50 },
]

function scoreImage(url: string, barcode: string | null): number {
  if (!url?.startsWith('http')) return -1
  const lower = url.toLowerCase()
  if (SKIP_DOMAINS.some(d => lower.includes(d))) return -1
  let s = 0
  if (barcode && url.includes(barcode)) s += 100
  for (const t of TRUSTED) { if (lower.includes(t.d)) { s += t.s; break } }
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) s += 5
  return s
}

function topN(candidates: string[], barcode: string | null, n: number): string[] {
  return candidates
    .map(url => ({ url, score: scoreImage(url, barcode) }))
    .filter(r => r.score >= 0)
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
          { type: 'text', text: `商品名稱「${productName}」。哪張圖最符合此商品？只回答數字 1~${Math.min(candidates.length, 5)}，不要其他文字。` },
        ],
      }],
    })
    const picked = parseInt(((msg.content[0] as any).text ?? '').trim())
    return (picked >= 1 && picked <= candidates.length) ? candidates[picked - 1] : candidates[0]
  } catch { return candidates[0] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Vision：從圖片陣列識別品項名稱
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
          { type: 'text', text: `這是${zhLabel}商品「${productName}」的 ${Math.min(imageUrls.length, 10)} 款品項圖（依序排列）。用繁體中文為每款命名（3-8字，識別角色或款式）。只輸出 ${Math.min(imageUrls.length, 10)} 行，每行一個名稱，不加編號。真的看不出來就留空行。` },
        ],
      }],
    })
    return ((msg.content[0] as any).text as string).trim()
      .split('\n').map((l: string) => l.replace(/^[\d.\-*、。\s]+/, '').trim())
      .filter((l: string) => l.length <= 20)  // 允許空行（代表未識別）
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

  const pType      = TYPE_JP_KEYWORD[product_type] ? product_type : 'gacha'
  const jpKeyword  = TYPE_JP_KEYWORD[pType]
  const zhLabel    = TYPE_ZH_LABEL[pType]
  const hintCount  = Math.max(Number(variants_count) || 0, 0)
  const clean      = cleanName(product_name)

  // 抽卡/自製賞：主圖通常難以自動找，不浪費 Claude API，直接用搜到的第一張
  const isHardType = pType === 'card' || pType === 'custom'

  try {
    // ── 層 1-5 全部並行 ───────────────────────────────────────────────────────
    const [yahoo, amiami, rakuten, surugaya, ddg1, ddg2] = await Promise.all([
      searchYahoo(product_name, jpKeyword, barcode),
      searchAmiAmi(product_name, barcode),
      searchRakuten(product_name, jpKeyword, barcode),
      searchSurugaya(product_name, barcode),
      ddgImages(`${clean} ${jpKeyword}`),
      ddgImages(`${clean} フィギュア 商品`),
    ])

    // Yahoo 商品詳情頁（有更多品項圖）
    const yahooDetailImgs = yahoo.detailUrl ? await fetchYahooDetail(yahoo.detailUrl) : []

    // ── 收集所有候選圖 ────────────────────────────────────────────────────────
    const allCandidates: string[] = [
      ...yahoo.images,
      ...yahooDetailImgs,
      ...amiami,
      ...rakuten,
      ...surugaya,
      ...ddg1,
      ...ddg2,
    ].filter(Boolean)

    // 評分 → 取前 8 名供 Claude Vision 選主圖
    const top = topN(allCandidates, barcode ?? null, 8)

    // 主圖：抽卡/自製賞直接取第一名，其他讓 Claude Vision 選
    const mainImage = top.length === 0
      ? null
      : isHardType
        ? top[0]
        : await claudePickBestImage(top, product_name)

    // ── 品項圖：從詳情頁 + 高可信域名圖中取 ─────────────────────────────────
    const variantCandidates = [
      ...yahooDetailImgs,
      ...amiami,
      ...surugaya,
    ].filter(u => u !== mainImage).slice(0, hintCount > 0 ? hintCount + 3 : 15)

    let variants: { name: string; image_url: string | null }[] = []
    if (variantCandidates.length > 0) {
      const visionNames = await nameVariantsByVision(product_name, variantCandidates, zhLabel)
      variants = variantCandidates.map((imgUrl, i) => ({
        name: visionNames[i] ?? '',
        image_url: imgUrl,
      }))
    }

    // 來源標記
    const source = amiami.length      ? 'amiami'
      : yahoo.images.length           ? 'yahoo_japan'
      : rakuten.length                ? 'rakuten'
      : surugaya.length               ? 'surugaya'
      : 'duckduckgo'

    return NextResponse.json({
      ok: true,
      source,
      data: {
        image_url: mainImage,
        variants,
        variant_count: variants.length,
        // jp_price_yen 不在此填（由 xlsx 帶入）
        distributor: null,  // 多平台無法確定代理商，讓 xlsx 帶或人工填
      },
      aiStatus: mainImage ? (isHardType ? 'partial' : 'done') : 'partial',
    })

  } catch (err: any) {
    console.error('[ai-enrich]', err)
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
