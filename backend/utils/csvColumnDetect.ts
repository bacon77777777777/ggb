// CSV 智能欄位偵測工具

export type ProductFieldKey =
  | 'name' | 'price' | 'cost' | 'type' | 'image_url' | 'status'
  | 'display_menu' | 'started_at' | 'distributor' | 'barcode' | 'series' | 'rarity'
  | 'release_date' | 'is_hot' | 'is_preorder' | 'preorder_available_at'

export interface ProductFieldDef {
  key: ProductFieldKey
  label: string
  required?: boolean
  keywords: RegExp[]
}

export const PRODUCT_FIELDS: ProductFieldDef[] = [
  {
    key: 'name',
    label: '商品名稱',
    required: true,
    keywords: [/名稱/i, /品名/i, /商品名/i, /\bname\b/i, /品項名/i, /一番賞名/i, /產品名/i, /標題/i, /title/i],
  },
  {
    key: 'price',
    label: '價格',
    required: true,
    keywords: [/價格/i, /售價/i, /\bprice\b/i, /金額/i, /單價/i, /每抽/i, /單抽/i, /定價/i, /抽獎費/i],
  },
  {
    key: 'cost',
    label: '成本',
    keywords: [/成本/i, /進貨價/i, /\bcost\b/i, /進價/i, /批價/i, /採購價/i],
  },
  {
    key: 'type',
    label: '商品類型',
    keywords: [/類型/i, /種類/i, /\btype\b/i, /\bkind\b/i, /品種/i, /商品類/i],
  },
  {
    key: 'image_url',
    label: '商品圖片',
    keywords: [/圖片/i, /\bimage\b/i, /\bimg\b/i, /照片/i, /封面/i, /主圖/i, /\bcover\b/i, /\bphoto\b/i],
  },
  {
    key: 'status',
    label: '狀態',
    keywords: [/狀態/i, /\bstatus\b/i, /販售狀態/i, /^上架$/i, /^上下架$/i],
  },
  {
    key: 'display_menu',
    label: '顯示菜單',
    keywords: [/菜單/i, /\bmenu\b/i, /館別/i, /顯示區/i, /展示/i, /頻道/i, /^分類$/i],
  },
  {
    key: 'started_at',
    label: '開賣時間',
    keywords: [/開賣/i, /開始日/i, /started/i, /上架時間/i, /販賣開始/i, /開售/i, /sale.*date/i],
  },
  {
    key: 'distributor',
    label: '代理商',
    keywords: [/代理/i, /廠商/i, /distributor/i, /供應商/i, /^品牌$/i, /發行/i, /版權/i, /publisher/i],
  },
  {
    key: 'barcode',
    label: '產品條碼',
    keywords: [/條碼/i, /barcode/i, /ean/i, /jan/i, /upc/i, /product.*code.*bar/i, /商品條碼/i, /產品條碼/i],
  },
  {
    key: 'series',
    label: '系列',
    keywords: [/系列/i, /\bseries\b/i, /\bip\b/i, /版權系列/i, /作品/i, /題材/i],
  },
  {
    key: 'rarity',
    label: '稀有度',
    keywords: [/稀有度/i, /rarity/i, /難易度/i, /星級/i],
  },
  {
    key: 'release_date',
    label: '上市時間',
    keywords: [/上市/i, /release/i, /發行日/i, /出版日/i, /上市年月/i],
  },
  {
    key: 'is_hot',
    label: '熱賣',
    keywords: [/熱賣/i, /熱門/i, /\bhot\b/i, /人氣/i, /熱銷/i, /精選/i],
  },
  {
    key: 'is_preorder',
    label: '預購商品',
    keywords: [/預購/i, /預售/i, /preorder/i, /預訂/i],
  },
  {
    key: 'preorder_available_at',
    label: '預計出貨時間',
    keywords: [/預計出貨/i, /預計到貨/i, /出貨時間/i, /預定出貨/i, /到貨日/i],
  },
]

// ── 獎項欄位偵測 ───────────────────────────────────────────────────────────────

export interface PrizeGroup {
  id: string
  suggestedLevel: string   // e.g. "A賞", "SP賞", "SR", "款式1"
  nameCol: string | null
  quantityCol: string | null
  imageCol: string | null
  levelCol: string | null  // column that holds the per-row grade value (e.g. "獎項1等級")
  levelOverride: string    // user-editable level string
}

type PrizeFieldType = 'name' | 'quantity' | 'image' | 'level' | 'unknown'

interface ParsedPrizeCol {
  col: string
  levelKey: string         // normalized key for grouping
  displayLevel: string     // display label
  fieldType: PrizeFieldType
}

// Patterns that indicate a level prefix in a column name
// Returns { levelKey, displayLevel } or null
function extractLevelPrefix(col: string): { levelKey: string; displayLevel: string } | null {
  const c = col.trim()

  // ── 一番賞 / 自製賞 grades: A賞, B賞, SP賞, SS賞, Last One, 最後賞 ──
  const gradeMatch = c.match(/^((?:SP|SS|[A-Z]+)賞|最後賞)/)
  if (gradeMatch) return { levelKey: gradeMatch[1], displayLevel: gradeMatch[1] }

  const lastOneMatch = c.match(/^(last\s*one)/i)
  if (lastOneMatch) return { levelKey: 'Last One', displayLevel: 'Last One' }

  // ── 抽卡 rarities: SSR, SR, UR, HR, R, N ──
  const cardMatch = c.match(/^(SSR|SR|UR|HR|[RN])(?:[\s_\-]|名稱|名|數量|數|圖|$)/i)
  if (cardMatch) return { levelKey: cardMatch[1].toUpperCase(), displayLevel: cardMatch[1].toUpperCase() }

  // ── 盒玩 / 自製: 款式1, 款式2 ──
  const styleMatch = c.match(/^(款式)(\d+)/)
  if (styleMatch) return { levelKey: `款式${styleMatch[2]}`, displayLevel: `款式${styleMatch[2]}` }

  // ── 通用: 獎項1, 獎項2, prize1, item1 ──
  const numberedMatch = c.match(/^(獎項|賞品|prize|item)(\d+)/i)
  if (numberedMatch) return { levelKey: `${numberedMatch[1]}${numberedMatch[2]}`, displayLevel: `${numberedMatch[1]}${numberedMatch[2]}` }

  return null
}

const NAME_SUFFIXES   = /名稱$|名$|_name$|\bname$/i
const QTY_SUFFIXES    = /數量$|量$|數$|_qty$|_count$|\bqty$|\bcount$|張$|個$|顆$/i
const IMAGE_SUFFIXES  = /圖片$|圖$|_img$|_image$|\bimg$|\bimage$|照片$|封面$/i
const LEVEL_SUFFIXES  = /等級$|賞別$|_level$|\blevel$|\bgrade$/i

function classifyField(col: string, levelKey: string): PrizeFieldType {
  const suffix = col.slice(levelKey.length).replace(/^[\s_\-]/, '')

  if (!suffix || NAME_SUFFIXES.test(suffix)) return 'name'
  if (QTY_SUFFIXES.test(suffix)) return 'quantity'
  if (IMAGE_SUFFIXES.test(suffix)) return 'image'
  if (LEVEL_SUFFIXES.test(suffix)) return 'level'

  // If the whole column IS just the level (e.g. column named "A賞")
  if (col.trim() === levelKey) return 'name'

  return 'unknown'
}

export function detectPrizeGroups(headers: string[]): PrizeGroup[] {
  const parsed: ParsedPrizeCol[] = []

  for (const col of headers) {
    const prefix = extractLevelPrefix(col)
    if (!prefix) continue
    const fieldType = classifyField(col, prefix.levelKey)
    parsed.push({ col, levelKey: prefix.levelKey, displayLevel: prefix.displayLevel, fieldType })
  }

  // Group by levelKey
  const groups = new Map<string, Partial<PrizeGroup>>()
  for (const p of parsed) {
    if (!groups.has(p.levelKey)) {
      groups.set(p.levelKey, {
        id: p.levelKey,
        suggestedLevel: p.displayLevel,
        levelOverride: p.displayLevel,
        nameCol: null,
        quantityCol: null,
        imageCol: null,
        levelCol: null,
      })
    }
    const g = groups.get(p.levelKey)!
    if (p.fieldType === 'name'     && !g.nameCol)     g.nameCol     = p.col
    if (p.fieldType === 'quantity' && !g.quantityCol) g.quantityCol = p.col
    if (p.fieldType === 'image'    && !g.imageCol)    g.imageCol    = p.col
    if (p.fieldType === 'level'    && !g.levelCol)    g.levelCol    = p.col
  }

  // Sort: A賞 → B賞 → ... → SP賞 → Last One → numbered
  const sortKey = (level: string) => {
    if (/^[A-Z]賞$/.test(level)) return level.charCodeAt(0)
    if (level === 'SP賞') return 300
    if (level === 'SS賞') return 301
    if (/last\s*one/i.test(level) || level === '最後賞') return 999
    if (/^\d+$/.test(level)) return 500 + parseInt(level)
    return 400
  }

  return [...groups.values()]
    .filter(g => g.nameCol || g.quantityCol)  // only include groups with at least one identified column
    .sort((a, b) => sortKey(a.suggestedLevel!) - sortKey(b.suggestedLevel!)) as PrizeGroup[]
}

// ── Product field auto-detect ──────────────────────────────────────────────────

export function detectFieldMapping(headers: string[]): Record<ProductFieldKey, string | null> {
  const result = {} as Record<ProductFieldKey, string | null>
  const usedCols = new Set<string>()

  for (const field of PRODUCT_FIELDS) {
    const match = headers.find(h => {
      if (usedCols.has(h)) return false
      return field.keywords.some(kw => kw.test(h.trim()))
    })
    result[field.key] = match ?? null
    if (match) usedCols.add(match)
  }

  return result
}
