import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import {
  PRODUCT_IMPORT_FIELDS, PRIZE_IMPORT_FIELDS, PRODUCT_TYPES,
  fieldsForType, LEVEL_PRESETS, type ProductType,
} from '@/lib/productSchema'

export const runtime = 'nodejs'

/**
 * 標準匯入範本下載
 *
 * 智能匯入吃得下廠商原本的格式，所以這支不是必要流程 —— 它是給
 * 「願意照我們格式填」的廠商用的，填好之後解析必定 100% 命中，不需要猜也不花錢。
 *
 * 欄位名稱刻意跟業界（含競品匯出）常見的寫法一致：
 * 品項用「獎項N名稱／獎項N等級／獎項N數量／獎項N圖片名稱」橫向展開，
 * 廠商從別的平台匯出的檔案往往可以直接沿用。
 *
 * 第 2 列是範例值，解析時會自動略過（見 import/parse 的 isSampleRow）。
 */

const PRIZE_SLOTS = 20

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export async function GET(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const type = (url.searchParams.get('type') ?? 'ichiban') as ProductType
  const typeDef = PRODUCT_TYPES.find(t => t.value === type) ?? PRODUCT_TYPES[0]

  // 虛擬欄位（_ 開頭）不進範本 —— 它們是為了吃廠商的怪格式而存在的，
  // 我們自己的範本用拆好的年 / 月就行
  const productFields = fieldsForType(type).filter(f => !f.key.startsWith('_'))
  const prizeFields = fieldsForType(type, PRIZE_IMPORT_FIELDS)

  const headers: string[] = []
  const samples: string[] = []
  const notes: string[] = []

  for (const f of productFields) {
    headers.push(f.label)
    samples.push(f.key === 'name' ? `範例）${f.example ?? ''}` : (f.example ?? ''))
    notes.push(f.note ?? '')
  }

  const levels = LEVEL_PRESETS[type]
  for (let i = 1; i <= PRIZE_SLOTS; i++) {
    for (const f of prizeFields) {
      headers.push(`獎項${i}${f.label === '品項名稱' ? '名稱' : f.label}`)
      // 只有前兩組給範例，後面留空，不然範本看起來像已經填滿了
      samples.push(i > 2 ? '' : (f.key === 'level' ? (levels[i - 1] ?? levels[0]) : (f.example ?? '')))
      notes.push(i > 1 ? '' : (f.note ?? ''))
    }
  }

  const lines = [
    headers.map(csvEscape).join(','),
    samples.map(csvEscape).join(','),
    // 說明列以 # 開頭，解析時會被當成註解略過
    [`# 說明（此列請勿刪除欄位，可整列刪除）`, ...notes.slice(1)].map(csvEscape).join(','),
  ]

  // Excel 開 UTF-8 CSV 沒有 BOM 會變亂碼，這是台灣廠商最常回報的問題
  const csv = '\uFEFF' + lines.join('\r\n') + '\r\n'
  const filename = `GGB商品匯入範本_${typeDef.label}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
