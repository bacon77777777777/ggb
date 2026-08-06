import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import {
  PRODUCT_IMPORT_FIELDS, PRIZE_IMPORT_FIELDS,
  detectFieldMapping, detectPrizeGroups, detectVerticalPrizeColumns,
  coerce, normalizeType, normalizeLevel,
  missingRequired, headerFingerprint, TICKETED_TYPES, PROBABILITY_TYPES,
  type ProductType, type PrizeGroup,
} from '@/lib/productSchema'
import { normalizeProductNames, stripVendorNoise } from '@/lib/productNaming'
import { r2ListFilenames, r2PublicUrl } from '@/lib/r2'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 廠商商品 list 解析
 *
 * 整條流程只有這裡跟 import/commit 兩支 API。上傳什麼格式都吃：
 * .xlsx / .xls 走 SheetJS，.csv 走 Papa。
 *
 * 欄位對應的優先順序是刻意的，因為每往下一層就多一分不確定性（也可能多一分成本）：
 *
 *   1. 廠商格式記憶（supplier_import_profiles）—— 免費、100% 準，第二次上傳起就走這條
 *   2. 規則比對（productSchema 的 aliases）—— 免費，實測 44 筆真實商品命中 14/26 欄位
 *   3. AI 兜底 —— 要錢，所以不在這裡做。這支只回報「哪些必填欄位沒對到」，
 *      由前端顯示預估金額讓人決定要不要按。
 *
 * 補齊同樣分層，能免費算出來的就不要問人也不要問 AI：
 *   L1 規則推導：總籤數 = Σ品項數量、殺率預設、機率依數量分配
 *   L2 站內歷史：同系列/同廠商既有商品的定價、分類、殺率
 */

interface ParsedRow {
  row: number
  product: Record<string, unknown>
  prizes: Record<string, unknown>[]
  /** 必填仍缺的欄位 key */
  missing: string[]
  /** 補齊了什麼、從哪來 —— 要讓人看得到系統動過手腳 */
  filled: { key: string; label: string; value: unknown; source: string }[]
  warnings: string[]
  /** 含日文、L1 處理不了的名稱。前端據此決定要不要花錢翻譯 */
  needsTranslation: string[]
}

function readWorkbook(buf: Buffer, filename: string): { headers: string[]; rows: Record<string, string>[] } {
  if (/\.csv$/i.test(filename)) {
    // BOM 要拿掉，不然第一個欄位名會變成 U+FEFF + 商品名稱，對不上任何別名。
    // 這裡刻意用逸出字元寫：直接貼 BOM 字元會被 ESLint 的
    // no-irregular-whitespace 擋下（那條規則害部署失敗過兩次）
    const text = buf.toString('utf8').replace(/^\uFEFF/, '')
    const p = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    return { headers: p.meta.fields ?? [], rows: p.data }
  }

  const wb = XLSX.read(buf, { type: 'buffer' })
  // 只取第一個有資料的工作表。多表通常是「說明」「範例」之類的附頁
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, defval: '' })
    if (aoa.length < 2) continue

    const rawHeaders = (aoa[0] ?? []).map(h => String(h ?? '').trim())
    const dataRows = aoa.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== ''))

    /*
     * 沒有標題、或標題重複的欄位要給一個能定址的名字。
     *
     * 原本是直接拿標題當 key，於是一整排空標題全部擠成同一個 key ''，
     * 互相覆蓋之後只剩最後一個（通常是空的）。實際廠商檔案裡，
     * 單價就是一欄沒有標題的數字 —— 那一欄因此永遠讀不到。
     *
     * 只有真的裝了東西的空標題欄才保留，不然一份 Excel 後面拖著二十個
     * 空欄位，會全部變成「第7欄」「第8欄」…把畫面塞滿。
     */
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

    const rows = dataRows.map(r => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '')])))
    return { headers: headers.filter(h => !h.startsWith('__empty_')), rows }
  }
  return { headers: [], rows: [] }
}

/** 站內既有商品的統計，用來推定新商品的定價/分類/殺率。一次查完，不要逐筆打 DB。 */
interface SiteStats {
  bySeries: Map<string, { price: number[]; category: string[] }>
  bySupplierType: Map<string, { price: number[]; profit: number[] }>
}

async function loadSiteStats(supplierId: number | null): Promise<SiteStats> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('products')
    .select('series, category, price, profit_rate, type, supplier_id')
    .not('price', 'is', null)
    .limit(3000)

  const bySeries = new Map<string, { price: number[]; category: string[] }>()
  const bySupplierType = new Map<string, { price: number[]; profit: number[] }>()

  for (const p of data ?? []) {
    if (p.series) {
      const k = String(p.series).trim().toLowerCase()
      if (!bySeries.has(k)) bySeries.set(k, { price: [], category: [] })
      const e = bySeries.get(k)!
      if (p.price > 0) e.price.push(Number(p.price))
      if (p.category && p.category !== '未分類') e.category.push(String(p.category))
    }
    if (supplierId && p.supplier_id === supplierId && p.type) {
      const k = String(p.type)
      if (!bySupplierType.has(k)) bySupplierType.set(k, { price: [], profit: [] })
      const e = bySupplierType.get(k)!
      if (p.price > 0) e.price.push(Number(p.price))
      if (p.profit_rate != null) e.profit.push(Number(p.profit_rate))
    }
  }
  return { bySeries, bySupplierType }
}

/**
 * 圖片欄位解析
 *
 * 廠商的圖片欄位有三種寫法，要分開處理：
 *   1. 完整網址 https://...        → 原樣採用
 *   2. 站內路徑 /images/...        → 原樣採用
 *   3. 純檔名 01KEVC....webp       → 對回 R2 的 products/<檔名>
 *
 * 第 3 種是最常見的（競品匯出格式就是），而原本會被整串當成網址寫進資料表，
 * 前台渲染出來就是破圖。所以先把 bucket 裡的檔名列一次建對應表，
 * 對得到才換成網址，對不到就留 null 並提醒去上傳圖片壓縮檔。
 */
function makeImageResolver(known: Set<string>) {
  return (raw: string | null): { url: string | null; missing: string | null } => {
    const v = (raw ?? '').trim()
    if (!v) return { url: null, missing: null }
    if (/^https?:\/\//i.test(v) || v.startsWith('/')) return { url: v, missing: null }

    // 只取檔名，廠商偶爾會連資料夾一起寫（images/foo.webp）
    const file = v.split(/[\\/]/).pop() ?? v
    if (known.has(file)) return { url: r2PublicUrl(`products/${file}`), missing: null }
    return { url: null, missing: file }
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const mode = (xs: string[]) => {
  if (!xs.length) return null
  const c = new Map<string, number>()
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export async function POST(request: Request) {
  try {
    const scope = await requireAdminScope()
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // 廠商連回傳的 JSON 裡都不該看到這個欄位 —— 介面沒顯示不代表沒送出去，
    // 打開 devtools 就看得到。畫面上則是不分身份都不出現（見下方推導那段）
    const hideProfitRate = scope.supplierScope !== undefined

    const form = await request.formData()
    const file = form.get('file') as File | null
    const supplierId = form.get('supplierId') ? Number(form.get('supplierId')) : null
    const forcedType = form.get('type') ? String(form.get('type')) as ProductType : null
    // 人工修正過的欄位對應。自動比對再準也有抓錯的時候，
    // 而且錯一個「商品名稱」整批就廢了 —— 讓人改一次比繼續加正則別名可靠
    let mappingOverride: Record<string, string | null> | null = null
    try {
      const raw = form.get('mappingOverride')
      if (raw) mappingOverride = JSON.parse(String(raw))
    } catch { /* 壞掉的 JSON 就當作沒給，照原本的自動比對走 */ }

    if (!file) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 })
    if (!supplierId) return NextResponse.json({ error: '請先選擇廠商' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const { headers, rows } = readWorkbook(buf, file.name)

    if (!headers.length || !rows.length) {
      return NextResponse.json({ error: '檔案裡讀不到資料，請確認第一列是欄位標題' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const fingerprint = headerFingerprint(headers)

    // ── 第 1 層：這家廠商的這個格式，之前對過嗎 ──
    const { data: profile } = await supabase
      .from('supplier_import_profiles')
      .select('id, mapping, prize_groups, use_count')
      .eq('supplier_id', supplierId)
      .eq('fingerprint', fingerprint)
      .maybeSingle()

    let mapping: Record<string, string | null>
    let prizeGroups: PrizeGroup[]
    let mappingSource: 'profile' | 'rules'

    const rulePrizeGroups = detectPrizeGroups(headers)

    /*
     * 品項有兩種排法，先看橫向（A賞名稱｜A賞數量｜B賞名稱…），
     * 找不到才試直式（一列一個品項）。直式在廠商的檔案裡一樣常見，
     * 而原本完全不支援 —— 症狀是「品項一個都沒有」，
     * 連帶總籤數算不出來、機率分配不了、圖片也對不到。
     */
    const verticalCols = rulePrizeGroups.length ? null : detectVerticalPrizeColumns(headers)

    // 被品項認領的標題不能再被商品欄位搶走。
    // 直式表的「圖片」是品項圖，原本會被商品主圖的 /^圖片$/ 認領走
    const claimedByPrize = new Set<string>([
      ...rulePrizeGroups.flatMap(g => [g.nameCol, g.quantityCol, g.imageCol, g.levelCol].filter(Boolean) as string[]),
      ...(verticalCols ? Object.values(verticalCols) : []),
    ])

    // 前 20 列給欄位比對看內容。標題不可靠時（「品名」裝的是貨號、
    // 單價那欄沒有標題），實際裝的東西才是最可靠的線索
    const sample = rows.slice(0, 20)
    const ruleMapping = detectFieldMapping(headers, PRODUCT_IMPORT_FIELDS, claimedByPrize, sample)

    if (profile) {
      // 記憶優先，規則補洞。
      //
      // 只用記憶的話，規則改善傳不進去 —— 實測就踩到：修好「上架狀態」的別名之後
      // 重新上傳同一份範本，命中數沒變，因為指紋認得就直接套上次那份不完整的對應。
      // 而記憶又不能丟：它可能是人工修正過的，比規則準。
      // 所以記憶裡有值的欄位以記憶為準，記憶沒對到的才拿規則的來補。
      const stored = profile.mapping as Record<string, string | null>
      mapping = { ...ruleMapping }
      for (const [k, v] of Object.entries(stored)) {
        if (v) mapping[k] = v
      }
      // 品項分組整組沿用 —— 那是橫向展開的結構，混搭會對錯欄
      const storedGroups = profile.prize_groups as PrizeGroup[]
      prizeGroups = storedGroups?.length ? storedGroups : rulePrizeGroups
      mappingSource = 'profile'
    } else {
      // ── 第 2 層：規則比對 ──
      mapping = ruleMapping
      prizeGroups = rulePrizeGroups
      mappingSource = 'rules'
    }

    // 人工修正蓋過一切。這是使用者看著自己的檔案指定的，比任何猜測都準
    if (mappingOverride) {
      for (const [k, v] of Object.entries(mappingOverride)) {
        if (k in mapping) mapping[k] = v || null
      }
      mappingSource = 'profile'
    }

    const stats = await loadSiteStats(supplierId)

    // R2 裡已經有哪些圖。列一次就好 —— 一批 100 個商品可能有上千張圖，
    // 逐張打 HEAD 會慢到讓解析超時
    let knownImages = new Set<string>()
    try {
      knownImages = await r2ListFilenames('products/')
    } catch {
      // 列不到就當作全部沒上傳。解析仍然要能完成，只是圖片會全部標成待補
    }
    const resolveImage = makeImageResolver(knownImages)

    // ── 逐筆組裝 ──
    const parsed: ParsedRow[] = []

    // 我們自己的範本第 2 列是範例、第 3 列是說明。廠商填的時候常常忘了刪，
    // 不擋掉的話每次匯入都會多兩筆垃圾商品
    const isSampleRow = (r: Record<string, string>) => {
      const first = String(Object.values(r)[0] ?? '').trim()
      return first.startsWith('#') || first.startsWith('範例）')
    }

    /*
     * 直式表要先分組：連續幾列屬於同一個商品。
     * 判斷方式是看商品名稱那一欄 —— 有值就是新商品的第一列，
     * 留白代表「延續上一個商品」（廠商很常只在第一列寫商品名）。
     *
     * 橫向表一列就是一個商品，所以每一列自成一組。
     */
    const nameCol = ruleMapping.name
    const groupedRows: { index: number; head: Record<string, string>; members: Record<string, string>[] }[] = []
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i]
      if (isSampleRow(raw)) continue
      const hasName = nameCol ? String(raw[nameCol] ?? '').trim() !== '' : true
      if (verticalCols && !hasName && groupedRows.length) {
        groupedRows[groupedRows.length - 1].members.push(raw)
      } else {
        groupedRows.push({ index: i, head: raw, members: [raw] })
      }
    }
    // 商品名每一列都重複寫的情況：同名的併成一個商品
    if (verticalCols && nameCol) {
      const merged: typeof groupedRows = []
      for (const g of groupedRows) {
        const key = String(g.head[nameCol] ?? '').trim()
        const prev = merged[merged.length - 1]
        if (prev && String(prev.head[nameCol] ?? '').trim() === key && key !== '') {
          prev.members.push(...g.members)
        } else {
          merged.push(g)
        }
      }
      groupedRows.length = 0
      groupedRows.push(...merged)
    }

    for (const group of groupedRows) {
      const raw = group.head
      const i = group.index
      const filled: ParsedRow['filled'] = []
      const warnings: string[] = []

      const type: ProductType =
        forcedType ??
        (mapping.type ? normalizeType(raw[mapping.type]) : null) ??
        'ichiban'

      const product: Record<string, unknown> = { type, supplier_id: supplierId }

      for (const def of PRODUCT_IMPORT_FIELDS) {
        if (def.key === 'type') continue
        const col = mapping[def.key]
        const v = col ? coerce(def, raw[col], type) : null
        if (v !== null && v !== undefined && v !== '') product[def.key] = v
      }

      // 商品主圖：檔名對回 R2 網址
      const missingImages: string[] = []
      if (product.image_url) {
        const r = resolveImage(String(product.image_url))
        product.image_url = r.url
        if (r.missing) missingImages.push(r.missing)
      }

      // 虛擬欄位：上市時間單欄 → 拆成年 / 月
      const rd = product._release_date
      if (rd) {
        const m = String(rd).match(/(\d{4})\D{0,3}(\d{1,2})?/)
        if (m) {
          if (!product.release_year)  product.release_year  = m[1]
          if (!product.release_month && m[2]) product.release_month = m[2].padStart(2, '0')
        }
      }
      delete product._release_date

      // ── 品項 ──
      const prizes: Record<string, unknown>[] = []

      if (verticalCols) {
        // 直式：這個商品底下的每一列就是一個品項
        const qtyDef = PRIZE_IMPORT_FIELDS.find(f => f.key === 'total')!
        for (const m of group.members) {
          const pname = String(m[verticalCols.name] ?? '').trim()
          if (!pname) continue
          const total = Number(coerce(qtyDef, m[verticalCols.total], type) ?? 0)
          const img = resolveImage(verticalCols.image_url ? String(m[verticalCols.image_url] ?? '') : null)
          if (img.missing) missingImages.push(img.missing)
          const prob = verticalCols.probability
            ? Number(coerce(PRIZE_IMPORT_FIELDS.find(f => f.key === 'probability')!, m[verticalCols.probability], type) ?? 0)
            : 0
          prizes.push({
            level: normalizeLevel(verticalCols.level ? m[verticalCols.level] : '', type) || '未分類',
            name: pname,
            total,
            remaining: total,
            image_url: img.url,
            probability: prob,
            recycle_value: verticalCols.recycle_value
              ? Number(coerce(PRIZE_IMPORT_FIELDS.find(f => f.key === 'recycle_value')!, m[verticalCols.recycle_value], type) ?? 0)
              : 0,
            sale_price: 0,
          })
        }
      }

      for (const g of prizeGroups) {
        const name = g.nameCol ? String(raw[g.nameCol] ?? '').trim() : ''
        if (!name) continue
        const qtyDef = PRIZE_IMPORT_FIELDS.find(f => f.key === 'total')!
        const level = normalizeLevel(g.levelCol ? raw[g.levelCol] : g.levelOverride, type)
        const total = Number(coerce(qtyDef, g.quantityCol ? raw[g.quantityCol] : null, type) ?? 0)
        prizes.push({
          level: level || g.levelOverride || '未分類',
          name,
          total,
          remaining: total,
          image_url: (() => {
            const r = resolveImage(g.imageCol ? String(raw[g.imageCol] ?? '') : null)
            if (r.missing) missingImages.push(r.missing)
            return r.url
          })(),
          probability: 0,
          recycle_value: 0,
          sale_price: 0,
        })
      }

      // ── L1 規則推導（免費）──

      // 總籤數 = Σ品項數量。實測 44 筆真實商品，98% 靠這條補到。
      if (!product.total_count && prizes.length) {
        const sum = prizes.reduce((a, p) => a + (Number(p.total) || 0), 0)
        if (sum > 0) {
          product.total_count = sum
          filled.push({ key: 'total_count', label: '總籤數', value: sum, source: '品項數量加總' })
        }
      }
      if (product.total_count) product.remaining = product.total_count

      /*
       * 籤號制的商品要有這個值，沒填就取同廠商同類型的中位數，再沒有就 1.0
       *（等於不設限，最保守）。
       *
       * 刻意不列進「已自動補齊」，也不出現在匯入流程的任何地方 ——
       * 不分身份。這個機制連名字都不該在上架畫面上出現：
       * 廠商看到會知道平台在調什麼，而平台自己要調的話有專門的頁面
       *（系統設定 → 殺率調整），那裡才是它該在的位置。
       */
      if (TICKETED_TYPES.includes(type) && product.profit_rate === undefined) {
        product.profit_rate = median(stats.bySupplierType.get(type)?.profit ?? []) ?? 1.0
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

      // ── L2 站內歷史（免費）──
      const seriesKey = String(product.series ?? '').trim().toLowerCase()
      if (seriesKey && stats.bySeries.has(seriesKey)) {
        const e = stats.bySeries.get(seriesKey)!
        if (!product.price) {
          const m = median(e.price)
          if (m) { product.price = m; filled.push({ key: 'price', label: '單抽價格', value: m, source: `同系列既有商品中位數` }) }
        }
        if (!product.category) {
          const c = mode(e.category)
          if (c) { product.category = c; filled.push({ key: 'category', label: '分類', value: c, source: '同系列既有商品' }) }
        }
      }
      if (!product.price && supplierId) {
        const m = median(stats.bySupplierType.get(type)?.price ?? [])
        if (m) { product.price = m; filled.push({ key: 'price', label: '單抽價格', value: m, source: '同廠商同類型中位數' }) }
      }

      // ── 預設值（schema 的 fallback）──
      for (const def of PRODUCT_IMPORT_FIELDS) {
        if (def.fallback === undefined) continue
        if (product[def.key] === undefined || product[def.key] === null || product[def.key] === '') {
          product[def.key] = def.fallback
        }
      }

      // 上架狀態的中文轉英文
      if (typeof product.status === 'string') {
        product.status = /上架|active|販售中|on/i.test(product.status) ? 'active' : 'pending'
      }

      // ── 進貨單的雜訊清掉（免費）──
      // 「BAN/xxx @30x5 040」這種寫法對倉管有意義，對玩家沒有；
      // 更關鍵的是帶著它去搜圖或查品項一定搜不到
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

      // ── 名稱台灣化（免費）──
      // 簡體轉繁 + 中國用語換台灣用語 + 全形排版清理。純字串處理，零成本，
      // 所以每一筆都跑，不需要問人也不需要按鈕。
      const naming = normalizeProductNames(product, prizes)
      if (naming.changed > 0) {
        filled.push({
          key: 'name', label: '名稱台灣化', value: `${naming.changed} 處`,
          source: '簡繁轉換 + 台灣用語',
        })
      }

      // ── 警告（不擋上架，只是要讓人知道）──
      const zeroQty = prizes.filter(p => !p.total || Number(p.total) < 1)
      if (zeroQty.length) {
        warnings.push(`${zeroQty.length} 個品項數量為 0，上架時會被略過`)
      }
      if (missingImages.length) {
        warnings.push(`${missingImages.length} 張圖尚未上傳（例：${missingImages[0]}），請用「上傳圖片」丟圖片壓縮檔後重新匯入`)
      }
      if (!product.image_url && !missingImages.length) warnings.push('沒有商品主圖')
      if (!prizes.length) warnings.push('廠商沒給品項，會以「待上架」建立，補完品項再開賣')

      // 介面沒顯示不代表沒送出去 —— 回應是整包 JSON，廠商打開 devtools 就看得到
      if (hideProfitRate) delete product.profit_rate

      parsed.push({
        row: i + 2, // +2：試算表第 1 列是標題，人看到的列號從 2 開始
        product,
        prizes: prizes.filter(p => Number(p.total) >= 1),
        missing: missingRequired(product, type),
        filled,
        warnings,
        needsTranslation: naming.needsTranslation,
      })
    }

    // ── 記住這個格式（規則比對成功才存，避免把錯的對應記起來）──
    if (mappingSource === 'rules') {
      const mappedCount = Object.values(mapping).filter(Boolean).length
      if (mappedCount >= 3 && prizeGroups.length > 0) {
        await supabase.from('supplier_import_profiles').upsert({
          supplier_id: supplierId,
          fingerprint,
          label: file.name,
          mapping,
          prize_groups: prizeGroups,
          use_count: 1,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'supplier_id,fingerprint' })
      }
    } else if (profile) {
      // 把補洞後的對應寫回去 —— 否則每次都要重新補一遍
      await supabase.from('supplier_import_profiles')
        .update({
          mapping,
          use_count: (profile.use_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
    }

    const readyCount = parsed.filter(p => p.missing.length === 0 && p.prizes.length > 0).length
    const noPrizeCount = parsed.filter(p => p.prizes.length === 0).length
    const missingImageCount = parsed.filter(p => p.warnings.some(w => w.includes('尚未上傳'))).length
    const jpNames = [...new Set(parsed.flatMap(p => p.needsTranslation))]

    return NextResponse.json({
      fingerprint,
      mappingSource,
      prizeLayout: verticalCols ? 'vertical' : (prizeGroups.length ? 'horizontal' : 'none'),
      mapping,
      prizeGroups,
      headers,
      stats: {
        total: parsed.length,
        ready: readyCount,
        needsAttention: parsed.length - readyCount,
        mappedFields: Object.values(mapping).filter(Boolean).length,
        totalFields: PRODUCT_IMPORT_FIELDS.length,
        autoFilled: parsed.reduce((a, p) => a + p.filled.length, 0),
        noPrize: noPrizeCount,
        missingImages: missingImageCount,
        knownImages: knownImages.size,
        needsTranslation: jpNames.length,
      },
      products: parsed,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '解析失敗'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
