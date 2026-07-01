'use client'

import { useRef, useState } from 'react'
import Papa from 'papaparse'
import {
  PRODUCT_FIELDS,
  detectFieldMapping,
  detectPrizeGroups,
  type ProductFieldKey,
  type PrizeGroup,
} from '@/utils/csvColumnDetect'
import { sanitizeImageUrl } from '@/lib/image-utils'
import { calculateSeedHash } from '@/utils/drawLogicClient'

// ── Types ──────────────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'mapping' | 'importing' | 'done'

type ProductType = 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom'

const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string }[] = [
  { value: 'ichiban',  label: '一番賞' },
  { value: 'blindbox', label: '盒玩' },
  { value: 'gacha',    label: '轉蛋' },
  { value: 'card',     label: '抽卡' },
  { value: 'custom',   label: '自製賞' },
]

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const toBool = (v: any) => ['1', 'true', 'yes', 'y', '是'].includes(String(v ?? '').trim().toLowerCase())

const toNumber = (v: any) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[,\s]/g, ''))
  return isNaN(n) ? null : n
}

const mapStatus = (v: any) => {
  const s = String(v ?? '').trim().toLowerCase()
  if (['active', '上架', '進行中', 'selling'].includes(s)) return 'active'
  if (['ended', '下架', '已完抽'].includes(s)) return 'ended'
  return 'pending'
}

const mapType = (v: any): ProductType => {
  const s = String(v ?? '').trim().toLowerCase()
  if (['ichiban', '一番賞'].includes(s)) return 'ichiban'
  if (['blindbox', '盲盒', '盒玩'].includes(s)) return 'blindbox'
  if (['gacha', '轉蛋'].includes(s)) return 'gacha'
  if (['card', '抽卡'].includes(s)) return 'card'
  return 'custom'
}

const formatImageUrl = (val: any) => {
  const s = String(val ?? '').trim().replace(/\)+$/, '')
  if (!s) return null
  const sanitized = sanitizeImageUrl(s)
  if (sanitized) return sanitized
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/products/${s}` : s
}

const parseStartedAt = (val: any) => {
  const s = String(val ?? '').trim()
  if (!s) return null
  if (s.includes('T')) return s
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const [, y, mo, d, hh, mm, ss] = m
  return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${hh.padStart(2,'0')}:${mm}:${(ss||'00').padStart(2,'0')}`
}

const generateSeed = () =>
  Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('')

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CsvImportWizard({ isOpen, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  // Step state
  const [step, setStep] = useState<WizardStep>('upload')

  // CSV data
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])

  // Mapping
  const [fieldMap, setFieldMap] = useState<Record<ProductFieldKey, string | null>>({} as any)
  const [prizeGroups, setPrizeGroups] = useState<PrizeGroup[]>([])
  const [defaultType, setDefaultType] = useState<ProductType>('ichiban')

  // Import progress
  const [progress, setProgress] = useState(0)
  const [countText, setCountText] = useState('')
  const [successCount, setSuccessCount] = useState(0)
  const [failCount, setFailCount] = useState(0)
  const [errors, setErrors] = useState<string[]>([])

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = () => {
    setStep('upload')
    setHeaders([])
    setRows([])
    setFieldMap({} as any)
    setPrizeGroups([])
    setProgress(0)
    setCountText('')
    setSuccessCount(0)
    setFailCount(0)
    setErrors([])
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => { reset(); onClose() }

  // ── Step 1: Parse CSV ──────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.replace(/^﻿/, '').trim(),
      complete: result => {
        const hdrs = result.meta.fields ?? []
        const dataRows = (result.data ?? []).filter(r =>
          Object.values(r).some(v => String(v ?? '').trim() !== '')
        )
        setHeaders(hdrs)
        setRows(dataRows)

        // Auto-detect
        const detectedFields = detectFieldMapping(hdrs)
        setFieldMap(detectedFields)
        const detectedPrizes = detectPrizeGroups(hdrs)
        setPrizeGroups(detectedPrizes)
        setStep('mapping')
      },
      error: () => alert('CSV 解析失敗，請確認檔案格式'),
    })
  }

  // ── Step 2: Mapping helpers ────────────────────────────────────────────────

  const setField = (key: ProductFieldKey, col: string | null) =>
    setFieldMap(prev => ({ ...prev, [key]: col }))

  const updatePrizeGroup = (id: string, update: Partial<PrizeGroup>) =>
    setPrizeGroups(prev => prev.map(g => g.id === id ? { ...g, ...update } : g))

  const removePrizeGroup = (id: string) =>
    setPrizeGroups(prev => prev.filter(g => g.id !== id))

  const addPrizeGroup = () => {
    const newId = `custom-${Date.now()}`
    setPrizeGroups(prev => [...prev, {
      id: newId,
      suggestedLevel: '',
      levelOverride: '',
      nameCol: null,
      quantityCol: null,
      imageCol: null,
    }])
  }

  // ── Step 3: Build products from rows + mapping ─────────────────────────────

  const buildProducts = (categories: { id: string; name: string }[]) => {
    const catMap = new Map(categories.map(c => [c.name, c.id]))
    const get = (col: string | null) => (row: Record<string, string>) =>
      col ? (row[col] ?? '') : ''

    const isLastOne = (level: string) =>
      /last\s*one/i.test(level) || level.includes('最後賞')

    const products: { info: any; prizes: any[] }[] = []
    const rowErrors: string[] = []

    for (const row of rows) {
      const name = get(fieldMap.name)(row).trim()
      const priceRaw = get(fieldMap.price)(row).trim()
      if (!name || !priceRaw) continue

      const price = toNumber(priceRaw)
      if (price === null) { rowErrors.push(`「${name}」價格無效：${priceRaw}`); continue }

      // Build prizes from mapped prize groups
      const prizes: any[] = []
      for (const g of prizeGroups) {
        const prizeName = get(g.nameCol)(row).trim()
        const qty = toNumber(get(g.quantityCol)(row)) ?? 0
        const img = formatImageUrl(get(g.imageCol)(row))
        const level = g.levelOverride || g.suggestedLevel || '賞'
        if (!prizeName && qty === 0) continue
        prizes.push({
          level,
          name: prizeName || level,
          total: qty,
          remaining: qty,
          probability: 0,
          image_url: img || null,
        })
      }

      const normalPrizes = prizes.filter(p => !isLastOne(p.level))
      const totalCount = normalPrizes.reduce((s, p) => s + p.total, 0)
      if (totalCount <= 0) { rowErrors.push(`「${name}」有效獎項數量為 0`); continue }

      prizes.forEach(p => {
        p.probability = isLastOne(p.level) ? 0 : (p.total / totalCount) * 100
      })

      const displayMenuRaw = get(fieldMap.display_menu)(row).trim()
      const displayMenus = displayMenuRaw ? displayMenuRaw.split(/[|,]/).map(s => s.trim()).filter(Boolean) : []
      const primaryMenuName = displayMenus[0] || null
      const primaryMenuId = primaryMenuName ? (catMap.get(primaryMenuName) ?? null) : null

      const typeRaw = get(fieldMap.type)(row).trim()
      const type = typeRaw ? mapType(typeRaw) : defaultType

      products.push({
        info: {
          product_code: 'PENDING',
          name,
          category: primaryMenuName || '未分類',
          category_id: primaryMenuId,
          type,
          price,
          total_count: totalCount,
          remaining: totalCount,
          status: mapStatus(get(fieldMap.status)(row)),
          is_hot: toBool(get(fieldMap.is_hot)(row)),
          image_url: formatImageUrl(get(fieldMap.image_url)(row)),
          release_year: get(fieldMap.release_date)(row).split(/[-/]/)[0]?.trim() || null,
          release_month: get(fieldMap.release_date)(row).split(/[-/]/)[1]?.trim() || null,
          started_at: parseStartedAt(get(fieldMap.started_at)(row)),
          distributor: get(fieldMap.distributor)(row).trim() || null,
          rarity: toNumber(get(fieldMap.rarity)(row)),
          is_preorder: toBool(get(fieldMap.is_preorder)(row)),
          preorder_available_at: parseStartedAt(get(fieldMap.preorder_available_at)(row)),
        },
        prizes,
      })
    }

    return { products, rowErrors }
  }

  // ── Step 4: Import ─────────────────────────────────────────────────────────

  const handleImport = async () => {
    setStep('importing')
    setProgress(0)
    setErrors([])

    // Fetch categories for menu mapping
    const catRes = await fetch('/api/admin/categories').catch(() => null)
    const categories: { id: string; name: string }[] = catRes?.ok ? await catRes.json() : []

    const { products, rowErrors } = buildProducts(categories)

    if (rowErrors.length) {
      setErrors(rowErrors)
      setStep('mapping')
      return
    }

    if (!products.length) {
      alert('沒有可匯入的資料，請確認欄位映射是否正確。')
      setStep('mapping')
      return
    }

    let ok = 0
    let fail = 0
    const errs: string[] = []

    for (let i = 0; i < products.length; i++) {
      const { info, prizes } = products[i]
      const seed = generateSeed()
      const txidHash = await calculateSeedHash(seed)

      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ product: { ...info, seed, txid_hash: txidHash }, prizes, tagIds: [] }),
      })

      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (data?.product?.id) { ok++ } else { fail++; errs.push(`${info.name}：伺服器回應異常`) }
      } else {
        fail++
        const body = await res.json().catch(() => null)
        errs.push(`${info.name}：${body?.error || res.status}`)
      }

      setProgress(Math.round(((i + 1) / products.length) * 100))
      setCountText(`${i + 1} / ${products.length}`)
    }

    setSuccessCount(ok)
    setFailCount(fail)
    setErrors(errs.slice(0, 10))
    setStep('done')
  }

  // ── Column selector dropdown ───────────────────────────────────────────────

  const ColSelect = ({
    value, onChange, placeholder,
  }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) => (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
    >
      <option value="">{placeholder ?? '— 不映射 —'}</option>
      {headers.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  )

  if (!isOpen) return null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl my-8 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h2 className="font-bold text-neutral-900 text-lg">智能 CSV 匯入</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {step === 'upload'    && '上傳廠商 CSV 檔案'}
              {step === 'mapping'   && `已偵測 ${headers.length} 個欄位，${rows.length} 筆資料 — 確認映射後匯入`}
              {step === 'importing' && `匯入中… ${countText}`}
              {step === 'done'      && `完成：成功 ${successCount} 筆，失敗 ${failCount} 筆`}
            </p>
          </div>
          <button onClick={handleClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step: Upload ── */}
          {step === 'upload' && (
            <div
              className="border-2 border-dashed border-neutral-200 rounded-xl p-12 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <div className="text-4xl mb-3">📂</div>
              <p className="font-semibold text-neutral-700">點擊選擇廠商 CSV 檔案</p>
              <p className="text-sm text-neutral-400 mt-1">支援任意欄位格式，系統自動偵測映射</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* ── Step: Mapping ── */}
          {step === 'mapping' && (
            <>
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">
                  {errors.map((e, i) => <p key={i}>• {e}</p>)}
                </div>
              )}

              {/* Default type selector */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-blue-800 mb-2">預設商品類型</p>
                <p className="text-xs text-blue-600 mb-3">若 CSV 沒有類型欄位，所有商品套用此類型</p>
                <div className="flex gap-2 flex-wrap">
                  {PRODUCT_TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDefaultType(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        defaultType === opt.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product fields */}
              <div>
                <h3 className="text-sm font-bold text-neutral-700 mb-3">商品基本欄位映射</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRODUCT_FIELDS.map(field => {
                    const mapped = fieldMap[field.key]
                    const isOk = !!mapped
                    const isRequired = field.required
                    return (
                      <div key={field.key} className={`rounded-xl border p-3 ${
                        isRequired && !isOk ? 'border-red-200 bg-red-50' :
                        isOk ? 'border-emerald-200 bg-emerald-50' :
                        'border-neutral-100 bg-neutral-50'
                      }`}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-emerald-500' : isRequired ? 'bg-red-400' : 'bg-neutral-300'}`} />
                          <span className="text-xs font-semibold text-neutral-700">
                            {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                          </span>
                          {isOk && <span className="text-xs text-emerald-600 ml-auto">自動偵測</span>}
                        </div>
                        <ColSelect
                          value={mapped}
                          onChange={col => setField(field.key, col)}
                          placeholder={field.required ? '（必填，請選擇）' : '— 略過 —'}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Prize groups */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-neutral-700">
                    獎項欄位映射
                    <span className="ml-2 text-xs font-normal text-neutral-400">已偵測 {prizeGroups.length} 個獎項組</span>
                  </h3>
                  <button
                    onClick={addPrizeGroup}
                    className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    + 手動新增
                  </button>
                </div>

                {prizeGroups.length === 0 && (
                  <div className="border border-dashed border-neutral-200 rounded-xl p-6 text-center text-sm text-neutral-400">
                    未偵測到獎項欄位，請手動新增或確認 CSV 欄位命名（A賞、B賞、款式1、SR 等）
                  </div>
                )}

                <div className="space-y-3">
                  {prizeGroups.map((g, idx) => (
                    <div key={g.id} className="border border-neutral-200 rounded-xl p-4 bg-neutral-50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-neutral-500">獎項 {idx + 1}</span>
                        <input
                          value={g.levelOverride}
                          onChange={e => updatePrizeGroup(g.id, { levelOverride: e.target.value })}
                          placeholder="等級名稱（A賞、SR、款式1…）"
                          className="flex-1 border border-neutral-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                        />
                        <button
                          onClick={() => removePrizeGroup(g.id)}
                          className="text-neutral-400 hover:text-red-500 text-sm px-1.5"
                        >✕</button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-xs text-neutral-500 mb-1">名稱欄</p>
                          <ColSelect value={g.nameCol} onChange={col => updatePrizeGroup(g.id, { nameCol: col })} />
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500 mb-1">數量欄</p>
                          <ColSelect value={g.quantityCol} onChange={col => updatePrizeGroup(g.id, { quantityCol: col })} />
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500 mb-1">圖片欄</p>
                          <ColSelect value={g.imageCol} onChange={col => updatePrizeGroup(g.id, { imageCol: col })} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview: first 2 rows */}
              {rows.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-neutral-700 mb-2">資料預覽（前 2 筆）</h3>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200">
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          {headers.map(h => (
                            <th key={h} className="px-3 py-2 text-left text-neutral-500 font-semibold whitespace-nowrap">
                              {h}
                              {Object.values(fieldMap).includes(h) && (
                                <span className="ml-1 text-emerald-500">✓</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 2).map((row, i) => (
                          <tr key={i} className="border-t border-neutral-100">
                            {headers.map(h => (
                              <td key={h} className="px-3 py-1.5 text-neutral-700 whitespace-nowrap max-w-[140px] truncate">{row[h]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step: Importing ── */}
          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <div className="text-4xl animate-bounce">⏳</div>
              <p className="text-sm font-semibold text-neutral-700">匯入中，請稍候…</p>
              <p className="text-xs text-neutral-400">{countText}</p>
              <div className="w-full bg-neutral-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-neutral-500">{progress}%</p>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && (
            <div className="py-6 space-y-4">
              <div className="text-center">
                <div className="text-5xl mb-3">{failCount === 0 ? '🎉' : '⚠️'}</div>
                <p className="text-lg font-bold text-neutral-900">
                  成功 {successCount} 筆 / 失敗 {failCount} 筆
                </p>
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

          {step === 'mapping' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-400">{rows.length} 筆待匯入</span>
              <button
                onClick={handleImport}
                disabled={!fieldMap.name || !fieldMap.price}
                className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                開始匯入
              </button>
            </div>
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
    </div>
  )
}
