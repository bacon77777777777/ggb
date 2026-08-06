import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import {
  PRODUCT_IMPORT_FIELDS, PRIZE_IMPORT_FIELDS,
  detectFieldMapping, detectPrizeGroups, detectVerticalPrizeColumns,
  coerce, normalizeType, normalizeLevel,
  missingRequired, headerFingerprint, TICKETED_TYPES, PROBABILITY_TYPES,
  type ProductType, type PrizeGroup,
} from '@/lib/productSchema'
import { normalizeProductNames, stripVendorNoise } from '@/lib/productNaming'

/**
 * 廠商 list 的解析
 *
 * 只做「純字串處理」的部分：讀檔、對欄位、組商品與品項、能算的算出來。
 * 不碰資料庫、不打外部網路 —— 所以一秒內就跑得完，上傳當下就能給結果。
 *
 * 需要往外查的（圖片、款式、台灣譯名）由背景的補齊工作接手，
 * 那些一筆要 10~30 秒，不能綁在上傳這個動作上。
 *
 * 這段原本長在 api/products/import/parse 裡，抽出來是因為舊的 modal 要拆掉，
 * 但解析邏輯得留著給新的工作制用。
 */

export interface ParsedRow {
  /** 試算表上的列號（人看得懂的，從 2 起算） */
  rowNo: number
  product: Record<string, unknown>
  prizes: Record<string, unknown>[]
  missing: string[]
  filled: { key: string; label: string; value: unknown; source: string }[]
  warnings: string[]
  needsTranslation: string[]
}

export interface ParseResult {
  headers: string[]
  mapping: Record<string, string | null>
  fingerprint: string
  prizeLayout: 'vertical' | 'horizontal' | 'none'
  rows: ParsedRow[]
}

/**
 * 讀檔。
 *
 * 沒有標題、或標題重複的欄位要給一個能定址的名字。原本直接拿標題當 key，
 * 於是一整排空標題全部擠成同一個 key ''，互相覆蓋之後只剩最後一個（通常是空的）。
 * 實際廠商檔案裡，單價就是一欄沒有標題的數字 —— 那一欄因此永遠讀不到。
 *
 * 只有真的裝了東西的空標題欄才保留，不然一份 Excel 後面拖著二十個空欄位，
 * 會全部變成「第7欄」「第8欄」…把畫面塞滿。
 */
function readWorkbook(buf: Buffer, filename: string): { headers: string[]; rows: Record<string, string>[] } {
  const nameCols = (rawHeaders: string[], dataRows: string[][]) => {
    const headers: string[] = []
    const seen = new Map<string, number>()
    for (let c = 0; c < rawHeaders.length; c++) {
      const h = rawHeaders[c]
      if (!h) {
        const hasData = dataRows.some(r => String(r[c] ?? '').trim() !== '')
        headers.push(hasData ? `第${c + 1}欄` : `__empty_${c}`)
        continue
      }
      const n = (seen.get(h) ?? 0) + 1
      seen.set(h, n)
      headers.push(n === 1 ? h : `${h}(${n})`)
    }
    return headers
  }

  if (/\.csv$/i.test(filename)) {
    // BOM 要拿掉，不然第一個欄位名會變成 U+FEFF + 商品名稱，對不上任何別名。
    // 這裡刻意用逸出字元寫：直接貼 BOM 字元會被 ESLint 的
    // no-irregular-whitespace 擋下（那條規則害部署失敗過兩次）
    const text = buf.toString('utf8').replace(/^﻿/, '')
    const p = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true })
    const aoa = (p.data ?? []).filter(r => Array.isArray(r))
    if (aoa.length < 2) return { headers: [], rows: [] }
    const rawHeaders = (aoa[0] ?? []).map(h => String(h ?? '').trim())
    const dataRows = aoa.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== ''))
    const headers = nameCols(rawHeaders, dataRows)
    const rows = dataRows.map(r => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '')])))
    return { headers: headers.filter(h => !h.startsWith('__empty_')), rows }
  }

  const wb = XLSX.read(buf, { type: 'buffer' })
  // 只取第一個有資料的工作表。多表通常是「說明」「範例」之類的附頁
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: '' })
    if (aoa.length < 2) continue
    const rawHeaders = (aoa[0] ?? []).map(h => String(h ?? '').trim())
    const dataRows = aoa.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== ''))
    const headers = nameCols(rawHeaders, dataRows)
    const rows = dataRows.map(r => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '')])))
    return { headers: headers.filter(h => !h.startsWith('__empty_')), rows }
  }
  return { headers: [], rows: [] }
}

export function parseVendorFile(
  buf: Buffer,
  filename: string,
  opts: { forcedType?: ProductType | null; mappingOverride?: Record<string, string | null> | null } = {},
): ParseResult {
  const { headers, rows } = readWorkbook(buf, filename)
  if (!headers.length || !rows.length) {
    return { headers, mapping: {}, fingerprint: '', prizeLayout: 'none', rows: [] }
  }

  const horizontalGroups = detectPrizeGroups(headers)
  // 橫向找不到才試直式（一列一個品項）。兩種在廠商檔案裡都常見
  const verticalCols = horizontalGroups.length ? null : detectVerticalPrizeColumns(headers)

  // 被品項認領的標題不能再被商品欄位搶走。直式表的「圖片」是品項圖，
  // 不擋的話會被商品主圖的 /^圖片$/ 認領走
  const claimedByPrize = new Set<string>([
    ...horizontalGroups.flatMap(g =>
      [g.nameCol, g.quantityCol, g.imageCol, g.levelCol].filter(Boolean) as string[]),
    ...(verticalCols ? Object.values(verticalCols) : []),
  ])

  // 前 20 列給欄位比對看內容。標題不可靠時（「品名」裝的是貨號、
  // 單價那欄沒有標題），實際裝的東西才是最可靠的線索
  const sample = rows.slice(0, 20)
  const mapping = detectFieldMapping(headers, PRODUCT_IMPORT_FIELDS, claimedByPrize, sample)
  if (opts.mappingOverride) {
    for (const [k, v] of Object.entries(opts.mappingOverride)) {
      if (k in mapping) mapping[k] = v || null
    }
  }

  // 我們自己的範本第 2 列是範例、第 3 列是說明。廠商填的時候常常忘了刪，
  // 不擋掉的話每次匯入都會多兩筆垃圾商品
  const isSampleRow = (r: Record<string, string>) => {
    const first = String(Object.values(r)[0] ?? '').trim()
    return first.startsWith('#') || first.startsWith('範例）')
  }

  /*
   * 直式表要先分組：連續幾列屬於同一個商品。商品名稱那一欄有值就是新商品，
   * 留白代表延續上一個（廠商很常只在第一列寫商品名）。
   */
  const nameCol = mapping.name
  type Group = { rowNo: number; head: Record<string, string>; members: Record<string, string>[] }
  const groups: Group[] = []
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    if (isSampleRow(raw)) continue
    const hasName = nameCol ? String(raw[nameCol] ?? '').trim() !== '' : true
    if (verticalCols && !hasName && groups.length) {
      groups[groups.length - 1].members.push(raw)
    } else {
      groups.push({ rowNo: i + 2, head: raw, members: [raw] })
    }
  }
  // 商品名每一列都重複寫的情況：同名的併成一個商品
  if (verticalCols && nameCol) {
    const merged: Group[] = []
    for (const g of groups) {
      const key = String(g.head[nameCol] ?? '').trim()
      const prev = merged[merged.length - 1]
      if (prev && key !== '' && String(prev.head[nameCol] ?? '').trim() === key) {
        prev.members.push(...g.members)
      } else {
        merged.push(g)
      }
    }
    groups.length = 0
    groups.push(...merged)
  }

  const qtyDef = PRIZE_IMPORT_FIELDS.find(f => f.key === 'total')!
  const probDef = PRIZE_IMPORT_FIELDS.find(f => f.key === 'probability')!
  const recycleDef = PRIZE_IMPORT_FIELDS.find(f => f.key === 'recycle_value')!

  const parsed: ParsedRow[] = []

  for (const group of groups) {
    const raw = group.head
    const filled: ParsedRow['filled'] = []
    const warnings: string[] = []

    const type: ProductType =
      opts.forcedType ??
      (mapping.type ? normalizeType(raw[mapping.type]) : null) ??
      'ichiban'

    const product: Record<string, unknown> = { type }

    for (const def of PRODUCT_IMPORT_FIELDS) {
      if (def.key === 'type') continue
      const col = mapping[def.key]
      const v = col ? coerce(def, raw[col], type) : null
      if (v !== null && v !== undefined && v !== '') product[def.key] = v
    }

    // 圖片欄位在這一層先原樣留著（可能是網址、站內路徑或純檔名）。
    // 對回 R2 是補齊層的事 —— 那要列 bucket，屬於「往外查」
    const missingImages: string[] = []

    // 虛擬欄位：上市時間單欄 → 拆成年 / 月
    const rd = product._release_date
    if (rd) {
      const m = String(rd).match(/(\d{4})\D{0,3}(\d{1,2})?/)
      if (m) {
        if (!product.release_year) product.release_year = m[1]
        if (!product.release_month && m[2]) product.release_month = m[2].padStart(2, '0')
      }
    }
    delete product._release_date

    // ── 品項 ──
    const prizes: Record<string, unknown>[] = []

    if (verticalCols) {
      for (const m of group.members) {
        const pname = String(m[verticalCols.name] ?? '').trim()
        if (!pname) continue
        const total = Number(coerce(qtyDef, m[verticalCols.total], type) ?? 0)
        prizes.push({
          level: normalizeLevel(verticalCols.level ? m[verticalCols.level] : '', type) || '未分類',
          name: pname,
          total,
          remaining: total,
          image_url: verticalCols.image_url ? String(m[verticalCols.image_url] ?? '').trim() || null : null,
          probability: verticalCols.probability
            ? Number(coerce(probDef, m[verticalCols.probability], type) ?? 0) : 0,
          recycle_value: verticalCols.recycle_value
            ? Number(coerce(recycleDef, m[verticalCols.recycle_value], type) ?? 0) : 0,
          sale_price: 0,
        })
      }
    }

    for (const g of horizontalGroups) {
      const name = g.nameCol ? String(raw[g.nameCol] ?? '').trim() : ''
      if (!name) continue
      const total = Number(coerce(qtyDef, g.quantityCol ? raw[g.quantityCol] : null, type) ?? 0)
      prizes.push({
        level: normalizeLevel(g.levelCol ? raw[g.levelCol] : g.levelOverride, type) || g.levelOverride || '未分類',
        name,
        total,
        remaining: total,
        image_url: g.imageCol ? String(raw[g.imageCol] ?? '').trim() || null : null,
        probability: 0,
        recycle_value: 0,
        sale_price: 0,
      })
    }

    // ── 能算的先算（純規則，零成本）──

    // 總籤數 = Σ品項數量
    if (!product.total_count && prizes.length) {
      const sum = prizes.reduce((a, p) => a + (Number(p.total) || 0), 0)
      if (sum > 0) {
        product.total_count = sum
        filled.push({ key: 'total_count', label: '總籤數', value: sum, source: '品項數量加總' })
      }
    }
    if (product.total_count) product.remaining = product.total_count

    // 籤號制要有這個值。刻意不列進 filled，也不出現在任何畫面上 ——
    // 這個機制的名字本身就不該讓廠商看到
    if (TICKETED_TYPES.includes(type) && product.profit_rate === undefined) {
      product.profit_rate = 1.0
    }

    // 機率制：沒給機率就按數量比例分配，總和必為 1
    if (PROBABILITY_TYPES.includes(type) && prizes.length) {
      const hasProb = prizes.some(p => Number(p.probability) > 0)
      if (!hasProb) {
        const sum = prizes.reduce((a, p) => a + (Number(p.total) || 0), 0)
        if (sum > 0) {
          for (const p of prizes) p.probability = Number(((Number(p.total) || 0) / sum).toFixed(6))
          filled.push({ key: 'probability', label: '中獎機率', value: '依數量比例', source: '品項數量分配' })
        }
      }
    }

    // 進貨單的雜訊：「BAN/xxx @30x5 040」對倉管有意義，對玩家沒有，
    // 而且帶著它去搜圖或查款式一定搜不到
    if (typeof product.name === 'string') {
      const cleaned = stripVendorNoise(product.name)
      if (cleaned.name && cleaned.name !== product.name) {
        filled.push({ key: 'name', label: '商品名稱', value: cleaned.name, source: '去除貨號與裝箱資訊' })
        product.name = cleaned.name
      }
      if (cleaned.distributor && !product.distributor) {
        product.distributor = cleaned.distributor
        filled.push({ key: 'distributor', label: '代理商', value: cleaned.distributor, source: '商品名的廠牌代碼' })
      }
    }

    // 預設值
    for (const def of PRODUCT_IMPORT_FIELDS) {
      if (def.fallback === undefined) continue
      const v = product[def.key]
      if (v === undefined || v === null || v === '') product[def.key] = def.fallback
    }

    if (typeof product.status === 'string') {
      product.status = /上架|active|販售中|on/i.test(product.status) ? 'active' : 'pending'
    }

    // 簡繁轉換 + 台灣用語。純字串處理，零成本，所以每一筆都跑
    const naming = normalizeProductNames(product, prizes)
    if (naming.changed > 0) {
      filled.push({ key: 'name', label: '名稱台灣化', value: `${naming.changed} 處`, source: '簡繁轉換 + 台灣用語' })
    }

    const zeroQty = prizes.filter(p => !p.total || Number(p.total) < 1)
    if (zeroQty.length) warnings.push(`${zeroQty.length} 個品項數量為 0，上架時會被略過`)
    if (missingImages.length) warnings.push(`${missingImages.length} 張圖的檔名在圖庫裡找不到`)

    parsed.push({
      rowNo: group.rowNo,
      product,
      prizes: prizes.filter(p => Number(p.total) >= 1),
      missing: missingRequired(product, type),
      filled,
      warnings,
      needsTranslation: naming.needsTranslation,
    })
  }

  return {
    headers,
    mapping,
    fingerprint: headerFingerprint(headers),
    prizeLayout: verticalCols ? 'vertical' : horizontalGroups.length ? 'horizontal' : 'none',
    rows: parsed,
  }
}
