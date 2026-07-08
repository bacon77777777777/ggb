import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

export interface ParsedProduct {
  sku: string
  barcode: string | null
  name: string
  manufacturer_code: string
  per_case: number
  cases: number
  total_count: number
  variant_count: number
  qty_per_variant: number
  jp_price_yen: number | null
  full_spec: string
  type: string  // ichiban | gacha | blindbox | card | custom
  // Smart detection fields (optional, present when detected from file)
  image_url?: string | null
  distributor?: string | null
  prizes?: { name: string; grade?: string; qty?: number; image_url?: string | null }[]
  price_twd?: number | null
  missingFields?: string[]  // 'image' | 'prizes' | 'price'
}

const TYPE_MAP: Record<string, string> = {
  '一番賞': 'ichiban',
  '盒玩':   'blindbox',
  '盲盒':   'blindbox',
  '轉蛋':   'gacha',
  '抽卡':   'card',
  '卡牌':   'card',
  '自製賞': 'custom',
  // Japanese
  '一番くじ':       'ichiban',
  'ガチャ':         'gacha',
  'カプセルトイ':   'gacha',
  'ブラインドボックス': 'blindbox',
  'トレーディングカード': 'card',
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

    const totalCount = totalRaw || (perCase * cases) || (pcsPerBag * bagsPerCase * cases)

    const typeRaw = typeColIdx !== null ? String(row[typeColIdx] ?? '').trim() : ''
    const type = TYPE_MAP[typeRaw] ?? 'gacha'

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
      type,
      missingFields: ['image', 'prizes'],
    })
  }

  return result
}

// ── Claude Haiku column detection ─────────────────────────────────────────────

interface FieldMap {
  name: string | null
  type: string | null
  jan_code: string | null
  jp_price_yen: string | null
  price_twd: string | null
  total_count: string | null
  image_url: string | null
  distributor: string | null
  prize_columns: string[]   // 品項名稱欄位（可能多欄）
  prize_qty_columns: string[]  // 對應的數量欄位
}

async function detectColumns(headers: string[], sampleRows: any[][]): Promise<FieldMap> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const headerStr = headers.slice(0, 30).join('、')
  const rowSamples = sampleRows.slice(0, 3).map((row, i) =>
    `第${i + 1}筆: ` + headers.slice(0, 30).map((h, j) => `${h}=${String(row[j] ?? '').trim()}`).join('、')
  ).join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `你是商品資料匯入助手。分析廠商提供的 Excel 欄位，找出各欄位對應的商品屬性。

可識別的商品屬性：
- name: 商品名稱（主標題）
- type: 商品類型（一番賞/盒玩/轉蛋/抽卡/自製賞 或日文對應）
- jan_code: JAN/EAN/商品條碼
- jp_price_yen: 日幣建議售價（數字欄位）
- price_twd: 台幣/G幣定價（數字欄位）
- total_count: 總數量/備貨量
- image_url: 商品圖片URL或圖片檔名
- distributor: 代理商/品牌/廠商名稱
- prize_columns: 品項/款式/獎項名稱欄位（陣列，多個品項各一欄）
- prize_qty_columns: 品項數量欄位（陣列，與 prize_columns 一一對應）

欄位標題：${headerStr}

前幾筆範例：
${rowSamples}

只回傳 JSON（不要任何其他文字）：
{"name":null,"type":null,"jan_code":null,"jp_price_yen":null,"price_twd":null,"total_count":null,"image_url":null,"distributor":null,"prize_columns":[],"prize_qty_columns":[]}`
    }],
  })

  const text = ((msg.content[0] as any).text ?? '{}').trim()
  try {
    const parsed = JSON.parse(text)
    return {
      name: parsed.name ?? null,
      type: parsed.type ?? null,
      jan_code: parsed.jan_code ?? null,
      jp_price_yen: parsed.jp_price_yen ?? null,
      price_twd: parsed.price_twd ?? null,
      total_count: parsed.total_count ?? null,
      image_url: parsed.image_url ?? null,
      distributor: parsed.distributor ?? null,
      prize_columns: Array.isArray(parsed.prize_columns) ? parsed.prize_columns : [],
      prize_qty_columns: Array.isArray(parsed.prize_qty_columns) ? parsed.prize_qty_columns : [],
    }
  } catch {
    return { name: null, type: null, jan_code: null, jp_price_yen: null, price_twd: null, total_count: null, image_url: null, distributor: null, prize_columns: [], prize_qty_columns: [] }
  }
}

// ── Parse rows using detected field map ───────────────────────────────────────

function parseWithFieldMap(rows: any[][], headers: string[], fieldMap: FieldMap): ParsedProduct[] {
  const col = (field: string | null): number => (field ? headers.indexOf(field) : -1)

  const nameIdx       = col(fieldMap.name)
  const typeIdx       = col(fieldMap.type)
  const janIdx        = col(fieldMap.jan_code)
  const jpPriceIdx    = col(fieldMap.jp_price_yen)
  const priceTwdIdx   = col(fieldMap.price_twd)
  const totalIdx      = col(fieldMap.total_count)
  const imgIdx        = col(fieldMap.image_url)
  const distIdx       = col(fieldMap.distributor)
  const prizeIdxs     = fieldMap.prize_columns.map(c => headers.indexOf(c)).filter(i => i >= 0)
  const prizeQtyIdxs  = fieldMap.prize_qty_columns.map(c => headers.indexOf(c)).filter(i => i >= 0)

  return rows
    .filter(row => nameIdx >= 0 && String(row[nameIdx] ?? '').trim())
    .map((row, i) => {
      const name        = String(row[nameIdx] ?? '').trim()
      const typeRaw     = typeIdx >= 0 ? String(row[typeIdx] ?? '').trim() : ''
      const type        = TYPE_MAP[typeRaw] ?? 'gacha'
      const barcode     = janIdx >= 0 ? String(row[janIdx] ?? '').replace(/\.0$/, '').trim() || null : null
      const jpPrice     = jpPriceIdx >= 0 ? Number(row[jpPriceIdx]) || null : null
      const priceTwd    = priceTwdIdx >= 0 ? Number(row[priceTwdIdx]) || null : null
      const imageUrl    = imgIdx >= 0 ? String(row[imgIdx] ?? '').trim() || null : null
      const distributor = distIdx >= 0 ? String(row[distIdx] ?? '').trim() || null : null

      const prizes = prizeIdxs.map((pidx, vi) => {
        const prizeName = String(row[pidx] ?? '').trim()
        const qty = prizeQtyIdxs[vi] !== undefined ? Number(row[prizeQtyIdxs[vi]]) || 0 : 0
        return { name: prizeName, qty: qty || undefined, image_url: null }
      }).filter(p => p.name)

      const totalFromPrizes = prizes.reduce((s, p) => s + (p.qty ?? 0), 0)
      const totalCount = (totalIdx >= 0 ? Number(row[totalIdx]) || 0 : 0) || totalFromPrizes

      const missingFields: string[] = []
      if (!imageUrl) missingFields.push('image')
      if (!prizes.length) missingFields.push('prizes')
      if (!jpPrice && !priceTwd) missingFields.push('price')

      return {
        sku: `ROW${i + 1}`,
        barcode,
        name,
        manufacturer_code: '',
        per_case: 0,
        cases: 0,
        total_count: totalCount,
        variant_count: prizes.length,
        qty_per_variant: 0,
        jp_price_yen: jpPrice,
        full_spec: name,
        type,
        image_url: imageUrl,
        distributor,
        prizes: prizes.length ? prizes : undefined,
        price_twd: priceTwd,
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
    const ws = wb.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    if (rows.length < 2) continue

    const header = rows[0].map((h: any) => String(h).trim())
    const dataRows = rows.slice(1)

    // ── Fast path: 模威 format ──────────────────────────────────────────────
    if (header[0] === '品名' && header[1] === '國際條碼') {
      const typeColIdx = header.indexOf('類型') !== -1 ? header.indexOf('類型') : null
      const products = parseMoWeiFormat(dataRows, typeColIdx)
      if (products.length > 0) {
        allSheets.push({ name: sheetName, products, detectedFormat: '模威' })
      }
      continue
    }

    // ── Smart path: Claude Haiku column detection ───────────────────────────
    try {
      const fieldMap = await detectColumns(header, dataRows.slice(0, 3))

      // If Claude couldn't even find the name column, skip this sheet
      if (!fieldMap.name) continue

      const products = parseWithFieldMap(dataRows, header, fieldMap)
      if (products.length > 0) {
        allSheets.push({ name: sheetName, products, detectedFormat: 'smart' })
      }
    } catch (e: any) {
      console.error('[parse-xlsx] Claude detection failed:', e?.message)
      // Fall through — sheet will be skipped
    }
  }

  if (allSheets.length === 0) {
    return NextResponse.json({
      error: '無法解析任何工作表。請確認 Excel 有標題列，且包含商品名稱欄位。',
    }, { status: 422 })
  }

  return NextResponse.json({ ok: true, sheets: allSheets })
}
