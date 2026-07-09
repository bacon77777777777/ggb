import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'
import { r2Upload } from '@/lib/r2'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const JA = 'ja,zh-TW;q=0.9,en;q=0.7'

async function fetchPage(url: string, timeout = 8000): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': JA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(timeout),
    })
    if (!r.ok) return null
    return await r.text()
  } catch { return null }
}

function cleanName(name: string) {
  return name.replace(/[《》【】〔〕「」『』〈〉★☆♪～~！!？?]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// DuckDuckGo 圖片搜尋（不需 API key，可用中日文關鍵字）
// ─────────────────────────────────────────────────────────────────────────────
async function ddgImages(query: string): Promise<{ image: string }[]> {
  try {
    const html = await fetchPage(
      'https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images'
    )
    if (!html) return []
    const vqd = html.match(/vqd=['"]([^'"]+)['"]/)?.[1]
    if (!vqd) return []
    const res = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&s=0&u=bing&f=,,,,,&l=us-en&vqd=${vqd}`,
      { headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch { return [] }
}
const SKIP_DOMAINS = ['google', 'gstatic', 'facebook', 'twitter', 'instagram', 'youtube', 'blogspot', 'pinterest', 'wikimedia']
function bestDdgImage(results: { image: string }[], barcode?: string | null): string | null {
  const scored = results
    .filter(r => r.image?.startsWith('http') && !SKIP_DOMAINS.some(d => r.image.toLowerCase().includes(d)))
    .map(r => {
      let s = 0
      if (barcode && r.image.includes(barcode)) s += 100
      if (/item-shopping\.c\.yimg\.jp/.test(r.image)) s += 70
      if (/bandai-a\.akamaihd\.net/.test(r.image)) s += 60
      if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(r.image)) s += 5
      return { url: r.image, s }
    })
    .sort((a, b) => b.s - a.s)
  return scored[0]?.url ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// 共用：從 HTML 提取品項 & 定價
// ─────────────────────────────────────────────────────────────────────────────
interface PrizeInfo { grade: string; name: string }

function extractPrizes(html: string): PrizeInfo[] {
  const prizes: PrizeInfo[] = []
  const seen = new Set<string>()
  const add = (grade: string, name: string) => {
    const key = grade.trim()
    if (key && name.trim() && !seen.has(key) && name.trim().length >= 2) {
      prizes.push({ grade: key, name: name.trim().slice(0, 40) })
      seen.add(key)
    }
  }
  // Table: <td>A賞</td><td>description</td>
  for (const m of html.matchAll(/<td[^>]*>\s*([A-ZＡ-Ｚ一ラＷW][^<]{0,12}?賞)\s*<\/td>\s*(?:<td[^>]*>)?\s*([^<]{2,40})\s*<\/td>/g))
    add(m[1], m[2])
  if (prizes.length >= 2) return prizes
  // Inline: "A賞：description"
  for (const m of html.matchAll(/([A-ZＡ-Ｚ一ラＷW][^<\n\s]{0,10}?賞)[：:\s\u3000]+([^<\n]{2,40})/g))
    add(m[1], m[2])
  if (prizes.length >= 2) return prizes
  // Heading: <hN>A賞 name</hN>
  for (const m of html.matchAll(/<h[1-6][^>]*>\s*([A-ZＡ-Ｚ一ラＷW][^<]{0,12}?賞)[^<]*([^<]{2,30})\s*<\/h[1-6]>/g))
    add(m[1], m[2])
  return prizes
}

function extractPrice(html: string): number | null {
  for (const m of html.matchAll(/(\d[\d,，]+)円/g)) {
    const val = parseInt(m[1].replace(/[,，]/g, ''))
    if (val >= 300 && val <= 30000) return val
  }
  return null
}

async function getFirstProductLink(html: string, base: string, pattern: RegExp): Promise<string | null> {
  const m = html.match(pattern)
  if (!m) return null
  const p = m[1]
  return p.startsWith('http') ? p : `${base}${p.startsWith('/') ? '' : '/'}${p}`
}

interface SiteResult {
  distributor: string
  jp_price_yen: number | null
  prizes: PrizeInfo[]
  source_site: string
  image_url?: string | null      // og:image 主圖
  variant_images?: string[]      // 品項縮圖（可給 Vision 命名）
}

// 從 HTML 取 og:image 和品項圖陣列
function extractOgImage(html: string): string | null {
  return html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1]?.trim()
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1]?.trim()
    ?? null
}
function extractSiteVariantImages(html: string, limit = 12): string[] {
  const skip = /logo|icon|arrow|header|footer|bg_|banner|button|sprite|\.svg|\.gif|loading|placeholder/i
  // 同時抓 src、data-src、data-lazy-src、data-original（日本站常用 lazy loading）
  const imgUrlRe = /https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"']*)?/gi
  const attrRe   = /(?:src|data-src|data-lazy(?:-src)?|data-original|data-img)="([^"]+)"/gi
  const urls: string[] = []
  for (const m of html.matchAll(attrRe)) {
    const inner = m[1]
    const matched = inner.match(imgUrlRe)
    if (matched) urls.push(...matched)
  }
  return urls
    .filter(u => !skip.test(u))
    .reduce((acc: string[], u) => (acc.includes(u) ? acc : [...acc, u]), [])
    .slice(0, limit)
}

// 一行附加圖片資訊（所有爬蟲共用）
function withImages(r: Omit<SiteResult, 'image_url' | 'variant_images'>, html: string): SiteResult {
  const ogImg = extractOgImage(html)
  // 過濾掉主圖避免它出現在品項圖陣列第一位造成位移
  const imgs = extractSiteVariantImages(html).filter(u => u !== ogImg)
  return { ...r, image_url: ogImg, variant_images: imgs.length >= 2 ? imgs : undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ 一番賞 系列 ════
// ─────────────────────────────────────────────────────────────────────────────

// BANDAI SPIRITS 一番くじ
async function search1kuji(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://1kuji.com/products/?keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://1kuji.com', /href="(\/products\/\d+\/)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  if (!prizes.length) return null
  return withImages({ distributor: 'BANDAI SPIRITS', jp_price_yen: extractPrice(detail), prizes, source_site: '1kuji.com' }, detail)
}

// FuRyu みんなのくじ
async function searchCharahiroba(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://charahiroba.com/kuji/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://charahiroba.com', /href="(https:\/\/charahiroba\.com\/kuji\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  if (!prizes.length) return null
  return withImages({ distributor: 'FuRyu（富留由）', jp_price_yen: extractPrice(detail), prizes, source_site: 'charahiroba.com' }, detail)
}

// SEGA Lucky賞
async function searchSegaPlaza(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://segaplaza.jp/prize/?keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://segaplaza.jp', /href="(\/prize\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  if (!prizes.length) return null
  return withImages({ distributor: 'SEGA（世嘉）', jp_price_yen: extractPrice(detail), prizes, source_site: 'segaplaza.jp' }, detail)
}

// KEN MEDIA ひこくじ
async function searchHikokuji(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://hikokuji.com/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://hikokuji.com', /href="(https:\/\/hikokuji\.com\/[^"#?]+\/)"/)
  if (!url || url === 'https://hikokuji.com/') return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  if (!prizes.length) return null
  return withImages({ distributor: 'KEN MEDIA', jp_price_yen: extractPrice(detail), prizes, source_site: 'hikokuji.com' }, detail)
}

// KADOKAWA くじ引き堂
async function searchKujibikido(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://kujibikido.com/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://kujibikido.com', /href="(https:\/\/kujibikido\.com\/[^"#?]+\/)"/)
  if (!url || url === 'https://kujibikido.com/') return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  if (!prizes.length) return null
  return withImages({ distributor: 'KADOKAWA（角川）', jp_price_yen: extractPrice(detail), prizes, source_site: 'kujibikido.com' }, detail)
}

// TAITO くじ
async function searchTaitokuji(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.taito.co.jp/taitokuji/search?q=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.taito.co.jp', /href="(\/taitokuji\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  if (!prizes.length) return null
  return withImages({ distributor: 'TAITO（太東）', jp_price_yen: extractPrice(detail), prizes, source_site: 'taito.co.jp' }, detail)
}

// Sanrio 当りくじ
async function searchSanrioKuji(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.sanrio.co.jp/atarikuji/?keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const prizes = extractPrizes(html)
  const url = await getFirstProductLink(html, 'https://www.sanrio.co.jp', /href="(\/atarikuji\/[^"]+)"/)
  const detail = url ? await fetchPage(url) : null
  const finalPrizes = detail ? extractPrizes(detail) : prizes
  if (!finalPrizes.length) return null
  return withImages({ distributor: 'Sanrio（三麗鷗）', jp_price_yen: extractPrice(detail ?? html), prizes: finalPrizes, source_site: 'sanrio.co.jp' }, detail ?? html)
}

// SQUARE ENIX 福引賞
async function searchSquareEnix(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.jp.square-enix.com/goods/search/?keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.jp.square-enix.com', /href="(\/goods\/detail\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  if (!prizes.length) return null
  return withImages({ distributor: 'SQUARE ENIX', jp_price_yen: extractPrice(detail), prizes, source_site: 'square-enix.com' }, detail)
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ 轉蛋 系列 ════
// ─────────────────────────────────────────────────────────────────────────────

// BANDAI Gashapon 官網
async function searchGashapon(name: string, barcode?: string | null): Promise<SiteResult | null> {
  const q = encodeURIComponent(barcode ?? name)
  const html = await fetchPage(`https://gashapon.jp/products/?keyword=${q}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://gashapon.jp', /href="(\/products\/detail\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  const price = extractPrice(detail)
  // 萬代轉蛋 → 確認代理商
  return withImages({ distributor: '萬代股份有限公司（BANDAI）', jp_price_yen: price, prizes, source_site: 'gashapon.jp' }, detail)
}

// T-ARTS (TAKARA TOMY A.R.T.S)
async function searchTarts(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.takaratomy-arts.co.jp/items/gacha/?keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.takaratomy-arts.co.jp', /href="(\/items\/gacha\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: 'T-ARTS（TAKARA TOMY A.R.T.S）', jp_price_yen: extractPrice(detail), prizes, source_site: 'takaratomy-arts.co.jp' }, detail)
}

// KITAN CLUB
async function searchKitan(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://kitan.jp/products/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://kitan.jp', /href="(https:\/\/kitan\.jp\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: 'KITAN CLUB（奇譚俱樂部）', jp_price_yen: extractPrice(detail), prizes, source_site: 'kitan.jp' }, detail)
}

// KENELEPHANT
async function searchKenelephant(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://kenelephant.co.jp/gacha/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://kenelephant.co.jp', /href="(https:\/\/kenelephant\.co\.jp\/gacha\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: 'KENELEPHANT', jp_price_yen: extractPrice(detail), prizes, source_site: 'kenelephant.co.jp' }, detail)
}

// EPOCH
async function searchEpoch(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://epoch.jp/rc/capsule/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://epoch.jp', /href="(https:\/\/epoch\.jp\/rc\/capsule\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: 'EPOCH（艾波）', jp_price_yen: extractPrice(detail), prizes, source_site: 'epoch.jp' }, detail)
}

// Qualia
async function searchQualia(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://qualia-45.jp/products_category/gacha/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://qualia-45.jp', /href="(https:\/\/qualia-45\.jp\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: 'Qualia', jp_price_yen: extractPrice(detail), prizes, source_site: 'qualia-45.jp' }, detail)
}

// Bushiroad Creative（転蛋/景品）
async function searchBushiroad(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://bushiroad-creative.com/items?types=capsule&keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://bushiroad-creative.com', /href="(https:\/\/bushiroad-creative\.com\/items\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: 'Bushiroad Creative（武士道）', jp_price_yen: extractPrice(detail), prizes, source_site: 'bushiroad-creative.com' }, detail)
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ 盒玩 系列 ════
// ─────────────────────────────────────────────────────────────────────────────

// RE-MENT
async function searchRement(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.re-ment.co.jp/product/?keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.re-ment.co.jp', /href="(\/product\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  // RE-MENT 品項通常用 No. 列舉
  const prizes: PrizeInfo[] = []
  for (const m of (detail).matchAll(/No\.\s*(\d+)\s*[「『]?([^「『\n<]{3,30})[」』]?/g))
    prizes.push({ grade: `No.${m[1]}`, name: m[2].trim() })
  if (!prizes.length) prizes.push(...extractPrizes(detail))
  return withImages({ distributor: 'RE-MENT', jp_price_yen: extractPrice(detail), prizes, source_site: 're-ment.co.jp' }, detail)
}

// Megahouse
async function searchMegahouse(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.megahobby.jp/search/?q=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.megahobby.jp', /href="(\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: 'Megahouse（メガハウス）', jp_price_yen: extractPrice(detail), prizes, source_site: 'megahobby.jp' }, detail)
}

// Good Smile Company
async function searchGoodSmile(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.goodsmile.com/ja/products/category/scale/?keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.goodsmile.com', /href="(https:\/\/www\.goodsmile\.com\/ja\/product\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: 'Good Smile Company（好微笑）', jp_price_yen: extractPrice(detail), prizes, source_site: 'goodsmile.com' }, detail)
}

// Kotobukiya
async function searchKotobukiya(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.kotobukiya.co.jp/search/?q=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.kotobukiya.co.jp', /href="(\/product\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return withImages({ distributor: '壽屋（Kotobukiya）', jp_price_yen: extractPrice(detail), prizes, source_site: 'kotobukiya.co.jp' }, detail)
}

// POP MART
async function searchPopMart(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.popmart.com/tw/search?keywords=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.popmart.com', /href="(https:\/\/www\.popmart\.com\/tw\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  // POP MART 品項從 variant listing 取
  const prizes: PrizeInfo[] = []
  for (const m of (detail).matchAll(/["']name["']\s*:\s*["']([^"']{3,30})["']/g))
    prizes.push({ grade: '', name: m[1] })
  if (!prizes.length) prizes.push(...extractPrizes(detail))
  return withImages({ distributor: 'POP MART（泡泡瑪特）', jp_price_yen: extractPrice(detail), prizes, source_site: 'popmart.com' }, detail)
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ 卡牌 系列 ════
// ─────────────────────────────────────────────────────────────────────────────

// Weiss Schwarz
async function searchWeissSchwarz(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://ws-tcg.com/products/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://ws-tcg.com', /href="(https:\/\/ws-tcg\.com\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return { distributor: 'Bushiroad（Weiβ Schwarz）', jp_price_yen: extractPrice(detail), prizes, source_site: 'ws-tcg.com' }
}

// Cardfight!! Vanguard
async function searchVanguard(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://cf-vanguard.com/products/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://cf-vanguard.com', /href="(https:\/\/cf-vanguard\.com\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return { distributor: 'Bushiroad（Cardfight!! Vanguard）', jp_price_yen: extractPrice(detail), prizes, source_site: 'cf-vanguard.com' }
}

// UNION ARENA
async function searchUnionArena(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.unionarena-tcg.com/tc/products/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.unionarena-tcg.com', /href="(https:\/\/www\.unionarena-tcg\.com\/tc\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return { distributor: '萬代股份有限公司（BANDAI）', jp_price_yen: extractPrice(detail), prizes, source_site: 'unionarena-tcg.com' }
}

// Reバース
async function searchRebirth(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://rebirth-fy.com/products/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://rebirth-fy.com', /href="(https:\/\/rebirth-fy\.com\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return { distributor: 'Bushiroad（Reバース）', jp_price_yen: extractPrice(detail), prizes, source_site: 'rebirth-fy.com' }
}

// OSICA
async function searchOsica(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://osicatcg.com/product/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://osicatcg.com', /href="(https:\/\/osicatcg\.com\/product\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return { distributor: 'Movic（OSICA）', jp_price_yen: extractPrice(detail), prizes, source_site: 'osicatcg.com' }
}

// Shadowverse EVOLVE
async function searchShadowverse(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://shadowverse-evolve.com/products/?s=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://shadowverse-evolve.com', /href="(https:\/\/shadowverse-evolve\.com\/products\/[^"]+)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return { distributor: 'Bushiroad（Shadowverse EVOLVE）', jp_price_yen: extractPrice(detail), prizes, source_site: 'shadowverse-evolve.com' }
}

// Battle Spirits
async function searchBattleSpirits(name: string): Promise<SiteResult | null> {
  const html = await fetchPage(`https://www.battlespirits.com/product/search.php?keyword=${encodeURIComponent(name)}`)
  if (!html) return null
  const url = await getFirstProductLink(html, 'https://www.battlespirits.com', /href="(\/product\/[^"]+\.php)"/)
  if (!url) return null
  const detail = await fetchPage(url)
  if (!detail) return null
  const prizes = extractPrizes(detail)
  return { distributor: '萬代股份有限公司（BANDAI）', jp_price_yen: extractPrice(detail), prizes, source_site: 'battlespirits.com' }
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ 萬代官網目錄（圖片 + 定價）════
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeBandaiCatalog(barcode: string): Promise<{
  jp_price_yen: number | null
  variant_count: number | null
  images: string[]  // index 0 = 主圖, 1..N = 品項圖
} | null> {
  const html = await fetchPage(`https://www.bandai.co.jp/catalog/item.php?jan_cd=${barcode}000`)
  if (!html) return null
  const name = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim() ?? null
  if (!name) return null
  const jp_price_yen = html.match(/<span>(\d+)<\/span>円/)?.[1]
    ? parseInt(html.match(/<span>(\d+)<\/span>円/)![1]) : null
  const thumbSection = html.match(/thumbnails[\s\S]*?(?=pg-productFlex|$)/)?.[0] ?? ''
  const images = [...thumbSection.matchAll(/src="(https:\/\/bandai-a\.akamaihd\.net\/bc\/img\/model\/[^"]+\.jpg)"/g)]
    .map(m => m[1])
  return { jp_price_yen, variant_count: images.length > 1 ? images.length - 1 : null, images }
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ Claude Vision 看圖命名（圖文天然配對）════
// ─────────────────────────────────────────────────────────────────────────────
async function nameVariantsByVision(productName: string, imageUrls: string[]): Promise<string[]> {
  if (imageUrls.length === 0) return []
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          ...imageUrls.map(url => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
          {
            type: 'text',
            text: `這是商品「${productName}」的 ${imageUrls.length} 款品項圖片（依序排列）。請看圖，用台灣繁體中文為每款命名（3-10字，能識別角色或款式）。只輸出 ${imageUrls.length} 行名稱，每行一個，不加編號。`,
          },
        ],
      }],
    })
    return ((msg.content[0] as any).text as string).trim()
      .split('\n')
      .map((l: string) => l.replace(/^[\d.\-*、。\s]+/, '').trim())
      .filter((l: string) => l.length >= 2 && l.length <= 25)
  } catch { return [] }
}

async function scrapePriceFromYahoo(name: string, barcode?: string | null): Promise<number | null> {
  const q = encodeURIComponent(barcode ?? cleanName(name))
  const html = await fetchPage(`https://shopping.yahoo.co.jp/search?p=${q}&tab_ex=commerce`)
  if (!html) return null
  const m = html.match(/(\d{3,6})\s*円/)
  return m ? parseInt(m[1]) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ Storage 圖片比對 ════
// ─────────────────────────────────────────────────────────────────────────────
async function resolveStorageImage(raw_image_name: string | null): Promise<string | null> {
  if (!raw_image_name) return null
  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')
  const url  = `${base}/products/${raw_image_name}`
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
    return res.ok ? url : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ DB 比對（條碼 / 商品名稱）════
// ─────────────────────────────────────────────────────────────────────────────
async function fetchFromDB(barcode: string | null) {
  if (!barcode) return null
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('products')
    .select('image_url, distributor, jp_price_yen, product_prizes(name, image_url)')
    .eq('barcode', barcode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    image_url: data.image_url ?? null,
    distributor: data.distributor ?? null,
    jp_price_yen: data.jp_price_yen ?? null,
    prizes: (data.product_prizes ?? []).map((p: any) => ({ name: p.name ?? '', image_url: p.image_url ?? null })),
  }
}

async function fetchImageFromDBByName(name: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('products')
    .select('image_url')
    .eq('name', name)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const url = data?.image_url
  if (!url) return null
  // HEAD 驗證：Storage 檔案可能已清除，死連結直接排除
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
    return r.ok ? url : null
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ Claude 識別 IP + 轉換日文搜尋詞 ════
// ─────────────────────────────────────────────────────────────────────────────
interface ClaudeIdent {
  distributor: string | null
  jp_search_query: string | null   // 用於日本官方網站搜尋框的關鍵字
  jp_price_yen: number | null
  variant_names: string[]          // Claude 依訓練資料推測的品項名
}
async function claudeIdentify(name: string, type: string, count: number): Promise<ClaudeIdent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const typeZh: Record<string, string> = {
    ichiban: '一番賞', gacha: '轉蛋扭蛋', blindbox: '盒玩', card: '集換式卡牌', custom: '自製賞',
  }
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `你是日本玩具/一番賞/轉蛋/卡牌商品的資深採購。

商品名稱：${name}
商品類型：${typeZh[type] ?? type}
品項數量：${count > 0 ? count : '不確定'}

請用你的專業知識回答以下問題（JSON 格式，不要其他文字）：
1. distributor: **製作這個抽獎盒/転蛋商品的原廠商**名稱（注意：是製作「抽獎產品本身」的公司，不是盒內獎品的品牌。例如一番賞盒的製作者是 "BANDAI SPIRITS"，不是盒內 iPhone 的品牌 Apple）
2. jp_search_query: 最適合在日本官方網站搜尋框輸入的關鍵字（日文，保留 IP 名稱和版本號如 P6/vol.3 等）
3. jp_price_yen: 日本建議售價（日幣，整數；一番賞通常 800-1000，轉蛋通常 300-500；不確定就 null）
4. variant_names: 你所知道的這個商品的品項名稱陣列（繁體中文，最多 ${Math.max(count, 6)} 個；若不清楚就空陣列）

廠商識別說明：
- "一番賞"/"一番くじ" → BANDAI SPIRITS（包含含 Apple/電子產品獎的版本）
- "潮玩賞" 是台灣競品平台的自定義名稱，忽略它，看獎品內容判斷真正廠商
- "みんなのくじ" → FuRyu（富留由）
- "Lucky賞/ラッキーくじ" → SEGA（世嘉）
- "ひこくじ" → KEN MEDIA
- "くじ引き堂" → KADOKAWA（角川）
- 轉蛋/扭蛋：萬代 Gashapon → BANDAI、TOMY ARTS → T-ARTS、奇譚クラブ → Kitan Club
- 盒玩：RE-MENT、Megahouse、Good Smile Company 等

{"distributor":null,"jp_search_query":null,"jp_price_yen":null,"variant_names":[]}`,
      }],
    })
    const text = ((msg.content[0] as any).text ?? '{}').trim()
    const p = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    return {
      distributor:     typeof p.distributor === 'string' ? p.distributor : null,
      jp_search_query: typeof p.jp_search_query === 'string' ? p.jp_search_query : null,
      jp_price_yen:    typeof p.jp_price_yen === 'number' ? p.jp_price_yen : null,
      variant_names:   Array.isArray(p.variant_names) ? p.variant_names.slice(0, 20) : [],
    }
  } catch {
    return { distributor: null, jp_search_query: null, jp_price_yen: null, variant_names: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ Claude 品項名稱生成 ════
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_ZH: Record<string, string> = {
  ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '集換式卡牌', custom: '自製賞',
}

async function generateVariantNames(
  productName: string,
  count: number,
  type: string,
  sitePrizes?: PrizeInfo[],
  existingNames?: string[],
): Promise<{ grade: string; name: string }[]> {
  if (count <= 0) return []
  const zhType = TYPE_ZH[type] ?? '扭蛋'
  // 如果品牌網站已拿到足夠品項，直接用
  if (sitePrizes && sitePrizes.length >= count) return sitePrizes.slice(0, count)
  // 若品項名已齊全
  if (existingNames?.length === count && existingNames.every(n => n?.trim()))
    return existingNames.map((n, i) => ({ grade: sitePrizes?.[i]?.grade ?? '', name: n }))

  const knownParts = (sitePrizes?.length ? sitePrizes : existingNames?.map(n => ({ grade: '', name: n })) ?? [])
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `這是${zhType}商品「${productName}」，共有 ${count} 款品項。
${knownParts.length ? `已知品項（可能不完整）：\n${knownParts.map((p, i) => `${i + 1}. ${p.grade ? p.grade + ' ' : ''}${p.name}`).join('\n')}\n\n` : ''}請用繁體中文補全或生成所有 ${count} 款品項名稱。
- 一番賞通常是 A賞、B賞、C賞... 搭配角色/物品描述
- 盒玩/轉蛋按角色、配色或型態命名
- 每款 3-15 字，能識別款式即可

輸出 ${count} 行，每行格式：A賞 角色名稱（若有等級），無等級就直接名稱，不加編號。`,
      }],
    })
    const lines = ((msg.content[0] as any).text as string).trim().split('\n')
      .map((l: string) => {
        const grade = l.match(/^([A-ZＡ-Ｚ一ラＷW][^\u3000\s]{0,6}?賞)/)?.[1] ?? ''
        const name  = l.replace(/^[A-ZＡ-Ｚ一ラＷW][^\u3000\s]{0,6}?賞\s*/, '').replace(/^[\d.\-*、。\s]+/, '').trim()
        return { grade, name: name || l.trim() }
      })
      .filter(r => r.name.length > 0 && r.name.length <= 30)
    return lines.slice(0, count)
  } catch {
    return (sitePrizes ?? existingNames?.map(n => ({ grade: '', name: n })) ?? []).slice(0, count)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ════ 主 Handler ════
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    barcode,
    product_name,
    variants_count,
    product_type,
    raw_image_name,
    existing_variant_names,
  } = await req.json()

  if (!product_name) return NextResponse.json({ error: 'product_name required' }, { status: 400 })

  const pType     = product_type ?? 'gacha'
  const hintCount = Math.max(Number(variants_count) || 0, 0)
  const clean     = cleanName(product_name)

  try {
    // ── Step 1: Storage 圖片配對（HEAD 驗證 R2 確實有此檔）────────────────────
    const storageImageUrl = await resolveStorageImage(raw_image_name ?? null)

    // ── Step 2: DB 條碼復用 ──────────────────────────────────────────────────
    const dbResult = await fetchFromDB(barcode ?? null)
    if (dbResult && (dbResult.image_url || dbResult.prizes.length || dbResult.distributor)) {
      const cnt = hintCount || dbResult.prizes.length
      const named = await generateVariantNames(product_name, cnt, pType,
        dbResult.prizes.map(p => ({ grade: '', name: p.name })), existing_variant_names)
      return NextResponse.json({
        ok: true, source: 'db_existing',
        data: {
          image_url:     storageImageUrl ?? dbResult.image_url,
          variants:      named.map((v, i) => ({ ...v, image_url: dbResult.prizes[i]?.image_url ?? null })),
          variant_count: named.length,
          jp_price_yen:  dbResult.jp_price_yen,
          distributor:   dbResult.distributor,
        },
        aiStatus: 'done',
      })
    }

    // ── Step 2.5: DB 商品名稱復用圖片 ────────────────────────────────────────
    const dbImageByName = storageImageUrl ? null : await fetchImageFromDBByName(product_name)

    // ── Step 3: Claude 識別 IP + 取得日文搜尋詞（並行執行，不等待網路）────
    const identified = await claudeIdentify(product_name, pType, hintCount)
    // 優先用 Claude 提供的日文搜尋詞；若無則用清理過的商品名
    const jpQuery  = identified.jp_search_query ? cleanName(identified.jp_search_query) : clean

    // ── Step 4: 品牌網站搜尋（按類型路由，並行）───────────────────────────
    type SearchFn = () => Promise<SiteResult | null>

    const SOURCES: Record<string, SearchFn[]> = {
      ichiban: [
        () => search1kuji(jpQuery),
        () => searchCharahiroba(jpQuery),
        () => searchSegaPlaza(jpQuery),
        () => searchHikokuji(jpQuery),
        () => searchKujibikido(jpQuery),
        () => searchTaitokuji(jpQuery),
        () => searchSanrioKuji(jpQuery),
        () => searchSquareEnix(jpQuery),
      ],
      gacha: [
        () => searchGashapon(jpQuery, barcode),
        () => searchTarts(jpQuery),
        () => searchKitan(jpQuery),
        () => searchKenelephant(jpQuery),
        () => searchEpoch(jpQuery),
        () => searchQualia(jpQuery),
        () => searchBushiroad(jpQuery),
      ],
      blindbox: [
        () => searchRement(jpQuery),
        () => searchMegahouse(jpQuery),
        () => searchGoodSmile(jpQuery),
        () => searchKotobukiya(jpQuery),
        () => searchPopMart(jpQuery),
      ],
      card: [
        () => searchWeissSchwarz(jpQuery),
        () => searchVanguard(jpQuery),
        () => searchUnionArena(jpQuery),
        () => searchRebirth(jpQuery),
        () => searchOsica(jpQuery),
        () => searchShadowverse(jpQuery),
        () => searchBattleSpirits(jpQuery),
      ],
      custom: [
        () => search1kuji(jpQuery),
        () => searchCharahiroba(jpQuery),
        () => searchSegaPlaza(jpQuery),
        () => searchHikokuji(jpQuery),
        () => searchKujibikido(jpQuery),
        () => searchMegahouse(jpQuery),
        () => searchGoodSmile(jpQuery),
      ],
    }

    const fns = SOURCES[pType] ?? SOURCES.gacha
    let siteResult: SiteResult | null = null

    if (fns.length > 0) {
      const results = await Promise.all(fns.map(f => f().catch(() => null)))
      siteResult = results.find(r => r && r.prizes.length > 0) ?? null
    }

    // ── Step 5: 萬代官網（含圖）+ Yahoo 定價 + DDG × 2 並行 ──────────────
    const needImg    = !storageImageUrl && !dbImageByName
    const typeSuffix = pType === 'ichiban' ? ' 一番くじ' : pType === 'gacha' ? ' ガチャ' : pType === 'blindbox' ? ' フィギュア' : ''
    // 同時用日文查詢 + 原始中文商品名查詢，取最佳圖
    const ddgQueryJp = jpQuery + typeSuffix
    const ddgQueryZh = clean + typeSuffix
    const [bandai, yahooPrice, ddgResJp, ddgResZh] = await Promise.all([
      barcode ? scrapeBandaiCatalog(barcode) : null,
      !siteResult?.jp_price_yen ? scrapePriceFromYahoo(jpQuery, barcode) : null,
      needImg ? ddgImages(ddgQueryJp) : Promise.resolve([]),
      needImg && ddgQueryJp !== ddgQueryZh ? ddgImages(ddgQueryZh) : Promise.resolve([]),
    ])
    const bandaiMainImg     = bandai?.images?.[0] ?? null
    const bandaiVariantImgs = bandai?.images?.slice(1) ?? []
    // 合併兩組 DDG 結果，優先日文（更精準），中文補位
    const ddgResults = [...ddgResJp, ...ddgResZh.filter(r => !ddgResJp.some(j => j.image === r.image))]
    const ddgImage   = needImg && !bandaiMainImg ? bestDdgImage(ddgResults, barcode) : null

    // 合併：網站結果 > Claude 識別 > 萬代備援
    const jp_price_yen = siteResult?.jp_price_yen ?? bandai?.jp_price_yen ?? yahooPrice ?? identified.jp_price_yen ?? null
    const distributor  = siteResult?.distributor ?? identified.distributor ?? (bandaiMainImg ? 'BANDAI' : null)
    const variantCount = hintCount || siteResult?.prizes.length || bandai?.variant_count || 0

    // ── Step 6: 命名（有品項圖 → 配對；無圖 → 文字）──────────────────────
    // 圖片來源優先順序：Bandai 官方目錄 > 品牌網站爬蟲
    const siteVariantImgs = siteResult?.variant_images ?? []
    const visionImgs = bandaiVariantImgs.length > 0 ? bandaiVariantImgs : siteVariantImgs
    let namedVariants: { grade: string; name: string; image_url: string | null }[]

    if (siteResult && siteResult.prizes.length >= 2 && siteVariantImgs.length >= 2) {
      // 快速配對路線：站點已有品項名 + 站點有圖 → 直接對應，不需 Vision
      const count = Math.max(variantCount || 1, siteResult.prizes.length)
      namedVariants = Array.from({ length: count }, (_, k) => ({
        grade:     siteResult!.prizes[k]?.grade ?? '',
        name:      (existing_variant_names?.[k]?.trim()) || siteResult!.prizes[k]?.name || '',
        image_url: siteVariantImgs[k] ?? null,
      }))
    } else if (bandaiVariantImgs.length >= 2) {
      // Bandai catalog Vision 路線：Bandai CDN 圖片看圖命名
      const count = Math.max(variantCount || 1, bandaiVariantImgs.length)
      const imgSlice = bandaiVariantImgs.slice(0, Math.min(count, 12))
      const visionNames = await nameVariantsByVision(product_name, imgSlice)
      namedVariants = Array.from({ length: count }, (_, k) => ({
        grade:     siteResult?.prizes[k]?.grade ?? '',
        name:      (existing_variant_names?.[k]?.trim()) || visionNames[k] || siteResult?.prizes[k]?.name || '',
        image_url: bandaiVariantImgs[k] ?? null,
      }))
    } else if (visionImgs.length >= 2) {
      // 其他有圖路線（站點圖但無品項名）
      const count = Math.max(variantCount || 1, visionImgs.length)
      const imgSlice = visionImgs.slice(0, Math.min(count, 12))
      const visionNames = await nameVariantsByVision(product_name, imgSlice)
      namedVariants = Array.from({ length: count }, (_, k) => ({
        grade:     siteResult?.prizes[k]?.grade ?? '',
        name:      (existing_variant_names?.[k]?.trim()) || visionNames[k] || siteResult?.prizes[k]?.name || '',
        image_url: visionImgs[k] ?? null,
      }))
    } else {
      // 文字路線：網站品項 > Claude 已知 > 生成；CSV 名稱完整則保留
      const csvComplete = (existing_variant_names?.length ?? 0) >= variantCount
        && existing_variant_names!.every((n: string) => n?.trim())
      if (csvComplete) {
        namedVariants = existing_variant_names!.map((n: string, k: number) => ({
          grade:     siteResult?.prizes[k]?.grade ?? '',
          name:      n,
          image_url: null,
        }))
      } else {
        const claudePrizes = identified.variant_names.length >= (variantCount || 1)
          ? identified.variant_names.map(n => ({ grade: '', name: n }))
          : undefined
        const textNamed = await generateVariantNames(
          product_name, variantCount, pType,
          siteResult?.prizes ?? claudePrizes, existing_variant_names ?? [],
        )
        namedVariants = textNamed.map(v => ({ ...v, image_url: null as string | null }))
      }
    }

    const rawImage = bandaiMainImg ?? siteResult?.image_url ?? ddgImage ?? dbImageByName ?? storageImageUrl ?? null
    const source = siteResult?.source_site
      ?? (bandaiMainImg ? 'bandai_catalog' : identified.jp_search_query ? 'claude_identified' : 'claude_generated')

    // 找到外部圖片就下載壓縮後存到 R2，確保 Vercel 地區可訪問性
    let finalImage = rawImage
    if (rawImage && !rawImage.startsWith((process.env.R2_PUBLIC_URL ?? '!!!'))) {
      try {
        const imgRes = await fetch(rawImage, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) })
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer())
          const compressed = await sharp(buf)
            .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer()
          const key = `products/ai-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
          finalImage = await r2Upload(key, compressed, 'image/webp')
        }
      } catch { /* 下載失敗保留原始 URL */ }
    }

    return NextResponse.json({
      ok: true,
      source,
      data: {
        image_url:     finalImage,
        variants:      namedVariants,
        variant_count: namedVariants.length,
        jp_price_yen,
        distributor,
      },
      aiStatus: (jp_price_yen || distributor || namedVariants.length > 0 || finalImage) ? 'done' : 'partial',
    })

  } catch (err: any) {
    console.error('[ai-enrich]', err)
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
