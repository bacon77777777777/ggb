'use client'

import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/Button'
import SelectField from '@/components/ui/SelectField'
import { useToast } from '@/contexts/ToastContext'

/**
 * 批量上架
 *
 * 拿「已經是我們標準格式」的檔案直接建立商品 —— 通常就是「商品補齊」頁
 * 下載下來的那份 CSV。所以這裡不做補齊、不查網路，解析完就寫進資料表。
 *
 * 廠商在這一步才問：補齊階段跟哪一家供貨無關，但真的要建立商品時
 * supplier_id 是必填的。
 */

interface Supplier { id: number; name: string }

export default function BulkImportModal({
  isOpen, onClose, onImported,
}: { isOpen: boolean; onClose: () => void; onImported: () => void }) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setResult(null)
    fetch('/api/admin/suppliers', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setSuppliers(d) }).catch(() => {})
  }, [isOpen])

  const run = async (file: File) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('supplierId', supplierId)

      const res = await fetch('/api/admin/products/bulk-import', {
        method: 'POST', body: fd, credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '上架失敗')
      setResult({ ok: json.ok ?? 0, fail: json.fail ?? 0 })
      if (json.ok > 0) onImported()
    } catch (e) {
      toast(e instanceof Error ? e.message : '上架失敗', 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="批量上架">
      <div className="space-y-4">
        {result ? (
          <div className="py-6 text-center">
            <p className="text-sm font-bold text-green-600">成功上架 {result.ok} 個商品</p>
            {result.fail > 0 && <p className="mt-1 text-sm text-red-500">{result.fail} 筆失敗</p>}
            <p className="mt-2 text-xs text-neutral-400">商品狀態為待上架，確認後再開賣。</p>
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500">
                廠商 <span className="text-red-500">*</span>
              </label>
              <SelectField value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">請選擇廠商</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </SelectField>
              <p className="mt-1 text-xs text-neutral-400">
                整批商品都會歸到這家廠商底下。檔案裡猜不出來，所以是必填。
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) run(f) }}
            />
            <button
              onClick={() => supplierId ? fileRef.current?.click() : toast('請先選擇廠商', 'error')}
              disabled={busy || !supplierId}
              className={`w-full rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                !supplierId ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60'
                : 'cursor-pointer border-neutral-300 hover:border-primary hover:bg-neutral-50'
              }`}
            >
              <p className="text-sm text-neutral-600">
                {busy ? '上架中…' : supplierId ? '點擊選擇檔案' : '請先選擇廠商'}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                支援 .xlsx / .xls / .csv，需為本站的標準格式
              </p>
            </button>

            <p className="text-xs text-neutral-400">
              廠商給的原始清單請改用「商品補齊」，那裡會轉成標準格式並補齊圖片與款式。
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>{result ? '關閉' : '取消'}</Button>
        </div>
      </div>
    </Modal>
  )
}
