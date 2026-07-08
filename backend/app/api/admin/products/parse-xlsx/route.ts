import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
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
}

// Map Chinese type labels from xlsx to DB enum values
const TYPE_MAP: Record<string, string> = {
  '一番賞': 'ichiban',
  '盒玩':   'blindbox',
  '盲盒':   'blindbox',
  '轉蛋':   'gacha',
  '抽卡':   'card',
  '卡牌':   'card',
  '自製賞': 'custom',
}

// Parse 模威 format: cols 0=SKU, 1=barcode, 2=箱數, 3=備貨數量, 4=total, 5=full_name
// Note: header row has an empty cell at col2, so header[2]="" but data[2]=箱數 value
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

    // Parse: BAN/鬼滅之刃等待中公仔 @30x5 050
    // @30x5 = 一袋30個 × 有5袋（包裝規格，非品項種類數）
    // 品項種類數（variant_count）從網路抓，這裡設為 0
    const mfxMatch    = fullName.match(/^([A-Z]+)\//)
    const mfxCode     = mfxMatch?.[1] ?? ''
    const nameRaw     = fullName.replace(/^[A-Z]+\//, '').replace(/\s*@[\d\s x]+\d+\s*$/, '').trim()
    const formatMatch = fullName.match(/@(\d+)x(\d+)\s+(\d+)/)
    const pcsPerBag    = formatMatch ? parseInt(formatMatch[1]) : 0  // @30 = 每袋30個
    const bagsPerCase  = formatMatch ? parseInt(formatMatch[2]) : 0  // x5 = 5袋
    const jpPriceCode  = formatMatch ? parseInt(formatMatch[3]) : 0  // 050 → ¥500

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
      variant_count: 0,        // 品項數未知，由 AI 補全從網路抓
      qty_per_variant: 0,
      jp_price_yen: jpPriceCode > 0 ? jpPriceCode * 10 : null,  // 050 → 500¥
      full_spec: fullName,
      type,
    })
  }

  return result
}

export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })

  const allSheets: { name: string; products: ParsedProduct[] }[] = []
  const debugInfo: any[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    if (rows.length < 2) continue

    const header = rows[0].map((h: any) => String(h).trim())
    debugInfo.push({ sheet: sheetName, header: header.slice(0, 8) })

    // Detect 模威 format: col0=品名, col1=國際條碼
    // (col2 header is intentionally empty due to Excel formatting, but data[2]=箱數 value)
    const isMoWei = header[0] === '品名' && header[1] === '國際條碼'

    if (isMoWei) {
      const typeColIdx = header.indexOf('類型') !== -1 ? header.indexOf('類型') : null
      const products = parseMoWeiFormat(rows.slice(1), typeColIdx)
      if (products.length > 0) allSheets.push({ name: sheetName, products })
    }
  }

  if (allSheets.length === 0) {
    return NextResponse.json({
      error: '無法識別廠商格式。目前支援：模威（欄位：品名/國際條碼/箱數/備貨數量）',
      debug: debugInfo,
    }, { status: 422 })
  }

  return NextResponse.json({ ok: true, sheets: allSheets })
}
