import { NextResponse } from 'next/server'
import { requireAdminScope } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  PRODUCT_IMPORT_FIELDS, PRIZE_IMPORT_FIELDS, PRODUCT_TYPES,
  fieldsForType, LEVEL_PRESETS, type ProductType,
} from '@/lib/productSchema'

/** `?type=all` = 多類別混合。欄位取所有類型的聯集，不做裁剪 */
const MIXED = 'all'

/**
 * 各類型的範例列。混合範本會把這六列全部放進去，
 * 讓廠商一眼看出「同一個檔案可以混，每一列由『商品類型』決定」。
 *
 * 值都盡量貼近真實：機率制（轉蛋／盒玩）沒有總籤數與殺率所以留白，
 * 機台不收單抽價格（改用下注檔次）所以填 0。
 */
const TYPE_SAMPLES: { type: ProductType; label: string; price: string; total: string; profit: string; levels: [string, string]; qty: [string, string] }[] = [
  { type: 'ichiban',  label: '一番賞', price: '150', total: '80',  profit: '0.7', levels: ['A賞', 'B賞'],                     qty: ['1', '10'] },
  { type: 'blindbox', label: '盒玩',   price: '200', total: '',    profit: '',    levels: ['普通款', '隱藏款'],               qty: ['60', '6'] },
  { type: 'gacha',    label: '轉蛋',   price: '150', total: '',    profit: '',    levels: ['Normal / Common', 'Secret'],      qty: ['50', '2'] },
  { type: 'card',     label: '抽卡',   price: '100', total: '100', profit: '0.8', levels: ['SSR', 'R'],                       qty: ['1', '30'] },
  { type: 'custom',   label: '自製賞', price: '250', total: '60',  profit: '0.7', levels: ['A賞', 'G賞'],                     qty: ['1', '20'] },
  { type: 'slot',     label: '機台',   price: '0',   total: '',    profit: '',    levels: ['一等獎', '三等獎'],               qty: ['1', '50'] },
]

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
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 機台是平台自營的玩法，外部廠商不供貨也不該上架。
  // 超級管理員、以及被標為平台自營的廠商（suppliers.is_platform）才拿得到。
  let canUseSlot = scope.supplierScope === undefined
  if (!canUseSlot && scope.supplierScope != null) {
    const { data } = await getSupabaseAdmin()
      .from('suppliers').select('is_platform').eq('id', scope.supplierScope).maybeSingle()
    canUseSlot = data?.is_platform === true
  }

  const url = new URL(request.url)
  const raw = url.searchParams.get('type') ?? 'ichiban'
  if (raw === 'slot' && !canUseSlot) {
    return NextResponse.json({ error: '機台範本僅限平台使用' }, { status: 403 })
  }
  const isMixed = raw === MIXED
  // 混合範本的賞等範例用一番賞的（最常見），實際填什麼由每列的「商品類型」決定
  const type = (isMixed ? 'ichiban' : raw) as ProductType
  const typeDef = PRODUCT_TYPES.find(t => t.value === type) ?? PRODUCT_TYPES[0]

  // 虛擬欄位（_ 開頭）不進範本 —— 它們是為了吃廠商的怪格式而存在的，
  // 我們自己的範本用拆好的年 / 月就行
  //
  // 混合範本不依類型裁剪欄位：廠商的一份 list 裡可能同時有一番賞與機台，
  // 裁掉任何一邊都會讓他填不下去。解析本來就是逐列看「商品類型」判斷的，
  // 用不到的欄位留白即可。
  const productFields = (isMixed ? PRODUCT_IMPORT_FIELDS : fieldsForType(type))
    .filter(f => !f.key.startsWith('_'))
  const prizeFields = isMixed ? PRIZE_IMPORT_FIELDS : fieldsForType(type, PRIZE_IMPORT_FIELDS)

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

  // 混合範本把六個類型的範例都列出來（機台依身份決定給不給）
  const extraSamples: string[][] = []
  if (isMixed) {
    for (const sp of TYPE_SAMPLES) {
      if (sp.type === 'slot' && !canUseSlot) continue
      const row = productFields.map(f => {
        switch (f.key) {
          case 'name':        return `範例）${sp.label}商品`
          case 'type':        return sp.label
          case 'price':       return sp.price
          case 'total_count': return sp.total
          case 'profit_rate': return sp.profit
          default:            return ''
        }
      })
      for (let i = 1; i <= PRIZE_SLOTS; i++) {
        for (const f of prizeFields) {
          if (i > 2) { row.push(''); continue }
          const idx = i - 1
          row.push(
            f.key === 'level' ? sp.levels[idx]
            : f.key === 'name' ? `${sp.label}品項${i}`
            : f.key === 'total' ? sp.qty[idx]
            : f.key === 'recycle_value' && sp.type === 'slot' ? '10'
            : ''
          )
        }
      }
      extraSamples.push(row)
    }
  }

  const lines = [
    headers.map(csvEscape).join(','),
    // 混合範本的範例全部由 TYPE_SAMPLES 產生，不再另外放一列預設範例（會跟一番賞那列重複）
    ...(isMixed ? [] : [samples.map(csvEscape).join(',')]),
    ...extraSamples.map(r => r.map(csvEscape).join(',')),
    // 說明列以 # 開頭，解析時會被當成註解略過
    [
      isMixed
        ? '# 說明：一個檔案可以混不同類型，每一列由「商品類型」欄位決定。用不到的欄位留白即可。此列可整列刪除'
        : '# 說明（此列請勿刪除欄位，可整列刪除）',
      ...notes.slice(1),
    ].map(csvEscape).join(','),
  ]

  // Excel 開 UTF-8 CSV 沒有 BOM 會變亂碼，這是台灣廠商最常回報的問題
  const csv = '\uFEFF' + lines.join('\r\n') + '\r\n'
  const filename = isMixed
    ? 'GGB商品匯入範本_多類別混合.csv'
    : `GGB商品匯入範本_${typeDef.label}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
