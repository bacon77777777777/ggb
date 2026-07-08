import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

export interface ParsedProduct {
  sku: string
  barcode: string | null
  name: string
  name_jp?: string | null
  series?: string | null
  manufacturer_code: string
  per_case: number
  cases: number
  total_count: number
  variant_count: number
  qty_per_variant: number
  jp_price_yen: number | null      // 日幣定價（DB 欄位）
  price_twd?: number | null        // 台幣/G幣售價
  cost?: number | null             // 進貨成本
  special_price?: number | null    // 特價
  release_year?: string | null
  release_month?: string | null
  full_spec: string
  type: string
  image_url?: string | null        // 只放 http/https URL
  raw_image_name?: string | null   // 原始檔名（非 URL，待對應 Storage 或 zip 上傳）
  distributor?: string | null
  prizes?: {
    name: string
    grade?: string
    qty?: number
    image_url?: string | null
    raw_image_name?: string | null
  }[]
  missingFields?: string[]  // 'image' | 'prizes' | 'price'
}

const TYPE_MAP: Record<string, string> = {
  '一番賞': 'ichiban', '盒玩': 'blindbox', '盲盒': 'blindbox',
  '轉蛋': 'gacha', '抽卡': 'card', '卡牌': 'card', '自製賞': 'custom',
  '一番くじ': 'ichiban', 'ガチャ': 'gacha', 'カプセルトイ': 'gacha',
  'ブラインドボックス': 'blindbox', 'トレーディングカード': 'card',
}

function isHttpUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//i.test(s)
}

// ── 模威 fast path ────────────────────────────────────────────────────────────

function parseMoWeiFormat(rows: any[][], typeColIdx: number | null): ParsedProduct[] {
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
    const pcsPerBag    = formatMatch ? parseInt(formatMatch[1]) : 0
    const bagsPerCase  = formatMatch ? parseInt(formatMatch[2]) : 0
    const jpPriceCode  = formatMatch ? parseInt(formatMatch[3]) : 0
    const totalCount   = totalRaw || (perCase * cases) || (pcsPerBag * bagsPerCase * cases)
    const typeRaw      = typeColIdx !== null ? String(row[typeColIdx] ?? '').trim() : ''

    result.push({
      sku,
      barcode: barcode || null,
      name: nameRaw || fullName,
      manufacturer_code: mfxCode,
      per_case: perCase,
      cases,
      total_count: totalCount > 0 ? totalCount : (pcsPerBag * bagsPerCase),
      variant_count: 0,
      qty_per_variant: 0,
      jp_price_yen: jpPriceCode > 0 ? jpPriceCode * 10 : null,
      full_spec: fullName,
      type: TYPE_MAP[typeRaw] ?? 'gacha',
      missingFields: ['image', 'prizes'],
    })
  }
  return result
}

// ── Claude Haiku column detection ─────────────────────────────────────────────

interface FieldMap {
  name: string | null
  name_jp: string | null
  type: string | null
  jan_code: string | null
  series: string | null
  release_year: string | null
  release_month: string | null
  jp_price_yen: string | null
  price_twd: string | null
  cost: string | null
  special_price: string | null
  total_count: string | null
  image_url: string | null
  distributor: string | null
  prize_columns: string[]
  prize_qty_columns: string[]
  prize_image_columns: string[]
}

async function detectColumns(headers: string[], sampleRows: any[][]): Promise<FieldMap> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const headerStr  = headers.slice(0, 40).join('、')
  const rowSamples = sampleRows.slice(0, 3).map((row, i) =>
    `第${i + 1}筆: ` + headers.slice(0, 40).map((h, j) => `${h}=${String(row[j] ?? '').trim()}`).join('、')
  ).join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `你是商品資料匯入助手。分析廠商 Excel 欄位，找出對應的商品屬性。

可識別屬性：
- name: 商品名稱（中文主標題）
- name_jp: 日文商品名
- type: 商品類型（一番賞/盒玩/轉蛋/抽卡/自製賞）
- jan_code: JAN/EAN/條碼
- series: 系列名
- release_year: 發售年（4位數字）
- release_month: 發售月（1-12）
- jp_price_yen: 日幣建議售價（整數）
- price_twd: 台幣/G幣售價
- cost: 進貨成本（台幣）
- special_price: 特價/活動價
- total_count: 總數量/備貨量
- image_url: 商品主圖 URL 或圖片檔名（如 abc.jpg）
- distributor: 代理商/品牌/製造商
- prize_columns: 品項/款式/獎項名稱欄位（陣列，多款各一欄）
- prize_qty_columns: 品項數量欄位（與 prize_columns 一一對應）
- prize_image_columns: 品項圖片欄位（URL 或檔名，與 prize_columns 一一對應）

欄位標題：${headerStr}

前幾筆範例：
${rowSamples}

只回傳 JSON（不要任何其他文字）：
{"name":null,"name_jp":null,"type":null,"jan_code":null,"series":null,"release_year":null,"release_month":null,"jp_price_yen":null,"price_twd":null,"cost":null,"special_price":null,"total_count":null,"image_url":null,"distributor":null,"prize_columns":[],"prize_qty_columns":[],"prize_image_columns":[]}`
    }],
  })

  const text = ((msg.content[0] as any).text ?? '{}').trim()
  try {
    const p = JSON.parse(text)
    return {
      name: p.name ?? null,
      name_jp: p.name_jp ?? null,
      type: p.type ?? null,
      jan_code: p.jan_code ?? null,
      series: p.series ?? null,
      release_year: p.release_year ?? null,
      release_month: p.release_month ?? null,
      jp_price_yen: p.jp_price_yen ?? null,
      price_twd: p.price_twd ?? null,
      cost: p.cost ?? null,
      special_price: p.special_price ?? null,
      total_count: p.total_count ?? null,
      image_url: p.image_url ?? null,
      distributor: p.distributor ?? null,
      prize_columns: Array.isArray(p.prize_columns) ? p.prize_columns : [],
      prize_qty_columns: Array.isArray(p.prize_qty_columns) ? p.prize_qty_columns : [],
      prize_image_columns: Array.isArray(p.prize_image_columns) ? p.prize_image_columns : [],
    }
  } catch {
    return { name: null, name_jp: null, type: null, jan_code: null, series: null, release_year: null, release_month: null, jp_price_yen: null, price_twd: null, cost: null, special_price: null, total_count: null, image_url: null, distributor: null, prize_columns: [], prize_qty_columns: [], prize_image_columns: [] }
  }
}

// ── Parse rows using detected field map ───────────────────────────────────────

function parseWithFieldMap(rows: any[][], headers: string[], fieldMap: FieldMap): ParsedProduct[] {
  const col = (f: string | null) => (f ? headers.indexOf(f) : -1)

  const nameIdx      = col(fieldMap.name)
  const nameJpIdx    = col(fieldMap.name_jp)
  const typeIdx      = col(fieldMap.type)
  const janIdx       = col(fieldMap.jan_code)
  const seriesIdx    = col(fieldMap.series)
  const relYearIdx   = col(fieldMap.release_year)
  const relMonthIdx  = col(fieldMap.release_month)
  const jpPriceIdx   = col(fieldMap.jp_price_yen)
  const priceTwdIdx  = col(fieldMap.price_twd)
  const costIdx      = col(fieldMap.cost)
  const spPriceIdx   = col(fieldMap.special_price)
  const totalIdx     = col(fieldMap.total_count)
  const imgIdx       = col(fieldMap.image_url)
  const distIdx      = col(fieldMap.distributor)
  const prizeIdxs    = fieldMap.prize_columns.map(c => headers.indexOf(c)).filter(i => i >= 0)
  const prizeQtyIdxs = fieldMap.prize_qty_columns.map(c => headers.indexOf(c)).filter(i => i >= 0)
  const prizeImgIdxs = fieldMap.prize_image_columns.map(c => headers.indexOf(c)).filter(i => i >= 0)

  const str  = (row: any[], idx: number) => idx >= 0 ? String(row[idx] ?? '').trim() : ''
  const num  = (row: any[], idx: number) => idx >= 0 ? Number(row[idx]) || null : null

  return rows
    .filter(row => nameIdx >= 0 && str(row, nameIdx))
    .map((row, i) => {
      const name       = str(row, nameIdx)
      const typeRaw    = str(row, typeIdx)
      const type       = TYPE_MAP[typeRaw] ?? 'gacha'
      const barcode    = janIdx >= 0 ? str(row, janIdx).replace(/\.0$/, '') || null : null
      const jpPrice    = num(row, jpPriceIdx)
      const priceTwd   = num(row, priceTwdIdx)
      const cost       = num(row, costIdx)
      const spPrice    = num(row, spPriceIdx)
      const relYear    = str(row, relYearIdx) || null
      const relMonth   = str(row, relMonthIdx) || null
      const nameJp     = str(row, nameJpIdx) || null
      const series     = str(row, seriesIdx) || null
      // 過濾掉欄位名本身被當成資料值的情況（如「代理商」「製造商」）
      const DIST_PLACEHOLDERS = new Set(['代理商', '製造商', '品牌', 'distributor', '代理商名稱', '廠牌'])
      const distRaw = distIdx >= 0 ? str(row, distIdx) : ''
      const distributor = distRaw && !DIST_PLACEHOLDERS.has(distRaw) ? distRaw : null

      // Image: distinguish URL vs filename
      const imgRaw = imgIdx >= 0 ? str(row, imgIdx) || null : null
      const image_url      = isHttpUrl(imgRaw) ? imgRaw : null
      const raw_image_name = !isHttpUrl(imgRaw) && imgRaw ? imgRaw : null

      // Prizes
      const prizes = prizeIdxs.map((pidx, vi) => {
        const prizeName = str(row, pidx)
        if (!prizeName) return null
        const qty = prizeQtyIdxs[vi] !== undefined ? Number(row[prizeQtyIdxs[vi]]) || 0 : 0
        const imgRawP  = prizeImgIdxs[vi] !== undefined ? str(row, prizeImgIdxs[vi]) || null : null
        return {
          name: prizeName,
          qty: qty || undefined,
          image_url:      isHttpUrl(imgRawP) ? imgRawP : null,
          raw_image_name: !isHttpUrl(imgRawP) && imgRawP ? imgRawP : null,
        }
      }).filter(Boolean) as ParsedProduct['prizes']

      const totalFromPrizes = prizes!.reduce((s, p) => s + (p!.qty ?? 0), 0)
      const totalCount = (totalIdx >= 0 ? Number(row[totalIdx]) || 0 : 0) || totalFromPrizes

      const missingFields: string[] = []
      if (!image_url && !raw_image_name) missingFields.push('image')
      if (!prizes!.length) missingFields.push('prizes')
      if (!jpPrice && !priceTwd) missingFields.push('price')

      return {
        sku: `ROW${i + 1}`,
        barcode,
        name,
        name_jp: nameJp,
        series,
        manufacturer_code: '',
        per_case: 0,
        cases: 0,
        total_count: totalCount,
        variant_count: prizes!.length,
        qty_per_variant: 0,
        jp_price_yen: jpPrice,
        price_twd: priceTwd,
        cost,
        special_price: spPrice,
        release_year: relYear,
        release_month: relMonth,
        full_spec: name,
        type,
        image_url,
        raw_image_name,
        distributor,
        prizes: prizes!.length ? prizes : undefined,
        missingFields,
      } satisfies ParsedProduct
    })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })

  const allSheets: { name: string; products: ParsedProduct[]; detectedFormat?: string }[] = []

  for (const sheetName of wb.SheetNames) {
    const ws   = wb.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (rows.length < 2) continue

    const header   = rows[0].map((h: any) => String(h).trim())
    const dataRows = rows.slice(1)

    // 模威 fast path
    if (header[0] === '品名' && header[1] === '國際條碼') {
      const typeColIdx = header.indexOf('類型') !== -1 ? header.indexOf('類型') : null
      const products = parseMoWeiFormat(dataRows, typeColIdx)
      if (products.length > 0) {
        allSheets.push({ name: sheetName, products, detectedFormat: '模威' })
      }
      continue
    }

    // Smart path
    try {
      const fieldMap = await detectColumns(header, dataRows.slice(0, 3))
      if (!fieldMap.name) continue
      const products = parseWithFieldMap(dataRows, header, fieldMap)
      if (products.length > 0) {
        allSheets.push({ name: sheetName, products, detectedFormat: 'smart' })
      }
    } catch (e: any) {
      console.error('[parse-xlsx] Claude detection failed:', e?.message)
    }
  }

  if (allSheets.length === 0) {
    return NextResponse.json({
      error: '無法解析任何工作表。請確認 Excel 有標題列，且包含商品名稱欄位。',
    }, { status: 422 })
  }

  return NextResponse.json({ ok: true, sheets: allSheets })
}
