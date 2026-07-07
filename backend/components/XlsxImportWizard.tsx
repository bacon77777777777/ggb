'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Papa from 'papaparse'
import { calculateSeedHash } from '@/utils/drawLogicClient'

interface ParsedProduct {
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
}

interface EnrichedProduct extends ParsedProduct {
  name_zh?: string
  description?: string
  image_url?: string | null
  distributor?: string | null
  variants?: { name: string; image_url: string | null }[]
  aiStatus?: 'idle' | 'loading' | 'done' | 'partial' | 'error'
  aiError?: string
  selected?: boolean
}

type WizardStep = 'upload' | 'preview' | 'importing' | 'done'

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

const generateSeed = () =>
  Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('')

export default function SmartImportWizard({ isOpen, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<WizardStep>('upload')
  const [products, setProducts] = useState<EnrichedProduct[]>([])
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [failCount, setFailCount] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [enrichingAll, setEnrichingAll] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
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
    setIsDragging(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => { reset(); onClose() }

  // ── File processing ────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
      const isCsv  = file.name.endsWith('.csv')

      if (isXlsx) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/admin/products/parse-xlsx', { method: 'POST', body: fd, credentials: 'include' })
        const data = await res.json()
        if (!res.ok) { alert(data.error || '解析失敗'); return }
        const all: EnrichedProduct[] = data.sheets.flatMap((s: any) =>
          s.products.map((p: ParsedProduct) => ({ ...p, aiStatus: 'idle' as const, selected: true }))
        )
        setProducts(all)
        setStep('preview')
      } else if (isCsv) {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: h => h.replace(/^﻿/, '').trim(),
          complete: result => {
            // Convert CSV rows to ParsedProduct shape using best-guess columns
            const rows = result.data ?? []
            const all: EnrichedProduct[] = rows.map((row: any, i) => ({
              sku: row['品名'] || row['SKU'] || row['product_code'] || `ROW${i}`,
              barcode: row['國際條碼'] || row['barcode'] || null,
              name: row['name'] || row['商品名稱'] || Object.values(row)[5] as string || '',
              manufacturer_code: '',
              per_case: Number(row['箱數']) || 0,
              cases: Number(row['備貨數量']) || 0,
              total_count: Number(row['品名規格']) || Number(row['total_count']) || 0,
              variant_count: 0,
              qty_per_variant: 0,
              jp_price_yen: null,
              full_spec: '',
              aiStatus: 'idle' as const,
              selected: true,
            })).filter(p => p.name)
            setProducts(all)
            setStep('preview')
          },
          error: () => alert('CSV 解析失敗，請確認檔案格式'),
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

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
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
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.ok) throw new Error(data.error || '補全失敗')
      const ai = data.data
      const hasImage = !!ai.image_url
      const hasNames = ai.variants?.some((v: any) => v.name?.trim().length > 0)
      const aiStatus: EnrichedProduct['aiStatus'] = (hasImage && hasNames) ? 'done' : 'partial'
      setProducts(prev => prev.map((x, i) => i === idx ? {
        ...x,
        image_url: ai.image_url || null,
        distributor: ai.distributor || x.distributor || null,
        variants: ai.variants?.length ? ai.variants : x.variants,
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
    const idxList = products.map((_, i) => i).filter(i => products[i].selected && products[i].aiStatus !== 'done')
    for (const idx of idxList) await enrichOne(idx)
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
      const rem    = total % vCount  // 餘數加到品項 1
      const prizes = variantNames.map((v, vi) => {
        const qty = base + (vi === 0 ? rem : 0)
        return {
          level: v.name,
          name: v.name,
          total: qty,
          remaining: qty,
          probability: 100 / vCount,
          image_url: v.image_url || null,
        }
      })

      const seed = generateSeed()
      const txidHash = await calculateSeedHash(seed)

      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          product: {
            product_code: p.sku,
            name: p.name_zh || p.name,
            category: '轉蛋',
            type: 'gacha',
            price: p.jp_price_yen ? Math.round(p.jp_price_yen / 2) : 50,
            cost: null,
            total_count: p.total_count,
            remaining: p.total_count,
            status: 'active',
            is_hot: false,
            image_url: p.image_url || null,
            barcode: p.barcode || null,
            distributor: p.distributor || null,
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
  }

  const allSelected = products.length > 0 && products.every(p => p.selected)
  const toggleAll   = () => setProducts(prev => prev.map(p => ({ ...p, selected: !allSelected })))
  const toggleOne   = (i: number) => setProducts(prev => prev.map((p, idx) => idx === i ? { ...p, selected: !p.selected } : p))
  const selectedCount = products.filter(p => p.selected).length
  const doneCount     = products.filter(p => p.aiStatus === 'done').length

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl my-8 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-100">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-neutral-900 text-base">🤖 智能批量匯入</h2>
            <p className="text-xs text-neutral-400">
              {step === 'upload'    && '支援 .xlsx / .xls / .csv，可直接拖曳'}
              {step === 'preview'   && `已解析 ${products.length} 個商品${doneCount > 0 ? `，${doneCount} 個已補全` : ''}`}
              {step === 'importing' && `匯入中… ${Math.round(progress)}%`}
              {step === 'done'      && `完成：成功 ${successCount} 筆，失敗 ${failCount} 筆`}
            </p>
          </div>
          {step === 'preview' && (
            <button
              onClick={enrichAll}
              disabled={enrichingAll}
              className="flex-shrink-0 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {enrichingAll ? <><span className="animate-spin inline-block">⚙️</span>補全中…</> : '🤖 全部 AI 補全'}
            </button>
          )}
          <button onClick={handleClose} className="flex-shrink-0 text-neutral-400 hover:text-neutral-600 text-lg leading-none">✕</button>
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
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
                >
                  <option value="">— 未指定廠商 —</option>
                  {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-14 text-center transition-all
                  ${!selectedSupplierId
                    ? 'border-neutral-200 bg-neutral-50 opacity-50 cursor-not-allowed'
                    : isDragging
                      ? 'border-violet-400 bg-violet-50 scale-[1.01] cursor-pointer'
                      : 'border-neutral-200 hover:border-violet-300 hover:bg-violet-50/40 cursor-pointer'
                  }`}
                onClick={() => selectedSupplierId && fileRef.current?.click()}
                onDragOver={e => { if (selectedSupplierId) { handleDragOver(e) } else { e.preventDefault() } }}
                onDragLeave={handleDragLeave}
                onDrop={e => { if (selectedSupplierId) { handleDrop(e) } else { e.preventDefault() } }}
              >
                {uploading ? (
                  <div className="space-y-3">
                    <div className="text-4xl animate-spin inline-block">⚙️</div>
                    <p className="font-semibold text-neutral-700">解析中…</p>
                  </div>
                ) : (
                  <>
                    <div className="text-5xl mb-4">{isDragging ? '📂' : '📊'}</div>
                    <p className="font-semibold text-neutral-800 text-base">
                      {isDragging ? '放開以上傳' : '拖曳或點擊上傳廠商報表'}
                    </p>
                    <p className="text-sm text-neutral-400 mt-1">
                      {selectedSupplierId ? '支援 .xlsx、.xls、.csv' : '請先選擇供應廠商'}
                    </p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
                <p className="font-semibold text-blue-800">自動識別格式</p>
                <p>• <strong>模威 Excel</strong>：品名 / 國際條碼 / 箱數 / 備貨數量 / 品名規格 / 商品名稱規格（含 @NNxM PPP）</p>
                <p>• 通用 CSV：自動對應常見欄位名稱</p>
              </div>
            </div>
          )}

          {/* ── Preview ── */}
          {step === 'preview' && (
            <div className="space-y-0">
              {/* Table */}
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                {/* Header — 全選 lives here */}
                <div className="grid grid-cols-[2rem_3.5rem_1fr_7rem_5rem_6rem_4rem_4rem_5.5rem] items-center gap-x-3 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-medium text-neutral-500">
                  <label className="cursor-pointer flex items-center" title={`全選 (${selectedCount}/${products.length})`}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                  </label>
                  <span>圖片</span>
                  <span>商品名稱</span>
                  <span>條碼</span>
                  <span>代理商</span>
                  <span>日幣 / 定價</span>
                  <span className="text-center">件數</span>
                  <span className="text-center">品項</span>
                  <span className="text-right">狀態</span>
                </div>

                {/* Rows */}
                {products.map((p, i) => {
                  const expanded = expandedRows.has(i)
                  const variantList = p.variants?.length
                    ? p.variants
                    : p.variant_count > 0
                      ? Array.from({ length: p.variant_count }, () => ({ name: '', image_url: null }))
                      : []

                  return (
                    <div key={i} className={`border-b border-neutral-100 last:border-0 ${!p.selected ? 'opacity-40' : ''}`}>
                      {/* Main row — click anywhere (except checkbox/status) to toggle expand */}
                      <div
                        className={`grid grid-cols-[2rem_3.5rem_1fr_7rem_5rem_6rem_4rem_4rem_5.5rem] items-center gap-x-3 px-3 py-2.5 transition-colors ${variantList.length > 0 ? 'cursor-pointer hover:bg-neutral-50 active:bg-neutral-100' : 'hover:bg-neutral-50/60'}`}
                        onClick={() => variantList.length > 0 && toggleExpand(i)}
                      >
                        {/* Checkbox — stop propagation so row click doesn't fire */}
                        <input
                          type="checkbox"
                          checked={p.selected ?? true}
                          onChange={() => toggleOne(i)}
                          onClick={e => e.stopPropagation()}
                          className="rounded"
                        />

                        {/* Main image */}
                        <div className="w-12 h-12 rounded-lg border border-neutral-200 overflow-hidden bg-neutral-50 flex-shrink-0">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-300 text-lg">?</div>
                          )}
                        </div>

                        {/* Name */}
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-900 text-sm leading-snug line-clamp-2">{p.name_zh || p.name}</p>
                        </div>

                        {/* Barcode */}
                        <span className="font-mono text-xs text-neutral-400 truncate">{p.barcode || '—'}</span>

                        {/* Distributor */}
                        <span className="text-xs text-neutral-500 truncate">{p.distributor || '—'}</span>

                        {/* Price */}
                        <span className="text-xs text-neutral-600">
                          {p.jp_price_yen
                            ? <><span className="text-neutral-400">¥{p.jp_price_yen}</span> <strong className="text-primary">{Math.round(p.jp_price_yen / 2)}G</strong></>
                            : <span className="text-neutral-300">—</span>}
                        </span>

                        {/* Total */}
                        <span className="text-xs text-neutral-600 text-center">{p.total_count > 0 ? p.total_count.toLocaleString() : '—'}</span>

                        {/* Variant count indicator */}
                        <div className="flex items-center justify-center gap-1 text-xs text-neutral-600">
                          {variantList.length > 0 ? (
                            <><span>{variantList.length}</span><span className="text-neutral-400">{expanded ? '▲' : '▼'}</span></>
                          ) : p.aiStatus === 'idle' || p.aiStatus === undefined ? (
                            <span className="text-neutral-300">?</span>
                          ) : '—'}
                        </div>

                        {/* Status — stop propagation so clicks on buttons don't toggle expand */}
                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          {p.aiStatus === 'loading' && <span className="text-xs text-violet-500 animate-pulse">搜尋中…</span>}
                          {p.aiStatus === 'done'    && <span className="text-xs text-emerald-600 font-medium">✓ 已補全</span>}
                          {p.aiStatus === 'partial' && <button onClick={() => enrichOne(i)} className="text-xs text-amber-600 hover:underline" title="圖片與名稱未完整抓到，可重試">⚠ 未完整</button>}
                          {p.aiStatus === 'error'   && <button onClick={() => enrichOne(i)} className="text-xs text-red-500 hover:underline" title={p.aiError}>重試</button>}
                          {p.aiStatus === 'idle'    && <button onClick={() => enrichOne(i)} className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded hover:bg-violet-200">補全</button>}
                        </div>
                      </div>

                      {/* Expandable variants */}
                      {expanded && variantList.length > 0 && (
                        <div className="bg-neutral-50/80 border-t border-neutral-100 px-4 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                            {variantList.map((v, vi) => (
                              <div key={vi} className="flex items-center gap-2 bg-white border border-neutral-100 rounded-lg p-2 shadow-sm">
                                {v.image_url ? (
                                  <img src={v.image_url} alt="" className="w-10 h-10 object-cover rounded-md flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                                ) : (
                                  <div className="w-10 h-10 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-300 text-xs flex-shrink-0">?</div>
                                )}
                                <span className="text-xs text-neutral-700 leading-tight line-clamp-2 min-w-0">{v.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-neutral-400 pt-2">
                ※ 圖片：Bandai 官方目錄（主）/ 圖片搜尋（備）。品項名稱：免費爬蟲優先，Claude AI 兜底翻譯為繁中。
              </p>
            </div>
          )}

          {/* ── Importing ── */}
          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <div className="text-4xl animate-bounce">⏳</div>
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
                <div className="text-5xl mb-3">{failCount === 0 ? '🎉' : '⚠️'}</div>
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
