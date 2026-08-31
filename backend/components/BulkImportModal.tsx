'use client'

import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/Button'
import SelectField from '@/components/ui/SelectField'
import { useToast } from '@/contexts/ToastContext'

/**
 * 批量新增
 *
 * ⚠️ 這支是「一次建立很多筆商品」，不是「把已存在的商品切成上架狀態」——
 * 後者是商品管理勾選後浮出的那顆「批量上架」。兩個名字一樣過，
 * 老闆 2026-08-31 指定把這支改叫批量新增。
 *
 * ## 為什麼圖片壓縮檔收在這裡
 *
 * 圖片本來是工具列上另一顆「上傳圖片」，跟這個彈窗是兩個分開的動作。
 * 但一份 CSV 跟一包圖**本來就是同一次交付**，分開之後：
 *   ① 使用者要自己記得先傳圖再傳表
 *   ② 圖存進全站共用的 `products/<原檔名>`，A 廠商的 1.jpg 被 B 廠商蓋掉
 *   ③ CSV 寫 `1.jpg` 時我們根本不知道他指的是哪一批的 1.jpg
 * 收成一個動作之後，那包圖存進 `products/vendor/<廠商>/<批次>/`，
 * CSV 的檔名只在自己那批裡查（見 lib/vendorImageResolve.ts）。
 *
 * 圖片是選填 —— 「商品補齊」頁下載的 CSV 圖片欄位本來就是完整網址。
 *
 * 兩個檔案分兩個請求送：zip 可能很大，跟 CSV 併成同一個 request
 * 會一起撞到 body 上限，而且失敗時分不出是哪一個爆的。
 */

interface Supplier { id: number; name: string }

interface ImportResult {
  ok: number
  fail: number
  skipped?: number
  prizeImagesDropped?: number
  imageErrors?: { row?: number; name: string; error: string }[]
}

/** 虛線上傳框。選好檔案就把檔名留在框裡，不然使用者不知道到底選到沒 */
function DropBox({ label, hint, accept, file, disabled, onPick, onClear }: {
  label: string
  hint: string
  accept: string
  file: File | null
  disabled?: boolean
  onPick: (f: File) => void
  onClear: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-800">{file.name}</p>
            <p className="mt-0.5 text-xs text-neutral-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
          <button
            onClick={onClear}
            disabled={disabled}
            className="shrink-0 text-xs text-neutral-400 transition-colors hover:text-red-500 disabled:opacity-40"
          >
            移除
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          disabled={disabled}
          className={`w-full rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            disabled
              ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60'
              : 'cursor-pointer border-neutral-300 hover:border-primary hover:bg-neutral-50'
          }`}
        >
          <p className="text-sm font-medium text-neutral-600">{label}</p>
          <p className="mt-1 text-xs text-neutral-400">{hint}</p>
        </button>
      )}
    </div>
  )
}

export default function BulkImportModal({
  isOpen, onClose, onImported,
}: { isOpen: boolean; onClose: () => void; onImported: () => void }) {
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [dataFile, setDataFile] = useState<File | null>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setResult(null)
    setDataFile(null)
    setZipFile(null)
    setStep('')
    fetch('/api/admin/suppliers', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setSuppliers(d) }).catch(() => {})
  }, [isOpen])

  const run = async () => {
    if (!supplierId) { toast('請先選擇廠商', 'error'); return }
    if (!dataFile) { toast('請選擇商品資料檔', 'error'); return }

    setBusy(true)
    try {
      // ① 圖片先傳，CSV 解檔名時才找得到
      let batch: string | null = null
      if (zipFile) {
        setStep('上傳圖片中…')
        const fd = new FormData()
        fd.append('zip', zipFile)
        fd.append('supplierId', supplierId)
        const res = await fetch('/api/admin/products/upload-images', {
          method: 'POST', body: fd, credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '圖片上傳失敗')
        batch = json.batch
        if (json.failed > 0) toast(`有 ${json.failed} 張圖沒傳成功`, 'error')
        if (json.duplicateBasenames?.length) {
          toast(`壓縮檔裡有同名檔（${json.duplicateBasenames.slice(0, 3).join('、')}），資料檔請連資料夾一起寫`, 'error')
        }
      }

      // ② 再送商品資料
      setStep('建立商品中…')
      const fd = new FormData()
      fd.append('file', dataFile)
      fd.append('supplierId', supplierId)
      if (batch) fd.append('batch', batch)
      const res = await fetch('/api/admin/products/bulk-import', {
        method: 'POST', body: fd, credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '新增失敗')
      setResult({
        ok: json.ok ?? 0,
        fail: json.fail ?? 0,
        skipped: json.skipped ?? 0,
        prizeImagesDropped: json.prizeImagesDropped ?? 0,
        imageErrors: json.imageErrors ?? [],
      })
      if ((json.ok ?? 0) > 0) onImported()
    } catch (e) {
      toast(e instanceof Error ? e.message : '新增失敗', 'error')
    } finally {
      setBusy(false)
      setStep('')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="批量新增">
      <div className="space-y-4">
        {result ? (
          <div className="space-y-3 py-4">
            <div className="text-center">
              <p className="text-sm font-bold text-green-600">成功新增 {result.ok} 個商品</p>
              {result.fail > 0 && <p className="mt-1 text-sm text-red-500">{result.fail} 筆寫入失敗</p>}
              {!!result.skipped && (
                <p className="mt-1 text-sm text-amber-600">{result.skipped} 筆因為主圖對不回圖庫被略過</p>
              )}
              {!!result.prizeImagesDropped && (
                <p className="mt-1 text-xs text-amber-600">{result.prizeImagesDropped} 張品項圖對不上，已留空</p>
              )}
              <p className="mt-2 text-xs text-neutral-400">商品狀態為待上架，確認後再開賣。</p>
            </div>
            {!!result.imageErrors?.length && (
              <div className="max-h-40 overflow-y-auto rounded-lg bg-neutral-50 p-3">
                {result.imageErrors.map((e, i) => (
                  <p key={i} className="text-xs text-neutral-600">
                    <span className="text-neutral-400">第 {e.row} 列</span> {e.name}：{e.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500">
                廠商 <span className="text-red-500">*</span>
              </label>
              <SelectField value={supplierId} onChange={e => setSupplierId(e.target.value)} disabled={busy}>
                <option value="">請選擇廠商</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </SelectField>
              <p className="mt-1 text-xs text-neutral-400">
                整批商品與圖片都會歸到這家廠商底下。檔案裡猜不出來，所以是必填。
              </p>
            </div>

            <DropBox
              label={supplierId ? '商品資料檔（必填）' : '請先選擇廠商'}
              hint="支援 .xlsx / .xls / .csv，需為本站的標準格式"
              accept=".xlsx,.xls,.csv"
              file={dataFile}
              disabled={busy || !supplierId}
              onPick={setDataFile}
              onClear={() => setDataFile(null)}
            />

            <DropBox
              label="商品圖片壓縮檔（選填）"
              hint="一次最多 800 張。資料檔的圖片欄位寫壓縮檔裡的檔名即可"
              accept=".zip"
              file={zipFile}
              disabled={busy || !supplierId}
              onPick={setZipFile}
              onClear={() => setZipFile(null)}
            />

            {/* 範本用 type=all：一份檔案裡把六個類別的範例都列出來，
                廠商的清單本來就可能混著一番賞與扭蛋，給單一類別的範本會填不下去。
                機台那一列由後端依身份決定給不給（平台自營才看得到） */}
            <div className="rounded-xl bg-neutral-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-neutral-700">沒有標準格式的檔案？</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    下載範本照著填，裡面每個類別都附了一列範例。
                  </p>
                </div>
                <a
                  href="/api/admin/products/import/template?type=all"
                  className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm transition-colors hover:bg-neutral-50"
                >
                  下載範本
                </a>
              </div>
            </div>

            <p className="text-xs text-neutral-400">
              圖片欄位已經是完整網址（例如「商品補齊」下載的檔案）就不用附壓縮檔。
              廠商給的原始清單請改用「商品補齊」，那裡會轉成標準格式並補齊圖片與款式。
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
              <Button variant="primary" onClick={run} isLoading={busy} disabled={!supplierId || !dataFile}>
                {busy ? step || '處理中…' : '開始新增'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
