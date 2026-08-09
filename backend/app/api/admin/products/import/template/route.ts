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
interface TypeSample {
  type: ProductType
  label: string
  name: string
  series: string
  distributor: string
  barcode: string
  price: string
  total: string
  cost: string
  jpYen: string
  image: string
  levels: [string, string]
  qty: [string, string]
  prizeNames: [string, string]
  prizeImages: [string, string]
}

/**
 * 各類型的範例列。混合範本會把這幾列全部放進去，
 * 讓人一眼看出「同一個檔案可以混，每一列由『商品類型』決定」。
 *
 * 每一欄都填滿，不留空格 —— 範例留白的話，看的人分不出
 * 「這欄不用填」還是「這欄我們忘了給例子」，只好一欄一欄來問。
 */
const TYPE_SAMPLES: TypeSample[] = [
  {
    type: 'ichiban', label: '一番賞',
    name: '航海王 一番賞 頂上決戰', series: '航海王', distributor: 'BANDAI SPIRITS',
    barcode: '4570117575129', price: '150', total: '80', cost: '9600', jpYen: '880',
    image: 'onepiece-kuji-01.jpg',
    levels: ['A賞', 'B賞'], qty: ['1', '10'],
    prizeNames: ['魯夫 造型公仔', '索隆 壓克力立牌'],
    prizeImages: ['onepiece-a.jpg', 'onepiece-b.jpg'],
  },
  {
    type: 'blindbox', label: '盒玩',
    name: '吉伊卡哇 睡覺系列盒玩', series: '吉伊卡哇', distributor: 'Re-MeNT',
    barcode: '4521121207834', price: '200', total: '66', cost: '7200', jpYen: '660',
    image: 'chiikawa-box-01.jpg',
    levels: ['一般版', '隱藏款'], qty: ['60', '6'],
    prizeNames: ['吉伊卡哇 睡姿款', '烏薩奇 隱藏款'],
    prizeImages: ['chiikawa-normal.jpg', 'chiikawa-secret.jpg'],
  },
  {
    type: 'gacha', label: '轉蛋',
    name: '星之卡比 毛線角色公仔', series: '星之卡比', distributor: 'BANDAI',
    barcode: '4549660488798', price: '150', total: '52', cost: '5200', jpYen: '400',
    image: 'kirby-gacha-01.jpg',
    levels: ['一般版', '隱藏版'], qty: ['50', '2'],
    prizeNames: ['卡比 粉紅款', '瓦豆魯迪 隱藏款'],
    prizeImages: ['kirby-normal.jpg', 'kirby-secret.jpg'],
  },
  {
    type: 'card', label: '抽卡',
    name: '寶可夢卡牌 樂園之守護者 補充包', series: '寶可夢', distributor: 'The Pokémon Company',
    barcode: '4521329352916', price: '100', total: '100', cost: '6000', jpYen: '180',
    image: 'pokemon-pack-01.jpg',
    levels: ['SSR', 'R'], qty: ['1', '30'],
    prizeNames: ['皮卡丘 SAR', '妙蛙種子 R'],
    prizeImages: ['pokemon-sar.jpg', 'pokemon-r.jpg'],
  },
  {
    type: 'custom', label: '自製賞',
    name: '吉吉比自製賞 夏日祭典', series: '吉吉比', distributor: '吉吉比',
    barcode: '', price: '250', total: '60', cost: '9000', jpYen: '',
    image: 'ggb-custom-01.jpg',
    levels: ['A賞', 'G賞'], qty: ['1', '20'],
    prizeNames: ['大型玩偶', '壓克力吊飾'],
    prizeImages: ['ggb-a.jpg', 'ggb-g.jpg'],
  },
  {
    type: 'slot', label: '機台',
    name: '吉吉比拉霸機 幸運七', series: '吉吉比', distributor: '吉吉比',
    barcode: '', price: '0', total: '', cost: '', jpYen: '',
    image: 'slot-lucky7.jpg',
    levels: ['一等獎', '三等獎'], qty: ['1', '50'],
    prizeNames: ['頭獎 限量公仔', '安慰獎 貼紙'],
    prizeImages: ['slot-1st.jpg', 'slot-3rd.jpg'],
  },
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
  // 那一欄的說明白紙黑字寫著大獎怎麼排籤（「大獎不會排進前 (1-殺率) 比例的籤」），
  // 範本一寄出去等於把機制教給廠商。不分身份都不放 ——
  // 平台自己要調的話有專門的頁面（系統設定 → 殺率調整）
  const productFields = (isMixed ? PRODUCT_IMPORT_FIELDS : fieldsForType(type))
    .filter(f => !f.key.startsWith('_'))
    .filter(f => f.key !== 'profit_rate')
  const prizeFields = isMixed ? PRIZE_IMPORT_FIELDS : fieldsForType(type, PRIZE_IMPORT_FIELDS)

  const headers: string[] = []
  const samples: string[] = []
  const notes: string[] = []

  // 範例列每一欄都填滿，不留空格 —— 留白的話看的人分不出
  // 「這欄不用填」還是「這欄我們忘了給例子」，只好一欄一欄來問
  const sample = TYPE_SAMPLES.find(s => s.type === type) ?? TYPE_SAMPLES[0]

  const productCell = (key: string): string => {
    switch (key) {
      case 'name':         return `範例）${sample.name}`
      case 'type':         return sample.label
      case 'price':        return sample.price
      case 'total_count':  return sample.total
      case 'cost':         return sample.cost
      case 'jp_price_yen': return sample.jpYen
      case 'image_url':    return sample.image
      case 'series':       return sample.series
      case 'distributor':  return sample.distributor
      case 'barcode':      return sample.barcode
      case 'category':     return '動漫'
      case 'release_year': return '2026'
      case 'release_month':return '08'
      case 'rarity':       return '3'
      case 'status':       return '待上架'
      case 'is_hot':       return '否'
      case 'started_at':   return '2026-08-15 12:00'
      case 'is_preorder':  return '否'
      case 'preorder_available_at': return ''
      case 'machine_theme':        return sample.type === 'gacha' ? 'gacha_mode2' : ''
      case 'lottery_total_draws':  return ''
      case 'lottery_per_user_draws': return ''
      case 'description':  return `${sample.series} 正版授權，${sample.label}商品`
      case 'box_image_url':return sample.type === 'blindbox' ? 'box-' + sample.image : ''
      default:             return ''
    }
  }

  const prizeCell = (key: string, i: number): string => {
    const idx = i - 1
    switch (key) {
      case 'level':         return sample.levels[idx] ?? ''
      case 'name':          return sample.prizeNames[idx] ?? ''
      case 'total':         return sample.qty[idx] ?? ''
      case 'image_url':     return sample.prizeImages[idx] ?? ''
      case 'recycle_value': return sample.type === 'slot' ? (idx === 0 ? '100' : '10') : '0'
      case 'sale_price':    return '0'
      default:              return ''
    }
  }

  for (const f of productFields) {
    headers.push(f.label)
    samples.push(productCell(f.key))
    notes.push(f.note ?? '')
  }

  for (let i = 1; i <= PRIZE_SLOTS; i++) {
    for (const f of prizeFields) {
      headers.push(`獎項${i}${f.label === '品項名稱' ? '名稱' : f.label}`)
      // 只有前兩組給範例。後面 18 組留白是刻意的 ——
      // 全部填滿會讓人以為每個商品都要湊滿 20 個品項
      samples.push(i > 2 ? '' : prizeCell(f.key, i))
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
          case 'name':         return `範例）${sp.name}`
          case 'type':         return sp.label
          case 'price':        return sp.price
          case 'total_count':  return sp.total
          case 'cost':         return sp.cost
          case 'jp_price_yen': return sp.jpYen
          case 'image_url':    return sp.image
          case 'series':       return sp.series
          case 'distributor':  return sp.distributor
          case 'barcode':      return sp.barcode
          case 'category':     return '動漫'
          case 'release_year': return '2026'
          case 'release_month':return '08'
          case 'rarity':       return '3'
          case 'status':       return '待上架'
          case 'is_hot':       return '否'
          case 'started_at':   return '2026-08-15 12:00'
          case 'is_preorder':  return '否'
          case 'machine_theme':return sp.type === 'gacha' ? 'gacha_mode2' : ''
          case 'description':  return `${sp.series} 正版授權，${sp.label}商品`
          case 'box_image_url':return sp.type === 'blindbox' ? 'box-' + sp.image : ''
          default:             return ''
        }
      })
      for (let i = 1; i <= PRIZE_SLOTS; i++) {
        for (const f of prizeFields) {
          if (i > 2) { row.push(''); continue }
          const idx = i - 1
          row.push(
            f.key === 'level' ? sp.levels[idx]
            : f.key === 'name' ? sp.prizeNames[idx]
            : f.key === 'total' ? sp.qty[idx]
            : f.key === 'image_url' ? sp.prizeImages[idx]
            : f.key === 'recycle_value' ? (sp.type === 'slot' ? (idx === 0 ? '100' : '10') : '0')
            : f.key === 'sale_price' ? '0'
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
