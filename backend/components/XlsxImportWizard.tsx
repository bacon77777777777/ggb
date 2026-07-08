'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Papa from 'papaparse'
import { calculateSeedHash } from '@/utils/drawLogicClient'

interface ParsedProduct {
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
  jp_price_yen: number | null
  price_twd?: number | null
  cost?: number | null
  special_price?: number | null
  release_year?: string | null
  release_month?: string | null
  full_spec: string
  type: string
  image_url?: string | null
  raw_image_name?: string | null
  distributor?: string | null
  prizes?: { name: string; grade?: string; qty?: number; image_url?: string | null; raw_image_name?: string | null }[]
  missingFields?: string[]
}

interface EnrichedProduct extends ParsedProduct {
  name_zh?: string
  variants?: { name: string; image_url: string | null }[]
  aiStatus?: 'idle' | 'loading' | 'done' | 'partial' | 'error'
  aiError?: string
  selected?: boolean
}

const TYPE_OPTIONS = [
  { value: 'gacha',    label: '轉蛋' },
  { value: 'ichiban',  label: '一番賞' },
  { value: 'blindbox', label: '盒玩' },
  { value: 'card',     label: '抽卡' },
  { value: 'custom',   label: '自製賞' },
]
const TYPE_CATEGORY: Record<string, string> = {
  gacha: '轉蛋', ichiban: '一番賞', blindbox: '盒玩', card: '抽卡', custom: '自製賞',
}

type WizardStep = 'upload' | 'preview' | 'importing' | 'done'
type HighlightFilter = 'image' | 'prizes' | 'price' | null

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

const generateSeed = () =>
  Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('')

function isHttpUrl(s?: string | null): boolean {
  return !!s && /^https?:\/\//i.test(s)
}

export default function SmartImportWizard({ isOpen, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const zipRef  = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<WizardStep>('upload')
  const [products, setProducts] = useState<EnrichedProduct[]>([])
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [uploading, setUploading]     = useState(false)
  const [zipUploading, setZipUploading] = useState(false)
  const [progress, setProgress]       = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [failCount, setFailCount]     = useState(0)
  const [errors, setErrors]           = useState<string[]>([])
  const [enrichingAll, setEnrichingAll] = useState(false)
  const [enrichSummary, setEnrichSummary] = useState<{ done: number; partial: number; error: number } | null>(null)
  const [isDragging, setIsDragging]   = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [highlight, setHighlight]     = useState<HighlightFilter>(null)

  const toggleExpand = (i: number) => setExpandedRows(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  useEffect(() => {
    fetch('/api/admin/suppliers').then(r => r.json())
      .then(d => { if (Array.isArray(d)) setSuppliers(d) }).catch(() => {})
  }, [])

  const reset = () => {
    setStep('upload')
    setProducts([])
    setProgress(0)
    setSuccessCount(0)
    setFailCount(0)
    setErrors([])
    setEnrichingAll(false)
    setEnrichSummary(null)
    setIsDragging(false)
    setExpandedRows(new Set())
    setHighlight(null)
    if (fileRef.current) fileRef.current.value = ''
    if (zipRef.current) zipRef.current.value = ''
  }

  const handleClose = () => { reset(); onClose() }

  // ── Stats ──────────────────────────────────────────────────────────────────
  // 缺主圖 = 沒有 URL 且沒有待配對檔名（raw_image_name）
  const missingImageList  = products.filter(p => p.selected && !p.image_url && !p.raw_image_name)
  const missingPrizesList = products.filter(p => p.selected && !p.variants?.length)
  const missingPriceList  = products.filter(p => p.selected && !p.jp_price_yen && !p.price_twd)

  const cycleHighlight = (type: HighlightFilter) =>
    setHighlight(prev => prev === type ? null : type)

  // ── File processing ────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
      const isCsv  = file.name.endsWith('.csv')

      if (isXlsx) {
        const fd = new FormData()
        fd.append('file', file)
        const res  = await fetch('/api/admin/products/parse-xlsx', { method: 'POST', body: fd, credentials: 'include' })
        const data = await res.json()
        if (!res.ok) { alert(data.error || '解析失敗'); return }
        const all: EnrichedProduct[] = data.sheets.flatMap((s: any) =>
          s.products.map((p: ParsedProduct) => {
            const missing = p.missingFields ?? ['image', 'prizes']
            const hasImg  = isHttpUrl(p.image_url)
            const hasRaw  = !!p.raw_image_name
            const needsAi = (!hasImg && !hasRaw) || missing.includes('prizes')
            return {
              ...p,
              image_url:      hasImg  ? p.image_url  : null,
              raw_image_name: !hasImg ? p.raw_image_name : null,
              variants: p.prizes?.length
                ? p.prizes.map(pr => ({ name: pr.name, image_url: isHttpUrl(pr.image_url) ? pr.image_url! : null }))
                : undefined,
              variant_count: p.prizes?.length ?? p.variant_count,
              aiStatus: needsAi ? 'idle' as const : 'done' as const,
              selected: true,
            }
          })
        )
        setProducts(all)
        setStep('preview')
      } else if (isCsv) {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: h => h.replace(/^\uFEFF/, '').trim(),
          complete: result => {
            const headers = result.meta.fields ?? []
            const rows    = result.data ?? []
            const CSV_TYPE_MAP: Record<string, string> = {
              '一番賞': 'ichiban', '盒玩': 'blindbox', '盲盒': 'blindbox',
              '轉蛋': 'gacha', '抽卡': 'card', '卡牌': 'card', '自製賞': 'custom',
            }
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
            const isFullFormat = headers.includes('商品名稱') && headers.includes('商品類型')

            if (isFullFormat) {
              const all: EnrichedProduct[] = rows.map((row: any, i) => {
                const variants: { name: string; image_url: string | null }[] = []
                for (let n = 1; n <= 30; n++) {
                  const prizeName = String(row[`獎項${n}名稱`] ?? '').trim()
                  if (!prizeName) break
                  const imgFile = String(row[`獎項${n}圖片名稱`] ?? '').trim()
                  variants.push({
                    name: prizeName,
                    image_url: imgFile ? `${supabaseUrl}/storage/v1/object/public/products/${imgFile}` : null,
                  })
                }
                const imgFile  = String(row['商品圖片'] ?? '').trim()
                const image_url = imgFile ? `${supabaseUrl}/storage/v1/object/public/products/${imgFile}` : null
                const typeRaw  = String(row['商品類型'] ?? '').trim()
                const totalCount = variants.reduce((sum, _, idx) => sum + (Number(row[`獎項${idx + 1}數量`]) || 0), 0)
                return {
                  sku: row['商品編號'] || `ROW${i}`,
                  barcode: row['條碼'] || null,
                  name: String(row['商品名稱'] ?? '').trim(),
                  manufacturer_code: '',
                  per_case: 0, cases: 0,
                  total_count: totalCount || Number(row['總數量']) || 0,
                  variant_count: variants.length,
                  qty_per_variant: 0,
                  jp_price_yen: Number(row['日幣定價']) || null,
                  price_twd: Number(row['價格']) || null,
                  cost: Number(row['成本']) || null,
                  special_price: Number(row['特價']) || null,
                  full_spec: '',
                  type: CSV_TYPE_MAP[typeRaw] ?? 'gacha',
                  image_url,
                  distributor: String(row['代理商'] ?? '').trim() || null,
                  series: String(row['系列'] ?? '').trim() || null,
                  release_year: String(row['發售年'] ?? '').trim() || null,
                  release_month: String(row['發售月'] ?? '').trim() || null,
                  variants: variants.length ? variants : undefined,
                  aiStatus: 'idle' as const,
                  selected: true,
                } as EnrichedProduct
              }).filter(p => p.name)
              setProducts(all)
              setStep('preview')
              return
            }

            const all: EnrichedProduct[] = rows.map((row: any, i) => ({
              sku: row['品名'] || row['SKU'] || `ROW${i}`,
              barcode: row['國際條碼'] || null,
              name: row['name'] || row['商品名稱'] || '',
              manufacturer_code: '',
              per_case: Number(row['箱數']) || 0,
              cases: Number(row['備貨數量']) || 0,
              total_count: Number(row['品名規格']) || 0,
              variant_count: 0,
              qty_per_variant: 0,
              jp_price_yen: null,
              full_spec: '',
              type: CSV_TYPE_MAP[String(row['類型'] || '').trim()] ?? 'gacha',
              aiStatus: 'idle' as const,
              selected: true,
            })).filter(p => p.name)
            setProducts(all)
            setStep('preview')
          },
          error: () => alert('CSV 解析失敗'),
        })
      } else {
        alert('請上傳 .xlsx、.xls 或 .csv 檔案')
      }
    } finally {
      setUploading(false)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  // ── Zip 圖片上傳 ───────────────────────────────────────────────────────────
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setZipUploading(true)
    try {
      const fd = new FormData()
      fd.append('zip', file)
      const res  = await fetch('/api/admin/products/upload-images', { method: 'POST', body: fd, credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { alert(data.error || '上傳失敗'); return }
      const urlMap = new Map<string, string>(data.files.map((f: { name: string; url: string }) => [f.name, f.url]))
      // Match filenames to products and variants
      setProducts(prev => prev.map(p => {
        const imgUrl = p.raw_image_name ? urlMap.get(p.raw_image_name) : undefined
        const newVariants = p.variants?.map(v => {
          // variants don't have raw_image_name in interface yet, skip for now
          return v
        })
        if (!imgUrl && !newVariants) return p
        const updated: EnrichedProduct = {
          ...p,
          image_url: imgUrl ?? p.image_url,
          raw_image_name: imgUrl ? null : p.raw_image_name,  // clear if matched
          variants: newVariants ?? p.variants,
        }
        // Re-evaluate aiStatus
        if (imgUrl && (p.aiStatus === 'idle' || p.aiStatus === 'partial')) {
          const hasVariants = !!updated.variants?.length
          updated.aiStatus = hasVariants ? 'done' : 'partial'
        }
        return updated
      }))
      alert(`已上傳 ${data.uploaded} 張圖片，對應至商品清單中${data.failed > 0 ? `（${data.failed} 張失敗）` : ''}`)
    } catch (err: any) {
      alert('上傳失敗：' + String(err?.message || err))
    } finally {
      setZipUploading(false)
      if (zipRef.current) zipRef.current.value = ''
    }
  }

  // ── AI Enrich ──────────────────────────────────────────────────────────────

  const enrichOne = async (idx: number) => {
    const p = products[idx]
    setProducts(prev => prev.map((x, i) => i === idx ? { ...x, aiStatus: 'loading' } : x))
    try {
      const res = await fetch('/api/admin/products/ai-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          barcode: p.barcode,
          product_name: p.name,
          variants_count: p.variant_count,
          manufacturer_code: p.manufacturer_code,
          product_type: p.type || 'gacha',
          raw_image_name: p.raw_image_name ?? null,
          existing_variant_names: p.variants?.map(v => v.name) ?? [],
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || '補全失敗')
      const ai = data.data
      // 只有從外部來源（品牌網站/DB/萬代目錄）找到實際資料才算 done
      // 光靠 Claude 生成品項名不算，標為 partial
      const hasRealData = !!(ai.distributor || ai.jp_price_yen || ai.image_url)
      const aiStatus: EnrichedProduct['aiStatus'] = hasRealData
        ? (data.aiStatus ?? 'done')
        : 'partial'
      setProducts(prev => prev.map((x, i) => i === idx ? {
        ...x,
        // 只在 AI 回傳有值時才覆蓋，保留 xlsx 既有的 image_url
        image_url: ai.image_url || x.image_url || null,
        // 不用 xlsx 裡的 '代理商' 文字，那是欄位名稱不是實際值
        distributor: ai.distributor || (x.distributor && x.distributor !== '代理商' ? x.distributor : null) || null,
        variants: (() => {
          // 如果 AI 回傳的品項有名稱就用 AI 的，否則保留原有
          if (ai.variants?.length && ai.variants.some((v: any) => v.name)) return ai.variants
          return x.variants?.length ? x.variants : ai.variants
        })(),
        variant_count: ai.variant_count || x.variant_count,
        jp_price_yen: ai.jp_price_yen || x.jp_price_yen,
        aiStatus,
      } : x))
    } catch (err: any) {
      setProducts(prev => prev.map((x, i) => i === idx ? { ...x, aiStatus: 'error', aiError: String(err.message) } : x))
    }
  }

  const enrichAll = async () => {
    setEnrichingAll(true)
    setEnrichSummary(null)
    const idxList = products.map((_, i) => i).filter(i => products[i].selected && products[i].aiStatus !== 'done')
    const BATCH = 4
    for (let i = 0; i < idxList.length; i += BATCH) {
      await Promise.all(idxList.slice(i, i + BATCH).map(idx => enrichOne(idx)))
    }
    setProducts(prev => {
      const done    = prev.filter(p => p.aiStatus === 'done').length
      const partial = prev.filter(p => p.aiStatus === 'partial').length
      const error   = prev.filter(p => p.aiStatus === 'error').length
      setTimeout(() => setEnrichSummary({ done, partial, error }), 0)
      return prev
    })
    setEnrichingAll(false)
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    const toImport = products.filter(p => p.selected)
    if (!toImport.length) { alert('請選擇至少一個商品'); return }
    setStep('importing')
    setProgress(0)
    let ok = 0, fail = 0
    const errs: string[] = []

    for (let i = 0; i < toImport.length; i++) {
      const p = toImport[i]
      const variantNames = p.variants?.length
        ? p.variants
        : Array.from({ length: p.variant_count || 1 }, () => ({ name: '', image_url: null }))
      const vCount = variantNames.length || 1
      const total  = p.total_count || 0
      const base   = Math.floor(total / vCount)
      const rem    = total % vCount
      const prizes = variantNames.map((v, vi) => {
        const qty = base + (vi === 0 ? rem : 0)
        return { level: v.name, name: v.name, total: qty, remaining: qty, probability: 100 / vCount, image_url: v.image_url || null }
      })

      const seed     = generateSeed()
      const txidHash = await calculateSeedHash(seed)

      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          product: {
            product_code: p.sku,
            name: p.name_zh || p.name,
            category: TYPE_CATEGORY[p.type] ?? '轉蛋',
            type: p.type || 'gacha',
            price: p.price_twd ?? (p.jp_price_yen ? Math.round(p.jp_price_yen / 2) : 50),
            jp_price_yen: p.jp_price_yen || null,
            cost: p.cost || null,
            special_price: p.special_price || null,
            total_count: p.total_count,
            remaining: p.total_count,
            status: 'active',
            is_hot: false,
            image_url: p.image_url || null,
            barcode: p.barcode || null,
            distributor: p.distributor || null,
            series: p.series || null,
            release_year: p.release_year || null,
            release_month: p.release_month || null,
            supplier_id: selectedSupplierId ? parseInt(selectedSupplierId) : null,
            seed,
            txid_hash: txidHash,
          },
          prizes,
          tagIds: [],
        }),
      })

      if (res.ok) { ok++ } else {
        fail++
        const body = await res.json().catch(() => null)
        errs.push(`${p.name_zh || p.name}：${body?.error || res.status}`)
      }
      setProgress(Math.round(((i + 1) / toImport.length) * 100))
    }

    setSuccessCount(ok)
    setFailCount(fail)
    setErrors(errs.slice(0, 10))
    setStep('done')

    if (ok > 0) {
      fetch('/api/admin/seed-bot-draws', { method: 'POST', credentials: 'include' }).catch(() => {})
    }
  }

  const allSelected  = products.length > 0 && products.every(p => p.selected)
  const toggleAll    = () => setProducts(prev => prev.map(p => ({ ...p, selected: !allSelected })))
  const toggleOne    = (i: number) => setProducts(prev => prev.map((p, idx) => idx === i ? { ...p, selected: !p.selected } : p))
  const selectedCount = products.filter(p => p.selected).length
  const doneCount     = products.filter(p => p.aiStatus === 'done').length

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-7xl my-8 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-100">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-neutral-900 text-base">智能批量匯入</h2>
            <p className="text-xs text-neutral-400">
              {step === 'upload'    && '支援 .xlsx / .xls / .csv，可直接拖曳'}
              {step === 'preview'   && `已解析 ${products.length} 個商品${doneCount > 0 ? `，${doneCount} 個已補全` : ''}`}
              {step === 'importing' && `匯入中… ${Math.round(progress)}%`}
              {step === 'done'      && `完成：成功 ${successCount} 筆，失敗 ${failCount} 筆`}
            </p>
          </div>
          {step === 'preview' && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              {/* 缺資訊統計 chips */}
              <button
                onClick={() => cycleHighlight('image')}
                className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 border transition-colors ${
                  highlight === 'image'
                    ? 'bg-amber-100 text-amber-700 border-amber-300 ring-1 ring-amber-300'
                    : missingImageList.length > 0
                      ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                      : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                }`}
              >
                缺主圖 <span className="font-bold">{missingImageList.length}</span>
              </button>
              <button
                onClick={() => cycleHighlight('prizes')}
                className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 border transition-colors ${
                  highlight === 'prizes'
                    ? 'bg-orange-100 text-orange-700 border-orange-300 ring-1 ring-orange-300'
                    : missingPrizesList.length > 0
                      ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                      : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                }`}
              >
                缺品項 <span className="font-bold">{missingPrizesList.length}</span>
              </button>
              <button
                onClick={() => cycleHighlight('price')}
                className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 border transition-colors ${
                  highlight === 'price'
                    ? 'bg-rose-100 text-rose-700 border-rose-300 ring-1 ring-rose-300'
                    : missingPriceList.length > 0
                      ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                      : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                }`}
              >
                缺定價 <span className="font-bold">{missingPriceList.length}</span>
              </button>
              <div className="h-4 w-px bg-neutral-200 mx-0.5" />
              {/* Enrich all */}
              <button
                onClick={enrichAll}
                disabled={enrichingAll}
                className="px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {enrichingAll ? '補全中…' : '全部AI補全'}
              </button>
            </div>
          )}
          <button onClick={handleClose} className="flex-shrink-0 text-neutral-400 hover:text-neutral-600 text-lg leading-none ml-1">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-neutral-700 mb-2">選擇供應廠商</p>
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">— 未指定廠商 —</option>
                  {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>
              <div
                className={`border-2 border-dashed rounded-xl p-14 text-center transition-all
                  ${!selectedSupplierId
                    ? 'border-neutral-200 bg-neutral-50 opacity-50 cursor-not-allowed'
                    : isDragging
                      ? 'border-violet-400 bg-violet-50 scale-[1.01] cursor-pointer'
                      : 'border-neutral-200 hover:border-violet-300 hover:bg-violet-50/40 cursor-pointer'
                  }`}
                onClick={() => selectedSupplierId && fileRef.current?.click()}
                onDragOver={e => { if (selectedSupplierId) handleDragOver(e); else e.preventDefault() }}
                onDragLeave={handleDragLeave}
                onDrop={e => { if (selectedSupplierId) handleDrop(e); else e.preventDefault() }}
              >
                {uploading ? (
                  <div className="space-y-3"><div className="w-8 h-8 border-4 border-violet-300 border-t-violet-600 rounded-full animate-spin mx-auto" /><p className="font-semibold text-neutral-700">解析中…</p></div>
                ) : (
                  <>
                    <div className="text-5xl mb-4">{isDragging ? '📂' : '📊'}</div>
                    <p className="font-semibold text-neutral-800 text-base">
                      {isDragging ? '放開以上傳' : '拖曳或點擊上傳廠商報表'}
                    </p>
                    <p className="text-sm text-neutral-400 mt-1">{selectedSupplierId ? '支援 .xlsx、.xls、.csv' : '請先選擇供應廠商'}</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
                <p className="font-semibold text-blue-800">智能欄位識別</p>
                <p>• 支援任意廠商格式，欄位名稱不同也能自動對應</p>
                <p>• 可識別：名稱、條碼、類型、系列、代理商、日幣/售價/成本/特價、發售時間、品項清單+圖片</p>
                <p>• 檔案含圖片檔名（如 abc.jpg）→ 可在商品管理頁用「上傳圖片」批量配對</p>
              </div>
            </div>
          )}

          {/* ── Preview ── */}
          {step === 'preview' && (
            <div className="space-y-3">

              {/* AI 補全結果摘要 */}
              {enrichSummary && !enrichingAll && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-violet-50 border border-violet-200 rounded-xl text-sm">
                  <span className="text-violet-700 font-semibold shrink-0">AI 補全完成</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span className="text-emerald-700 font-medium">完成：{enrichSummary.done} 件</span>
                    {enrichSummary.partial > 0 && <span className="text-amber-600 font-medium">未完整：{enrichSummary.partial} 件</span>}
                    {enrichSummary.error > 0 && <span className="text-red-600 font-medium">失敗：{enrichSummary.error} 件</span>}
                  </div>
                  {enrichSummary.partial > 0 && <span className="ml-auto text-xs text-neutral-400 shrink-0">缺圖商品仍可匯入</span>}
                </div>
              )}

              {/* Table */}
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[2rem_3.5rem_1fr_7rem_5.5rem_9rem_6rem_4rem_4rem_5.5rem] items-center gap-x-3 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-medium text-neutral-500">
                  <label className="cursor-pointer flex items-center" title={`全選 (${selectedCount}/${products.length})`}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                  </label>
                  <span>圖片</span>
                  <span>商品名稱</span>
                  <span>條碼</span>
                  <span>類型</span>
                  <span>代理商</span>
                  <span>日幣 / 定價</span>
                  <span className="text-center">件數</span>
                  <span className="text-center">品項</span>
                  <span className="text-right">狀態</span>
                </div>

                {/* Rows */}
                {products.map((p, i) => {
                  const expanded   = expandedRows.has(i)
                  const variantList = p.variants?.length
                    ? p.variants
                    : p.variant_count > 0
                      ? Array.from({ length: p.variant_count }, () => ({ name: '', image_url: null }))
                      : []

                  const isHighlighted =
                    (highlight === 'image'  && !p.image_url) ||
                    (highlight === 'prizes' && !p.variants?.length) ||
                    (highlight === 'price'  && !p.jp_price_yen && !p.price_twd)

                  return (
                    <div
                      key={i}
                      className={`border-b border-neutral-100 last:border-0 transition-colors ${!p.selected ? 'opacity-40' : ''} ${isHighlighted ? 'bg-amber-50/60 ring-1 ring-inset ring-amber-300' : ''}`}
                    >
                      {/* Main row */}
                      <div
                        className="grid grid-cols-[2rem_3.5rem_1fr_7rem_5.5rem_9rem_6rem_4rem_4rem_5.5rem] items-center gap-x-3 px-3 py-2.5 cursor-pointer hover:bg-neutral-50/80 active:bg-neutral-100 transition-colors"
                        onClick={() => toggleExpand(i)}
                      >
                        <input
                          type="checkbox"
                          checked={p.selected ?? true}
                          onChange={() => toggleOne(i)}
                          onClick={e => e.stopPropagation()}
                          className="rounded"
                        />

                        {/* Main image */}
                        <div className="w-12 h-12 rounded-lg border border-neutral-200 overflow-hidden bg-neutral-50 flex-shrink-0 relative">
                          {p.image_url && (
                            <img
                              src={p.image_url}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={e => {
                                const img = e.currentTarget
                                img.style.display = 'none'
                                const fb = img.nextElementSibling as HTMLElement | null
                                if (fb) fb.style.display = 'flex'
                              }}
                            />
                          )}
                          <div
                            className="absolute inset-0 flex items-center justify-center text-neutral-300 text-lg"
                            style={{ display: p.image_url ? 'none' : 'flex' }}
                          >
                            {p.raw_image_name ? '📄' : '?'}
                          </div>
                        </div>

                        {/* Name */}
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-900 text-sm leading-snug line-clamp-2">{p.name_zh || p.name}</p>
                          {p.series && <p className="text-xs text-neutral-400 truncate">{p.series}</p>}
                        </div>

                        <span className="font-mono text-xs text-neutral-400 truncate">{p.barcode || '—'}</span>

                        <select
                          value={p.type || 'gacha'}
                          onChange={e => { const v = e.target.value; setProducts(prev => prev.map((x, j) => j === i ? { ...x, type: v } : x)) }}
                          onClick={e => e.stopPropagation()}
                          className="text-xs border border-neutral-200 rounded px-1 py-1 bg-white text-neutral-700 w-full"
                        >
                          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>

                        <span className="text-xs text-neutral-500 truncate" title={p.distributor || undefined}>{p.distributor || '—'}</span>

                        <span className="text-xs text-neutral-600">
                          {p.jp_price_yen
                            ? <><span className="text-neutral-400">¥{p.jp_price_yen}</span> <strong className="text-primary">{Math.round(p.jp_price_yen / 2)}G</strong></>
                            : p.price_twd
                              ? <strong className="text-primary">{p.price_twd}G</strong>
                              : <span className="text-neutral-300">—</span>}
                        </span>

                        <span className="text-xs text-neutral-600 text-center">{p.total_count > 0 ? p.total_count.toLocaleString() : '—'}</span>

                        <div className="flex items-center justify-center gap-1 text-xs text-neutral-600">
                          <span>{variantList.length > 0 ? variantList.length : '—'}</span>
                          <span className="text-neutral-400 text-[10px]">{expanded ? '▲' : '▼'}</span>
                        </div>

                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          {p.aiStatus === 'loading' && <span className="text-xs text-violet-500 animate-pulse">搜尋中…</span>}
                          {p.aiStatus === 'done'    && <span className="text-xs text-emerald-600 font-medium">✓ 已補全</span>}
                          {p.aiStatus === 'partial' && <button onClick={() => enrichOne(i)} className="text-xs text-amber-600 hover:underline" title="可重試">⚠ 未完整</button>}
                          {p.aiStatus === 'error'   && <button onClick={() => enrichOne(i)} className="text-xs text-red-500 hover:underline" title={p.aiError}>重試</button>}
                          {p.aiStatus === 'idle'    && <button onClick={() => enrichOne(i)} className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded hover:bg-violet-200">補全</button>}
                        </div>
                      </div>

                      {/* Expandable detail */}
                      {expanded && (
                        <div className="bg-neutral-50/80 border-t border-neutral-100 px-4 py-3 space-y-3">
                          {/* Extra info row */}
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
                            {p.name_jp && <span>🇯🇵 {p.name_jp}</span>}
                            {(p.release_year || p.release_month) && <span>📅 發售 {p.release_year ?? '?'}年{p.release_month ? `${p.release_month}月` : ''}</span>}
                            {p.cost && <span>💴 成本 {p.cost}G</span>}
                            {p.special_price && <span>🏷 特價 {p.special_price}G</span>}
                            {p.raw_image_name && <span className="text-amber-600">📄 待配對圖片：{p.raw_image_name}</span>}
                          </div>
                          {/* Variants */}
                          {variantList.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                              {variantList.map((v, vi) => (
                                <div key={vi} className="flex items-center gap-2 bg-white border border-neutral-100 rounded-lg p-2 shadow-sm">
                                  <div className="w-10 h-10 rounded-md bg-neutral-100 flex-shrink-0 relative overflow-hidden">
                                    {v.image_url && (
                                      <img
                                        src={v.image_url}
                                        alt=""
                                        className="absolute inset-0 w-full h-full object-cover"
                                        onError={e => {
                                          const img = e.currentTarget
                                          img.style.display = 'none'
                                          const fb = img.nextElementSibling as HTMLElement | null
                                          if (fb) fb.style.display = 'flex'
                                        }}
                                      />
                                    )}
                                    <div
                                      className="absolute inset-0 flex items-center justify-center text-neutral-300 text-xs"
                                      style={{ display: v.image_url ? 'none' : 'flex' }}
                                    >?</div>
                                  </div>
                                  <span className="text-xs text-neutral-700 leading-tight line-clamp-2 min-w-0">{v.name || <span className="text-neutral-300 italic">未命名</span>}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-neutral-400 italic">無任何品項資訊</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-neutral-400 pt-2">
                ※ 點擊任意列可展開品項詳情。圖片 📄 表示有檔名但尚未上傳至 Storage（請至商品管理頁用「上傳圖片」批量上傳）。
              </p>
            </div>
          )}

          {/* ── Importing ── */}
          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <div className="w-8 h-8 border-4 border-violet-300 border-t-violet-600 rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-neutral-700">匯入中，請稍候…</p>
              <div className="w-full bg-neutral-100 rounded-full h-3 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-neutral-500">{progress}%</p>
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div className="py-6 space-y-4">
              <div className="text-center">
                <div className="text-5xl mb-3">{failCount === 0 ? '✓' : '!'}</div>
                <p className="text-lg font-bold text-neutral-900">成功 {successCount} 筆 / 失敗 {failCount} 筆</p>
                <p className="text-sm text-neutral-500 mt-1">商品已設為「上架」狀態，可至商品管理頁確認。</p>
              </div>
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">
                  <p className="font-semibold mb-2">失敗詳情：</p>
                  {errors.map((e, i) => <p key={i} className="text-xs">• {e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-100 px-6 py-4 flex items-center justify-between">
          <button
            onClick={step === 'done' ? reset : handleClose}
            className="px-4 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50 transition-colors"
          >
            {step === 'done' ? '再次匯入' : '取消'}
          </button>
          {step === 'preview' && (
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              開始匯入 {selectedCount} 個商品
            </button>
          )}
          {step === 'done' && (
            <button
              onClick={() => { onImported(); handleClose() }}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
