import * as XLSX from 'xlsx'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabaseAdmin'
import crypto from 'crypto'

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''

// ── LINE API helpers ──────────────────────────────────────────────────────────

export async function pushLineMessage(targetId: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: targetId, messages: [{ type: 'text', text }] }),
  })
}

// Download message content from LINE data API
export async function downloadLineMessageContent(messageId: string): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30_000) }
    )
    if (!res.ok) return null
    if ((res.headers.get('content-type') ?? '').includes('text/html')) return null
    return Buffer.from(await res.arrayBuffer())
  } catch { return null }
}

// xlsx = zip magic bytes PK (50 4B 03 04)
function isXlsxBuffer(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4B
}

// ── Xlsx parsing ──────────────────────────────────────────────────────────────

interface ParsedProduct {
  sku: string
  barcode: string | null
  name: string
  manufacturer_code: string
  per_case: number
  cases: number
  total_count: number
  jp_price_yen: number | null
}

function parseMoWeiRows(rows: any[][]): ParsedProduct[] {
  const result: ParsedProduct[] = []
  for (const row of rows) {
    const sku      = String(row[0] ?? '').trim()
    const barcode  = String(row[1] ?? '').replace(/\.0$/, '').trim()
    const perCase  = Number(row[2]) || 0
    const cases    = Number(row[3]) || 0
    const totalRaw = Number(row[4]) || 0
    const fullName = String(row[5] ?? '').trim()
    if (!sku || !fullName || sku === '品名') continue

    const mfxMatch    = fullName.match(/^([A-Z]+)\//)
    const mfxCode     = mfxMatch?.[1] ?? ''
    const nameRaw     = fullName.replace(/^[A-Z]+\//, '').replace(/\s*@[\d\s x]+\d+\s*$/, '').trim()
    const formatMatch = fullName.match(/@(\d+)x(\d+)\s+(\d+)/)
    const pcsPerBag   = formatMatch ? parseInt(formatMatch[1]) : 0
    const bagsPerCase = formatMatch ? parseInt(formatMatch[2]) : 0
    const jpPriceCode = formatMatch ? parseInt(formatMatch[3]) : 0
    const totalCount  = totalRaw || (perCase * cases) || (pcsPerBag * bagsPerCase * cases)

    result.push({
      sku,
      barcode: barcode || null,
      name: nameRaw || fullName,
      manufacturer_code: mfxCode,
      per_case: perCase,
      cases,
      total_count: totalCount > 0 ? totalCount : (pcsPerBag * bagsPerCase),
      jp_price_yen: jpPriceCode > 0 ? jpPriceCode * 10 : null,
    })
  }
  return result
}

function parseXlsxBuffer(buffer: Buffer): ParsedProduct[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (rows.length < 2) continue
    const header = rows[0].map((h: any) => String(h).trim())
    if (header[0] === '品名' && header[1] === '國際條碼') {
      const products = parseMoWeiRows(rows.slice(1))
      if (products.length > 0) return products
    }
  }
  return []
}

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

// ── DuckDuckGo image search ───────────────────────────────────────────────────

async function ddgImages(query: string): Promise<{ image: string }[]> {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept-Language': 'zh-TW,zh;q=0.9' }
  try {
    const htmlRes = await fetch('https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images', { headers, signal: AbortSignal.timeout(8000) })
    if (!htmlRes.ok) return []
    const vqd = (await htmlRes.text()).match(/vqd=['"]([^'"]+)['"]/)?.[1]
    if (!vqd) return []
    const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&s=0&u=bing&f=,,,,,&l=us-en&vqd=${vqd}`, { headers: { ...headers, Referer: 'https://duckduckgo.com/' }, signal: AbortSignal.timeout(8000) })
    if (!imgRes.ok) return []
    return (await imgRes.json()).results ?? []
  } catch { return [] }
}

const SKIP = ['google', 'gstatic', 'facebook', 'twitter', 'instagram', 'youtube', 'blogspot', 'pinterest', 'wikimedia']
function bestImage(results: { image: string }[], barcode: string | null): string | null {
  const scored = results.map(r => {
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
  }).filter(r => r.score >= 0).sort((a, b) => b.score - a.score)
  return scored[0]?.url ?? null
}

// ── Claude Vision variant naming ──────────────────────────────────────────────

async function nameVariantsByVision(productName: string, imageUrls: string[]): Promise<string[]> {
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
          { type: 'text', text: `這是轉蛋商品「${productName}」的 ${imageUrls.length} 款品項圖片（依序排列）。請看圖，用台灣繁體中文為每款命名（3-8字，要能識別是哪個角色或款式）。只輸出 ${imageUrls.length} 行名稱，每行一個，不加編號，不加其他文字。` },
        ],
      }],
    })
    const text = ((msg.content[0] as any).text as string).trim()
    return text.split('\n').map(l => l.replace(/^[\d.\-*、。\s]+/, '').trim()).filter(l => l.length > 0 && l.length <= 20)
  } catch { return [] }
}

// ── Enrich one product ────────────────────────────────────────────────────────

interface EnrichedProduct extends ParsedProduct {
  image_url: string         // required — products without image are skipped
  distributor: string | null
  variants: { name: string; image_url: string | null }[]
  variant_count: number
}

async function enrichProduct(p: ParsedProduct): Promise<EnrichedProduct | null> {
  const [bandai, ddgMain] = await Promise.all([
    p.barcode ? scrapeBandaiCatalog(p.barcode) : Promise.resolve(null),
    ddgImages((p.barcode ?? '') + ' ' + p.name + ' カプセルトイ'),
  ])

  const variantCount = bandai ? Math.max(bandai.images.length - 1, 0) : 0
  const mainImage = bandai?.images[0] ?? bestImage(ddgMain, p.barcode)
  if (!mainImage) return null  // critical fail — no image

  const variantImages: (string | null)[] = Array.from({ length: variantCount }, (_, k) => bandai?.images[k + 1] ?? null)
  const ddgPool = ddgMain.slice(1)
  let ddgIdx = 0
  const filledImages = variantImages.map(img => img ?? ddgPool[ddgIdx++]?.image ?? null)

  const validImageUrls = filledImages.filter((u): u is string => u !== null)
  const visionNames = validImageUrls.length > 0 ? await nameVariantsByVision(p.name, validImageUrls) : []

  let nameIdx = 0
  const variants = filledImages.map(imgUrl => ({
    name: imgUrl ? (visionNames[nameIdx++] ?? '') : '',
    image_url: imgUrl,
  }))

  return {
    ...p,
    jp_price_yen: p.jp_price_yen ?? bandai?.jp_price_yen ?? null,
    image_url: mainImage,
    distributor: bandai ? '萬代股份有限公司（BANDAI）' : null,
    variants,
    variant_count: variantCount,
  }
}

// ── DB insertion ──────────────────────────────────────────────────────────────

function genSeed() { return crypto.randomBytes(32).toString('hex') }
function sha256(s: string) { return crypto.createHash('sha256').update(s).digest('hex') }

async function insertProduct(p: EnrichedProduct, supplierId?: number | null): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const seed = genSeed()
  const txid_hash = sha256(seed)

  const vCount = p.variants.length || 1
  const total  = p.total_count || 0
  const base   = Math.floor(total / vCount)
  const rem    = total % vCount
  const prizes = p.variants.map((v, vi) => ({
    level: v.name,
    name: v.name,
    total: base + (vi === 0 ? rem : 0),
    remaining: base + (vi === 0 ? rem : 0),
    probability: 100 / vCount,
    image_url: v.image_url || null,
  }))

  const { data: created, error } = await supabase.from('products').insert({
    product_code: p.sku || `TEMP-${Date.now()}`,
    name: p.name,
    category: '轉蛋',
    type: 'gacha',
    price: p.jp_price_yen ? Math.round(p.jp_price_yen / 2) : 50,
    total_count: total,
    remaining: total,
    status: 'active',
    is_hot: false,
    image_url: p.image_url,
    barcode: p.barcode,
    distributor: p.distributor,
    supplier_id: supplierId ?? null,
    seed,
    txid_hash,
  }).select('id').single()

  if (error || !created) return false

  const productId = (created as any).id as number
  // Auto-generate product_code from id (same as products/route.ts)
  await supabase.from('products').update({ product_code: String(10000000 + productId) }).eq('id', productId)

  if (prizes.length > 0) {
    await supabase.from('product_prizes').insert(prizes.map(prize => ({ ...prize, product_id: productId })))
  }
  return true
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function processLineXlsxImport({
  fileMessageId,
  targetId,
  supplierId,
}: {
  fileMessageId: string
  targetId: string       // LINE group/user ID to push result to
  supplierId?: number | null
}): Promise<void> {
  // 1. Download file
  const buffer = await downloadLineMessageContent(fileMessageId)
  if (!buffer || !isXlsxBuffer(buffer)) {
    await pushLineMessage(targetId, '⚠️ 無法讀取檔案，請確認是 .xlsx 格式。')
    return
  }

  // 2. Parse
  const products = parseXlsxBuffer(buffer)
  if (products.length === 0) {
    await pushLineMessage(targetId, '⚠️ 無法識別廠商格式。目前支援：模威格式（欄位：品名/國際條碼/箱數/備貨數量）')
    return
  }

  await pushLineMessage(targetId, `📦 開始智能補全 ${products.length} 個商品，請稍候…`)

  // 3. Enrich sequentially
  const succeeded: EnrichedProduct[] = []
  const skipped: string[] = []

  for (const p of products) {
    const enriched = await enrichProduct(p)
    if (!enriched) {
      skipped.push(p.name)
    } else {
      succeeded.push(enriched)
    }
  }

  // 4. Insert to DB
  let dbOk = 0, dbFail = 0
  for (const p of succeeded) {
    const ok = await insertProduct(p, supplierId ?? null)
    if (ok) dbOk++
    else dbFail++
  }

  // 5. Build LINE summary
  const totalCount = succeeded.reduce((s, p) => s + (p.total_count || 0), 0)
  const totalJpy   = succeeded.reduce((s, p) => s + (p.jp_price_yen ? p.jp_price_yen * (p.total_count || 0) : 0), 0)

  const lines: string[] = ['✅ 智能上架完成！', '']
  lines.push(`已上架：${dbOk} 件`)
  if (dbFail > 0) lines.push(`寫入失敗：${dbFail} 件`)
  if (skipped.length > 0) lines.push(`缺圖跳過：${skipped.length} 件（查無圖片）`)
  lines.push('──────────────')
  lines.push(`總計：${totalCount.toLocaleString()} 顆`)
  if (totalJpy > 0) lines.push(`預估總額：¥${totalJpy.toLocaleString()}`)

  if (skipped.length > 0) {
    lines.push('')
    lines.push('跳過清單：')
    skipped.slice(0, 8).forEach(name => lines.push(`・${name}`))
    if (skipped.length > 8) lines.push(`  …等 ${skipped.length} 件`)
  }

  await pushLineMessage(targetId, lines.join('\n'))
}
