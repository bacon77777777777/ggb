'use client'

/**
 * 智能批量上架
 *
 * 取代原本的兩支 wizard：
 *   CsvImportWizard   —— 4 步（上傳→逐欄確認映射→匯入→完成），而且 setIsBulkOpen(true)
 *                        從來沒被呼叫過，整整 642 行打不開
 *   XlsxImportWizard  —— 5 步，預覽階段要一個一個點「AI 補全」
 *
 * 這支只有三步，而且中間那步不需要操作就能按下一步：
 *   上傳（選廠商 + 丟檔案）→ 確認（系統已經解析並補齊）→ 上架
 *
 * 設計上的取捨：
 * - 缺料不擋上架。缺圖用預設圖、缺價用同系列推定，上架後在列表補即可。
 *   會擋的只有「沒有品項」和「沒有商品名稱」—— 那兩個補不出來也不該猜。
 * - 廠商在上傳時選一次、套用整批。廠商是必填而且猜不出來，
 *   但現實上一次匯入就是一家廠商的 list，所以問一次就夠。
 * - 系統動過的手腳要看得見。每一筆都列出「補了什麼、從哪來」，
 *   而不是靜悄悄填好讓人以為是廠商給的。
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import Modal from './Modal'
import Button from './ui/Button'
import SelectField from './ui/SelectField'
import Badge from './ui/Badge'
import { useToast } from '@/contexts/ToastContext'
import { PRODUCT_TYPES } from '@/lib/productSchema'

type Step = 'upload' | 'review' | 'done'

interface FilledInfo { key: string; label: string; value: unknown; source: string }

interface ParsedRow {
  row: number
  product: Record<string, any>
  prizes: Record<string, any>[]
  missing: string[]
  filled: FilledInfo[]
  warnings: string[]
  needsTranslation: string[]
  selected?: boolean
}

interface ParseResult {
  fingerprint: string
  mappingSource: 'profile' | 'rules'
  mapping: Record<string, string | null>
  stats: {
    total: number; ready: number; needsAttention: number
    mappedFields: number; totalFields: number; autoFilled: number; noPrize: number
    missingImages: number; knownImages: number; needsTranslation: number
  }
  products: ParsedRow[]
}

interface Supplier { id: number; name: string }

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

const TYPE_LABEL = Object.fromEntries(PRODUCT_TYPES.map(t => [t.value, t.label]))

export default function SmartImportWizard({ isOpen, onClose, onImported }: Props) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [parsing, setParsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [committing, setCommitting] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translated, setTranslated] = useState<{ count: number; costUsd: number } | null>(null)
  const [outcome, setOutcome] = useState<{ ok: number; fail: number; results: any[] } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/admin/suppliers', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setSuppliers(d) })
      .catch(() => {})
  }, [isOpen])

  const reset = useCallback(() => {
    setStep('upload'); setResult(null); setRows([]); setOutcome(null)
    setExpanded(new Set()); setParsing(false); setCommitting(false)
    setTranslating(false); setTranslated(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const handleClose = () => { reset(); onClose() }

  // ── 解析 ──
  const parseFile = async (file: File) => {
    if (!supplierId) { toast('請先選擇廠商', 'error'); return }
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('supplierId', supplierId)

      const res = await fetch('/api/admin/products/import/parse', {
        method: 'POST', body: fd, credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '解析失敗')

      const data = json as ParseResult
      setResult(data)
      // 全選。沒品項的也選 —— 它們會以「待上架」建立，不會卡住整批匯入
      setRows(data.products.map(p => ({ ...p, selected: true })))
      setStep('review')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : '解析失敗', 'error')
    } finally {
      setParsing(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) parseFile(f)
  }

  // ── 上架 ──
  const commit = async () => {
    const chosen = rows.filter(r => r.selected)
    if (!chosen.length) { toast('沒有選取任何商品', 'error'); return }

    setCommitting(true)
    try {
      const res = await fetch('/api/admin/products/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          products: chosen.map(r => ({ row: r.row, product: r.product, prizes: r.prizes })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '上架失敗')

      setOutcome(json)
      setStep('done')
      if (json.ok > 0) onImported()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : '上架失敗', 'error')
    } finally {
      setCommitting(false)
    }
  }

  /**
   * 日文名稱翻譯 —— 整個流程裡唯一要錢的動作，所以做成按鈕而不是自動執行，
   * 而且按鈕上直接寫預估金額。整批一次送出（不是逐筆），成本差五倍。
   */
  const translate = async () => {
    const names = [...new Set(rows.flatMap(r => r.needsTranslation))]
    if (!names.length) return
    setTranslating(true)
    try {
      const res = await fetch('/api/admin/products/import/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ names }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '翻譯失敗')

      const map: Record<string, string> = json.translations ?? {}
      const n = Object.keys(map).length
      if (n === 0) { toast('沒有需要更動的名稱'); return }

      setRows(prev => prev.map(r => {
        const product = { ...r.product }
        if (typeof product.name === 'string' && map[product.name]) product.name = map[product.name]
        const prizes = r.prizes.map(pz =>
          typeof pz.name === 'string' && map[pz.name] ? { ...pz, name: map[pz.name] } : pz)
        return { ...r, product, prizes, needsTranslation: [] }
      }))
      setTranslated({ count: n, costUsd: json.usage?.costUsd ?? 0 })
      toast(`已翻譯 ${n} 個名稱`)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : '翻譯失敗', 'error')
    } finally {
      setTranslating(false)
    }
  }

  const toggleRow = (row: number) =>
    setRows(prev => prev.map(r => r.row === row ? { ...r, selected: !r.selected } : r))
  const toggleAll = () => {
    const allOn = rows.every(r => r.selected)
    setRows(prev => prev.map(r => ({ ...r, selected: !allOn })))
  }
  const toggleExpand = (row: number) =>
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(row)) n.delete(row); else n.add(row)
      return n
    })

  const selectedCount = rows.filter(r => r.selected).length

  const title =
    step === 'upload' ? '智能批量上架'
    : step === 'review' ? `已解析 ${result?.stats.total ?? 0} 筆商品`
    : `完成：成功 ${outcome?.ok ?? 0} 筆${outcome?.fail ? `，失敗 ${outcome.fail} 筆` : ''}`

  const footer =
    step === 'upload' ? (
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={handleClose}>取消</Button>
      </div>
    ) : step === 'review' ? (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-500">
          已選 {selectedCount} / {rows.length} 筆
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reset}>重新上傳</Button>
          <Button onClick={commit} isLoading={committing} disabled={selectedCount === 0}>
            上架 {selectedCount} 個商品
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={reset}>再匯入一批</Button>
        <Button onClick={handleClose}>關閉</Button>
      </div>
    )

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} footer={footer} size="xl">
      {/* ── 步驟 1：上傳 ── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1.5">
              廠商 <span className="text-red-500">*</span>
            </label>
            <SelectField value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">請選擇廠商</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
            <p className="mt-1 text-xs text-neutral-400">
              整批商品都會歸到這家廠商底下。廠商是必填欄位，檔案裡猜不出來。
            </p>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => supplierId ? fileRef.current?.click() : toast('請先選擇廠商', 'error')}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              !supplierId ? 'border-neutral-200 bg-neutral-50 cursor-not-allowed opacity-60'
              : dragOver ? 'border-primary bg-primary/5 cursor-pointer'
              : 'border-neutral-300 hover:border-primary hover:bg-neutral-50 cursor-pointer'
            }`}
          >
            {parsing ? (
              <p className="text-sm text-neutral-600">解析中…</p>
            ) : (
              <>
                <p className="text-sm font-medium text-neutral-700">
                  把廠商的商品 list 拖到這裡，或點擊選擇
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  支援 .xlsx / .xls / .csv，格式不用改，系統會自動對應欄位
                </p>
              </>
            )}
          </div>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }}
          />

          <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
            <p className="text-xs font-semibold text-neutral-600 mb-1.5">
              廠商想照我們的格式填？下載標準範本
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRODUCT_TYPES.map(t => (
                <a
                  key={t.value}
                  href={`/api/admin/products/import/template?type=${t.value}`}
                  className="px-2.5 py-1 text-xs text-neutral-700 bg-white border border-neutral-200 rounded-md hover:border-primary hover:text-primary transition-colors"
                >
                  {t.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 步驟 2：確認 ── */}
      {step === 'review' && result && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: '共解析', value: result.stats.total, tone: 'text-neutral-900' },
              { label: '可直接上架', value: result.stats.ready, tone: 'text-green-600' },
              { label: '待補品項', value: result.stats.noPrize, tone: result.stats.noPrize ? 'text-amber-600' : 'text-neutral-400' },
              { label: '自動補齊', value: `${result.stats.autoFilled} 處`, tone: 'text-blue-600' },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                <p className="text-[11px] text-neutral-400">{s.label}</p>
                <p className={`text-lg font-bold ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {(result.stats.needsTranslation > 0 || result.stats.missingImages > 0) && (
            <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
              {result.stats.needsTranslation > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-amber-800">
                    {result.stats.needsTranslation} 個名稱含日文。英文不會動
                    （MASTERLISE 這類官方產品線名稱翻掉就搜不到了）。
                  </p>
                  <Button size="sm" variant="outline" onClick={translate} isLoading={translating}>
                    翻成台灣繁中（約 US${(0.0004 + result.stats.needsTranslation * 0.00012).toFixed(3)}）
                  </Button>
                </div>
              )}
              {translated && (
                <p className="text-xs text-green-700">
                  已翻譯 {translated.count} 個名稱，實際花費 US${translated.costUsd}
                </p>
              )}
              {result.stats.missingImages > 0 && (
                <p className="text-xs text-amber-800">
                  {result.stats.missingImages} 個商品的圖片檔名在圖庫裡找不到
                  （目前圖庫有 {result.stats.knownImages} 張）。
                  先用商品頁的「上傳圖片」丟圖片壓縮檔，再重新匯入就會自動對上。
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-neutral-500">
            欄位對應：
            {result.mappingSource === 'profile'
              ? '沿用這家廠商上次的格式（沒有重新猜，也沒有呼叫 AI）'
              : `規則自動比對，命中 ${result.stats.mappedFields} / ${result.stats.totalFields} 個欄位`}
          </p>

          <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
            <input
              type="checkbox" id="sel-all"
              checked={rows.length > 0 && rows.every(r => r.selected)}
              onChange={toggleAll}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            <label htmlFor="sel-all" className="text-xs text-neutral-600 cursor-pointer">全選</label>
          </div>

          <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
            {rows.map(r => {
              // 沒品項不是錯誤，是廠商 list 常態。標示出來，但照樣讓它上架
              const noPrize = r.prizes.length === 0
              return (
                <div
                  key={r.row}
                  className={`rounded-lg border px-3 py-2 transition-colors ${
                    noPrize ? 'border-amber-200 bg-amber-50/40' : 'border-neutral-200 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox" checked={!!r.selected}
                      onChange={() => toggleRow(r.row)}
                      className="mt-1 w-4 h-4 accent-primary cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-neutral-800 truncate max-w-[26rem]">
                          {r.product.name || '(未命名)'}
                        </span>
                        <Badge variant="info" size="sm">{TYPE_LABEL[r.product.type] ?? r.product.type}</Badge>
                        {r.filled.length > 0 && (
                          <Badge variant="primary" size="sm">自動補 {r.filled.length}</Badge>
                        )}
                        {noPrize && <Badge variant="warning" size="sm">待補品項 · 以待上架建立</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {r.product.price ? `${r.product.price} 代幣` : '未定價'}
                        {' · '}{r.prizes.length} 個品項
                        {r.product.total_count ? ` · ${r.product.total_count} 籤` : ''}
                      </p>
                      {(r.filled.length > 0 || r.warnings.length > 0) && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(r.row)}
                          className="mt-1 text-[11px] text-neutral-400 hover:text-primary transition-colors"
                        >
                          {expanded.has(r.row) ? '收合明細' : '看系統補了什麼'}
                        </button>
                      )}
                      {expanded.has(r.row) && (
                        <div className="mt-1.5 space-y-0.5 rounded-md bg-neutral-50 px-2.5 py-2">
                          {r.filled.map((f, i) => (
                            <p key={i} className="text-[11px] text-neutral-600">
                              <span className="text-blue-600">補</span>{' '}
                              {f.label} = <span className="font-medium">{String(f.value)}</span>
                              <span className="text-neutral-400">（{f.source}）</span>
                            </p>
                          ))}
                          {r.warnings.map((w, i) => (
                            <p key={`w${i}`} className="text-[11px] text-amber-600">注意 {w}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 步驟 3：完成 ── */}
      {step === 'done' && outcome && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-xs text-green-700">上架成功</p>
              <p className="text-2xl font-bold text-green-700">{outcome.ok}</p>
            </div>
            <div className={`rounded-lg border px-4 py-3 ${outcome.fail ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-neutral-50'}`}>
              <p className={`text-xs ${outcome.fail ? 'text-red-700' : 'text-neutral-400'}`}>失敗</p>
              <p className={`text-2xl font-bold ${outcome.fail ? 'text-red-700' : 'text-neutral-400'}`}>{outcome.fail}</p>
            </div>
          </div>

          {outcome.fail > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-neutral-200 divide-y divide-neutral-100">
              {outcome.results.filter((x: any) => !x.ok).map((x: any, i: number) => (
                <div key={i} className="px-3 py-2">
                  <p className="text-xs font-medium text-neutral-700">
                    {x.row ? `第 ${x.row} 列 · ` : ''}{x.name}
                  </p>
                  <p className="text-[11px] text-red-600">{x.error}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-neutral-700">全部上架成功</p>
              <p className="mt-1 text-xs text-neutral-400">可以到商品列表確認內容與圖片</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
