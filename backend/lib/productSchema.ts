/**
 * 商品匯入的欄位契約 —— 單一來源
 *
 * 在這支之前，同一件事有三套定義各自為政：
 *   utils/csvColumnDetect.ts   PRODUCT_FIELDS      16 個欄位
 *   api/products/parse-xlsx    ParsedProduct       20 幾個欄位
 *   products 資料表            46 個欄位
 * 於是 CSV 匯入進來的商品缺 supplier_id（必填）、缺殺率、缺抽籤販售設定，
 * 而 XLSX 匯入又多出一堆資料表沒有的欄位。加一個新欄位要改三個地方，
 * 通常只會改到一個。
 *
 * 這裡定義每個可匯入欄位的：資料表 key、中文名、別名（中/日/英，給自動偵測用）、
 * 型別、哪些商品類型必填、預設值、範本範例。
 * 範本下載、檔案解析、智能補齊、驗證、匯入全部讀這一份。
 */

// ── 商品類型 ──────────────────────────────────────────────────────────────────

export type ProductType = 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom' | 'slot'

export const PRODUCT_TYPES: { value: ProductType; label: string; aliases: string[] }[] = [
  { value: 'ichiban',  label: '一番賞', aliases: ['一番賞', '一番くじ', '一番赏', 'ichiban', 'kuji', '抽賞'] },
  { value: 'blindbox', label: '盒玩',   aliases: ['盒玩', '盲盒', '盒抽', 'ブラインドボックス', 'blindbox', 'blind box', 'mystery box'] },
  { value: 'gacha',    label: '轉蛋',   aliases: ['轉蛋', '扭蛋', '转蛋', 'ガチャ', 'カプセルトイ', 'gacha', 'gashapon', 'capsule'] },
  { value: 'card',     label: '抽卡',   aliases: ['抽卡', '卡牌', '卡包', 'カード', 'card', 'tcg', 'trading card'] },
  { value: 'custom',   label: '自製賞', aliases: ['自製賞', '自制赏', '自製', 'custom'] },
  { value: 'slot',     label: '機台',   aliases: ['機台', '老虎機', 'slot', 'machine'] },
]

/** 籤號制：開賣前排定籤號、逐籤封存（見 migration 428） */
export const TICKETED_TYPES: ProductType[] = ['ichiban', 'card', 'custom']
/** 機率制：每抽即時擲骰 */
export const PROBABILITY_TYPES: ProductType[] = ['gacha', 'blindbox']

export function normalizeType(raw: unknown): ProductType | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  for (const t of PRODUCT_TYPES) {
    if (t.value === s) return t.value
    if (t.aliases.some(a => s === a.toLowerCase() || s.includes(a.toLowerCase()))) return t.value
  }
  return null
}

// ── 賞等 ──────────────────────────────────────────────────────────────────────

/**
 * 各類型的賞等預設值，與 app/products/new/page.tsx 的下拉選單一致。
 * 轉蛋與盒玩沒有「賞等」的概念，這裡放的是款式分類。
 */
export const LEVEL_PRESETS: Record<ProductType, string[]> = {
  ichiban:  ['A賞', 'B賞', 'C賞', 'D賞', 'E賞', 'F賞', 'G賞', 'H賞', 'I賞', 'J賞', '最後賞'],
  custom:   ['A賞', 'B賞', 'C賞', 'D賞', 'E賞', 'F賞', 'G賞', 'H賞', 'I賞', 'J賞', '最後賞'],
  card:     ['SSR', 'SR', 'UR', 'HR', 'R', 'N'],
  gacha:    ['Normal / Common', 'Rare', 'Secret', 'Color Variant', 'Effect / Clear', 'Limited', 'Option Parts'],
  blindbox: ['普通款', '稀有款', '隱藏款', '異色款', '夜光款', '透明款', '店鋪限定', '首批限定'],
  slot:     ['一等獎', '二等獎', '三等獎'],
}

/**
 * 賞等正規化。廠商檔案裡同一個賞等有各種寫法：
 * 「A賞」「A 賞」「Ａ賞」「A賞(1個)」「ラストワン賞」「last one」都要收斂成站上的值。
 */
export function normalizeLevel(raw: unknown, type: ProductType): string {
  // 全形英數轉半形，這在日本廠商的檔案裡很常見
  const s = String(raw ?? '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[（(].*?[）)]/g, '')
    .trim()
  if (!s) return ''

  if (/ラストワン|last\s*one|最後賞|最后赏/i.test(s)) return '最後賞'

  const grade = s.match(/^([A-Z]{1,2})\s*[賞赏]/i)
  if (grade) {
    const g = `${grade[1].toUpperCase()}賞`
    // 抽卡沒有「賞」，A賞 對它沒意義，原樣退回讓人工決定
    return TICKETED_TYPES.includes(type) ? g : s
  }

  if (type === 'card') {
    const r = s.match(/^(SSR|SR|UR|HR|R|N)$/i)
    if (r) return r[1].toUpperCase()
  }

  // 已經是站上預設值就直接用（大小寫不敏感）
  const preset = LEVEL_PRESETS[type].find(p => p.toLowerCase() === s.toLowerCase())
  return preset ?? s
}

// ── 欄位定義 ──────────────────────────────────────────────────────────────────

export type FieldKind = 'text' | 'int' | 'number' | 'bool' | 'date' | 'datetime' | 'type' | 'level'

export interface ImportFieldDef {
  /** products / product_prizes 的資料表欄位名 */
  key: string
  label: string
  kind: FieldKind
  /** 標題列比對用。順序有意義：先命中的先贏 */
  aliases: RegExp[]
  /** 哪些商品類型必填。'all' = 全部 */
  requiredFor?: ProductType[] | 'all'
  /** 只有這些類型用得到，範本會據此裁剪欄位 */
  onlyFor?: ProductType[]
  /** 廠商沒給時填什麼。undefined = 留空交給補齊層 */
  fallback?: unknown
  /** 範本裡的範例值與說明 */
  example?: string
  note?: string
}

export const PRODUCT_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'name', label: '商品名稱', kind: 'text', requiredFor: 'all',
    aliases: [/^名稱$/i, /品名/i, /商品名/i, /產品名/i, /^name$/i, /title/i, /一番賞名/i, /商品タイトル/i],
    example: '海賊王 一番賞 頂上決戰', note: '必填',
  },
  {
    key: 'type', label: '商品類型', kind: 'type', requiredFor: 'all', fallback: 'ichiban',
    aliases: [/類型/i, /種類/i, /^type$/i, /^kind$/i, /品種/i, /商品類/i, /カテゴリ/i],
    example: '一番賞', note: '一番賞 / 盒玩 / 轉蛋 / 抽卡 / 自製賞 / 機台',
  },
  {
    key: 'price', label: '單抽價格', kind: 'int', requiredFor: ['ichiban', 'blindbox', 'gacha', 'card', 'custom'],
    aliases: [/^價格$/i, /售價/i, /^price$/i, /金額/i, /單價/i, /每抽/i, /單抽/i, /定價/i, /抽獎費/i, /販売価格/i],
    example: '150', note: '代幣。機台與抽籤販售填 0',
  },
  {
    key: 'total_count', label: '總籤數', kind: 'int', requiredFor: TICKETED_TYPES,
    aliases: [/總籤/i, /總抽/i, /籤數/i, /抽數/i, /總數量/i, /^總數$/i, /total.*count/i, /^count$/i, /口数/i, /入数/i],
    example: '80', note: '一番賞/抽卡/自製賞必填，會據此排定籤號',
  },
  {
    key: 'profit_rate', label: '殺率', kind: 'number', onlyFor: TICKETED_TYPES, fallback: 1.0,
    aliases: [/殺率/i, /杀率/i, /profit.*rate/i, /獲利率/i, /利潤率/i],
    example: '0.7', note: '0~1。大獎不會排進前 (1-殺率) 比例的籤，留空預設 1.0',
  },
  {
    key: 'cost', label: '進貨成本', kind: 'number',
    aliases: [/成本/i, /進貨價/i, /^cost$/i, /進價/i, /批價/i, /採購價/i, /仕入/i],
    example: '3200', note: '整箱成本，選填',
  },
  {
    key: 'jp_price_yen', label: '日幣定價', kind: 'int',
    aliases: [/日幣/i, /日元/i, /jpy/i, /yen/i, /円/i, /希望小売価格/i],
    example: '880', note: '選填',
  },
  {
    key: 'image_url', label: '商品主圖', kind: 'text',
    aliases: [/商品圖片/i, /^圖片$/i, /^image/i, /^img/i, /照片/i, /封面/i, /主圖/i, /^cover$/i, /^photo$/i, /画像/i],
    example: 'https://...', note: '網址或圖檔名。留空會自動補',
  },
  {
    key: 'box_image_url', label: '外盒圖', kind: 'text', onlyFor: ['blindbox'],
    aliases: [/外盒/i, /盒圖/i, /box.*image/i, /箱画像/i],
    example: '', note: '盒玩專用，選填',
  },
  {
    key: 'series', label: '系列', kind: 'text',
    aliases: [/系列/i, /^series$/i, /^ip$/i, /版權/i, /作品/i, /題材/i, /シリーズ/i],
    example: '海賊王', note: '留空會從商品名自動判斷',
  },
  {
    key: 'category', label: '分類', kind: 'text', fallback: '未分類',
    aliases: [/^分類$/i, /^category$/i, /館別/i, /顯示區/i, /^menu$/i, /菜單/i],
    example: '動漫', note: '選填',
  },
  {
    key: 'distributor', label: '代理商', kind: 'text',
    aliases: [/代理/i, /distributor/i, /^品牌$/i, /發行/i, /版權方/i, /publisher/i, /メーカー/i, /販売元/i],
    example: 'BANDAI SPIRITS', note: '原廠或代理商，選填',
  },
  {
    key: 'barcode', label: '產品條碼', kind: 'text',
    aliases: [/條碼/i, /barcode/i, /^ean$/i, /^jan$/i, /^upc$/i, /商品條碼/i, /產品條碼/i],
    example: '4570117575129', note: '選填',
  },
  {
    key: 'release_year', label: '上市年', kind: 'text',
    aliases: [/上市年/i, /發售年/i, /release.*year/i, /発売年/i],
    example: '2026', note: '選填',
  },
  {
    key: 'release_month', label: '上市月', kind: 'text',
    aliases: [/上市月/i, /發售月/i, /release.*month/i, /発売月/i],
    example: '08', note: '選填',
  },
  {
    // 很多廠商（含競品匯出格式）把上市年月放同一欄。
    // 這是虛擬欄位：解析時會被拆成 release_year / release_month，不直接寫資料表。
    key: '_release_date', label: '上市時間', kind: 'text',
    aliases: [/上市時間/i, /上市日/i, /^上市$/i, /發行日/i, /出版日/i, /release.*date/i, /発売日/i],
    example: '2026-08', note: '單一欄位寫法，會自動拆成年與月',
  },
  {
    key: 'rarity', label: '稀有度', kind: 'int', fallback: 3,
    aliases: [/稀有度/i, /rarity/i, /星級/i, /レア度/i],
    example: '3', note: '1~5，預設 3',
  },
  {
    key: 'status', label: '上架狀態', kind: 'text', fallback: 'pending',
    aliases: [/^狀態$/i, /^status$/i, /販售狀態/i, /^上架$/i, /^上下架$/i],
    example: '上架', note: '上架 / 待上架，留空為待上架',
  },
  {
    key: 'is_hot', label: '熱賣標記', kind: 'bool', fallback: false,
    aliases: [/熱賣/i, /熱門/i, /^hot$/i, /人氣/i, /熱銷/i, /精選/i],
    example: '否', note: '是 / 否',
  },
  {
    key: 'started_at', label: '開賣時間', kind: 'datetime',
    aliases: [/開賣/i, /開始日/i, /started/i, /上架時間/i, /販賣開始/i, /開售/i, /sale.*date/i, /発売日/i],
    example: '2026-08-15 12:00', note: '留空 = 上架即開賣',
  },
  {
    key: 'is_preorder', label: '預購商品', kind: 'bool', fallback: false,
    aliases: [/預購/i, /預售/i, /preorder/i, /預訂/i, /予約/i],
    example: '否', note: '是 / 否',
  },
  {
    key: 'preorder_available_at', label: '預計出貨', kind: 'date',
    aliases: [/預計出貨/i, /預計到貨/i, /出貨時間/i, /預定出貨/i, /到貨日/i],
    example: '', note: '預購商品才需要',
  },
  {
    key: 'machine_theme', label: '機台主題', kind: 'text', onlyFor: ['gacha', 'slot'],
    aliases: [/機台主題/i, /機台樣式/i, /machine.*theme/i, /^主題$/i],
    example: 'gacha_mode2', note: '轉蛋/機台專用，選填',
  },
  {
    key: 'lottery_total_draws', label: '抽籤總次數', kind: 'int',
    aliases: [/抽籤總/i, /可抽次數/i, /lottery.*total/i],
    example: '', note: '抽籤販售專用',
  },
  {
    key: 'lottery_per_user_draws', label: '每人抽籤上限', kind: 'int',
    aliases: [/每人.*次數/i, /每人上限/i, /lottery.*per.*user/i],
    example: '', note: '抽籤販售專用',
  },
  {
    key: 'description', label: '商品描述', kind: 'text',
    aliases: [/描述/i, /說明/i, /介紹/i, /description/i, /備註/i, /^spec$/i, /規格/i],
    example: '', note: '選填',
  },
]

export const PRIZE_IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'level', label: '賞等', kind: 'level', requiredFor: 'all',
    aliases: [/賞等/i, /等級/i, /賞別/i, /^level$/i, /^grade$/i, /稀有/i, /款式/i],
    example: 'A賞', note: '必填',
  },
  {
    key: 'name', label: '品項名稱', kind: 'text', requiredFor: 'all',
    aliases: [/品項名/i, /獎品名/i, /^名稱$/i, /^name$/i, /賞品名/i],
    example: '魯夫 公仔', note: '必填',
  },
  {
    key: 'total', label: '數量', kind: 'int', requiredFor: 'all',
    aliases: [/數量/i, /^數$/i, /^qty$/i, /^count$/i, /^張$/i, /^個$/i, /個数/i],
    example: '1', note: '必填，至少 1',
  },
  {
    key: 'image_url', label: '品項圖', kind: 'text',
    aliases: [/圖片/i, /^圖$/i, /^img$/i, /^image$/i, /画像/i],
    example: '', note: '留空會自動補',
  },
  {
    key: 'probability', label: '中獎機率', kind: 'number', onlyFor: PROBABILITY_TYPES,
    aliases: [/機率/i, /概率/i, /probability/i, /^rate$/i, /確率/i],
    example: '0.05', note: '轉蛋/盒玩用。留空會依數量自動分配',
  },
  {
    key: 'recycle_value', label: '分解值', kind: 'int', requiredFor: ['slot'], onlyFor: ['slot'], fallback: 0,
    aliases: [/分解/i, /回收/i, /recycle/i, /折抵/i],
    example: '0', note: '機台必填且需大於 0',
  },
  {
    key: 'sale_price', label: '寄出售價', kind: 'int', fallback: 0,
    aliases: [/寄出.*價/i, /販售金額/i, /sale.*price/i, /出貨價/i],
    example: '0', note: '抽籤販售中籤後要付的金額',
  },
]

// ── 型別轉換 ──────────────────────────────────────────────────────────────────

const TRUE_WORDS = ['1', 'true', 'yes', 'y', '是', 'o', '○', 'v', '有', 'on']

/** 把廠商檔案裡的原始字串轉成資料表要的型別。轉不出來一律回 null，不猜。 */
export function coerce(def: ImportFieldDef, raw: unknown, type?: ProductType): unknown {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (s === '' || s === '-' || s === 'N/A' || s === 'n/a') return null

  switch (def.kind) {
    case 'int': {
      // 「1,200 元」「NT$150」「880円」都要吃得下來
      const n = Number(s.replace(/[^\d.-]/g, ''))
      return Number.isFinite(n) ? Math.round(n) : null
    }
    case 'number': {
      const n = Number(s.replace(/[^\d.-]/g, ''))
      if (!Number.isFinite(n)) return null
      // 殺率與機率常見寫成百分比（70 / 70%），一律收斂成 0~1
      if ((def.key === 'profit_rate' || def.key === 'probability') && (n > 1 || /%/.test(s))) return n / 100
      return n
    }
    case 'bool':
      return TRUE_WORDS.includes(s.toLowerCase())
    case 'date':
    case 'datetime': {
      const d = parseLooseDate(s)
      if (!d) return null
      return def.kind === 'date' ? d.slice(0, 10) : d
    }
    case 'type':
      return normalizeType(s)
    case 'level':
      return normalizeLevel(s, type ?? 'ichiban')
    default:
      return s
  }
}

/**
 * 寬鬆日期解析。廠商檔案什麼格式都有：
 * 2026/8/15、2026-08-15、2026年8月15日、20260815、Excel 序號 45900
 */
export function parseLooseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // Excel 把日期存成「1900-01-01 起算的天數」，匯出成 CSV 時常常漏轉
  if (/^\d{5}$/.test(s)) {
    const days = parseInt(s, 10)
    if (days > 20000 && days < 60000) {
      const ms = (days - 25569) * 86400 * 1000
      return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
    }
  }

  const cn = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/)
  if (cn) {
    const [, y, m, d] = cn
    return `${y}-${m.padStart(2, '0')}-${(d ?? '01').padStart(2, '0')} 00:00:00`
  }

  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} 00:00:00`
  }

  const t = Date.parse(s.replace(/\//g, '-'))
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 19).replace('T', ' ')

  return null
}

// ── 必填判定 ──────────────────────────────────────────────────────────────────

function isRequired(def: ImportFieldDef, type: ProductType): boolean {
  if (def.requiredFor === 'all') return true
  if (Array.isArray(def.requiredFor)) return def.requiredFor.includes(type)
  return false
}

export function fieldsForType(type: ProductType, fields = PRODUCT_IMPORT_FIELDS): ImportFieldDef[] {
  return fields.filter(f => !f.onlyFor || f.onlyFor.includes(type))
}

export function requiredFieldsFor(type: ProductType, fields = PRODUCT_IMPORT_FIELDS): ImportFieldDef[] {
  return fieldsForType(type, fields).filter(f => isRequired(f, type))
}

/**
 * 缺什麼。回傳的是欄位 key，補齊層會據此決定要不要動用 AI。
 * supplier_id 不在這裡 —— 它猜不出來，由匯入時整批指定。
 */
export function missingRequired(
  row: Record<string, unknown>,
  type: ProductType,
  fields = PRODUCT_IMPORT_FIELDS,
): string[] {
  return requiredFieldsFor(type, fields)
    .filter(f => {
      const v = row[f.key]
      return v === null || v === undefined || v === ''
    })
    .map(f => f.key)
}

// ── 標題列自動對應 ────────────────────────────────────────────────────────────

/**
 * 把廠商檔案的標題列對到我們的欄位。
 * 一個欄位只會被認領一次，先命中的先贏 —— 否則「售價」和「進貨價」會搶同一格。
 */
export function detectFieldMapping(
  headers: string[],
  fields = PRODUCT_IMPORT_FIELDS,
): Record<string, string | null> {
  const result: Record<string, string | null> = {}
  const used = new Set<string>()

  for (const field of fields) {
    const match = headers.find(h => {
      const t = h.trim()
      if (!t || used.has(h)) return false
      return field.aliases.some(a => a.test(t))
    })
    result[field.key] = match ?? null
    if (match) used.add(match)
  }
  return result
}

// ── 品項欄位偵測（橫向展開的廠商表格） ────────────────────────────────────────
//
// 很多廠商把品項攤成同一列的多組欄位：
//   A賞名稱 | A賞數量 | A賞圖片 | B賞名稱 | B賞數量 | ...
// 這段把它們認出來並分組。原本在 utils/csvColumnDetect.ts，一併收進來。

export interface PrizeGroup {
  id: string
  suggestedLevel: string
  nameCol: string | null
  quantityCol: string | null
  imageCol: string | null
  levelCol: string | null
  levelOverride: string
}

type PrizeFieldType = 'name' | 'quantity' | 'image' | 'level' | 'unknown'

function extractLevelPrefix(col: string): { levelKey: string; displayLevel: string } | null {
  const c = col.trim()

  const gradeMatch = c.match(/^((?:SP|SS|[A-Z]+)賞|最後賞)/)
  if (gradeMatch) return { levelKey: gradeMatch[1], displayLevel: gradeMatch[1] }

  if (/^(last\s*one|ラストワン)/i.test(c)) return { levelKey: '最後賞', displayLevel: '最後賞' }

  const cardMatch = c.match(/^(SSR|SR|UR|HR|[RN])(?:[\s_-]|名稱|名|數量|數|圖|$)/i)
  if (cardMatch) return { levelKey: cardMatch[1].toUpperCase(), displayLevel: cardMatch[1].toUpperCase() }

  const styleMatch = c.match(/^(款式)(\d+)/)
  if (styleMatch) return { levelKey: `款式${styleMatch[2]}`, displayLevel: `款式${styleMatch[2]}` }

  const numberedMatch = c.match(/^(獎項|賞品|品項|prize|item)(\d+)/i)
  if (numberedMatch) return { levelKey: `${numberedMatch[1]}${numberedMatch[2]}`, displayLevel: `${numberedMatch[1]}${numberedMatch[2]}` }

  return null
}

const NAME_SUFFIXES  = /名稱$|名$|_name$|\bname$/i
const QTY_SUFFIXES   = /數量$|量$|數$|_qty$|_count$|\bqty$|\bcount$|張$|個$|顆$/i
const IMAGE_SUFFIXES = /圖片名稱$|圖片檔名$|圖檔名$|圖片$|圖$|_img$|_image$|\bimg$|\bimage$|照片$|封面$|檔名$/i
const LEVEL_SUFFIXES = /等級$|賞別$|_level$|\blevel$|\bgrade$/i

function classifyField(col: string, levelKey: string): PrizeFieldType {
  const suffix = col.slice(levelKey.length).replace(/^[\s_-]/, '')
  // 圖片要先判。「獎項1圖片名稱」的後綴是「圖片名稱」，
  // NAME_SUFFIXES 的 /名稱$/ 也會命中 —— 先判名稱的話圖片欄位永遠被吃掉。
  // 這個順序錯誤在實測 44 筆真實商品時，讓 20 組品項的圖片欄位全部漏掉。
  if (IMAGE_SUFFIXES.test(suffix)) return 'image'
  if (!suffix || NAME_SUFFIXES.test(suffix)) return 'name'
  if (QTY_SUFFIXES.test(suffix)) return 'quantity'
  if (LEVEL_SUFFIXES.test(suffix)) return 'level'
  if (col.trim() === levelKey) return 'name'
  return 'unknown'
}

export function detectPrizeGroups(headers: string[]): PrizeGroup[] {
  const groups = new Map<string, Partial<PrizeGroup>>()

  for (const col of headers) {
    const prefix = extractLevelPrefix(col)
    if (!prefix) continue
    const fieldType = classifyField(col, prefix.levelKey)

    if (!groups.has(prefix.levelKey)) {
      groups.set(prefix.levelKey, {
        id: prefix.levelKey,
        suggestedLevel: prefix.displayLevel,
        levelOverride: prefix.displayLevel,
        nameCol: null, quantityCol: null, imageCol: null, levelCol: null,
      })
    }
    const g = groups.get(prefix.levelKey)!
    if (fieldType === 'name'     && !g.nameCol)     g.nameCol     = col
    if (fieldType === 'quantity' && !g.quantityCol) g.quantityCol = col
    if (fieldType === 'image'    && !g.imageCol)    g.imageCol    = col
    if (fieldType === 'level'    && !g.levelCol)    g.levelCol    = col
  }

  const sortKey = (level: string) => {
    if (/^[A-Z]賞$/.test(level)) return level.charCodeAt(0)
    if (level === 'SP賞') return 300
    if (level === 'SS賞') return 301
    if (level === '最後賞') return 999
    if (/^\d+$/.test(level)) return 500 + parseInt(level)
    return 400
  }

  return [...groups.values()]
    .filter(g => g.nameCol || g.quantityCol)
    .sort((a, b) => sortKey(a.suggestedLevel!) - sortKey(b.suggestedLevel!)) as PrizeGroup[]
}

// ── 標題列指紋 ────────────────────────────────────────────────────────────────

/**
 * 同一家廠商的檔案格式通常固定。把標題列算成指紋存起來，
 * 下次認得就直接套上次的對應，連 AI 都不用叫（也就不用花錢）。
 * 標題順序可能被調動，所以先排序再湊。
 */
export function headerFingerprint(headers: string[]): string {
  const norm = headers
    .map(h => h.trim().toLowerCase().replace(/\s+/g, ''))
    .filter(Boolean)
    .sort()
    .join('|')
  let h = 0
  for (let i = 0; i < norm.length; i++) {
    h = (Math.imul(31, h) + norm.charCodeAt(i)) | 0
  }
  return `fp_${(h >>> 0).toString(36)}_${norm.length}`
}
