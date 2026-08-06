'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminLayout, PageCard, DataTable, type Column } from '@/components'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import SelectField from '@/components/ui/SelectField'
import ConfirmDialog from '@/components/ConfirmDialog'
import InfoDot from '@/components/ui/InfoDot'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'

/**
 * 商品補齊
 *
 * 這頁的定位是「格式轉換 + 資料補齊」，不是匯入器：
 * 丟任何廠商格式的 list 進來，輸出我們的標準格式。
 * 完成後可以下載 CSV（原封不動餵回手動批量匯入），或直接匯入商品。
 *
 * 補齊在背景由 cron 分批跑，上傳完人就可以走 —— 33 筆商品要爬網站查款式，
 * 3~4 分鐘跑不掉，不該把人綁在一個開著的視窗上（原本的 modal 就是這樣，
 * 關掉分頁全部白做）。
 */

interface Job {
  id: number
  filename: string
  supplier_id: number | null
  product_type: string | null
  status: 'parsing' | 'enriching' | 'done' | 'failed' | 'cancelled'
  total_rows: number
  done_rows: number
  error: string | null
  created_at: string
  suppliers?: { name: string } | null
}

interface Supplier { id: number; name: string }

const TYPE_LABEL: Record<string, string> = {
  ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋',
  card: '抽卡', custom: '自製賞', slot: '機台',
}

const STATUS_LABEL: Record<Job['status'], { text: string; tone: string }> = {
  parsing:   { text: '解析中', tone: 'text-neutral-500' },
  enriching: { text: '補齊中', tone: 'text-blue-600' },
  done:      { text: '完成',   tone: 'text-green-600' },
  failed:    { text: '失敗',   tone: 'text-red-600' },
  cancelled: { text: '已取消', tone: 'text-neutral-400' },
}

export default function ImportJobsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [type, setType] = useState('')
  const [uploading, setUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/import-jobs', { credentials: 'include', cache: 'no-store' })
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      if (Array.isArray(json)) setJobs(json)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    fetch('/api/admin/suppliers', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setSuppliers(d) }).catch(() => {})
  }, [])

  // 補齊中的工作要看得到進度在動。沒有進行中的工作就不要一直打 API
  useEffect(() => {
    if (!jobs.some(j => j.status === 'enriching' || j.status === 'parsing')) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [jobs])

  const upload = async (file: File) => {
    if (!supplierId) { toast('請先選擇廠商', 'error'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('supplierId', supplierId)
      if (type) fd.append('type', type)

      const res = await fetch('/api/admin/import-jobs/upload', {
        method: 'POST', body: fd, credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '上傳失敗')
      toast(`已解析 ${json.total} 筆，補齊在背景進行中`)
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : '上傳失敗', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/admin/import-jobs?id=${deleteTarget.id}`, {
        method: 'DELETE', credentials: 'include',
      })
      if (!res.ok) throw new Error((await res.json()).error || '刪除失敗')
      toast('已刪除')
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : '刪除失敗', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const columns: Column<any>[] = [
    {
      key: 'file', label: '檔案', className: 'font-medium text-neutral-900',
      render: j => (
        <Link href={`/products/import/${j.id}`} className="hover:text-primary hover:underline">
          {j.filename}
        </Link>
      ),
    },
    { key: 'supplier', label: '廠商', render: j => <>{j.suppliers?.name ?? '—'}</> },
    { key: 'type', label: '類型', render: j => <>{j.product_type ? TYPE_LABEL[j.product_type] ?? j.product_type : '依內容判斷'}</> },
    { key: 'rows', label: '筆數', className: 'tabular-nums', render: j => <>{j.total_rows}</> },
    {
      key: 'status', label: '狀態',
      render: j => {
        const s = STATUS_LABEL[j.status as Job['status']] ?? STATUS_LABEL.enriching
        const pct = j.total_rows ? Math.round((j.done_rows / j.total_rows) * 100) : 0
        return (
          <div className="min-w-[9rem]">
            <div className={`text-xs font-bold ${s.tone}`}>
              {s.text}
              {j.status === 'enriching' && <span className="ml-1 tabular-nums text-neutral-400">{j.done_rows}/{j.total_rows}</span>}
            </div>
            {j.status === 'enriching' && (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
            {j.error && <div className="mt-0.5 text-[11px] text-red-500">{j.error}</div>}
          </div>
        )
      },
    },
    { key: 'created', label: '建立時間', className: 'text-neutral-500 text-xs', render: j => <>{formatDateTime(j.created_at)}</> },
    {
      key: 'actions', label: '操作',
      render: j => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => router.push(`/products/import/${j.id}`)}
            className="rounded border border-neutral-200 px-3 py-1 text-xs transition-colors hover:bg-neutral-50"
          >
            查看
          </button>
          {/* 未完成的兩顆先不給按：資料還在變，下載或匯入到一半的東西沒有意義 */}
          <a
            href={`/api/admin/import-jobs/${j.id}/csv`}
            className={`rounded border px-3 py-1 text-xs transition-colors ${
              j.status === 'done'
                ? 'border-neutral-200 hover:bg-neutral-50'
                : 'pointer-events-none border-neutral-100 text-neutral-300'
            }`}
          >
            下載 CSV
          </a>
          <button
            onClick={() => router.push(`/products/import/${j.id}`)}
            disabled={j.status !== 'done'}
            className="rounded border border-primary px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/5 disabled:border-neutral-100 disabled:text-neutral-300"
          >
            匯入商品
          </button>
          <button
            onClick={() => setDeleteTarget(j)}
            className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 transition-colors hover:bg-red-50"
          >
            刪除
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="商品補齊">
      <div className="space-y-4">
        <PageCard>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-neutral-900">
            上傳廠商清單
            <InfoDot>
              丟任何格式的廠商 list 進來，系統會對好欄位、查回商品資料與圖片、
              把名稱翻成台灣用語，輸出成我們的標準格式。
              補齊在背景跑，上傳完就可以離開這一頁，晚點回來看結果。
            </InfoDot>
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500">
                廠商 <span className="text-red-500">*</span>
              </label>
              <SelectField value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">請選擇廠商</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </SelectField>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500">商品類型</label>
              <SelectField value={type} onChange={e => setType(e.target.value)}>
                <option value="">依檔案內容判斷</option>
                <option value="gacha">整批都是轉蛋</option>
                <option value="ichiban">整批都是一番賞</option>
                <option value="blindbox">整批都是盒玩</option>
                <option value="card">整批都是抽卡</option>
                <option value="custom">整批都是自製賞</option>
              </SelectField>
            </div>
            <div className="flex items-end">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
              />
              <Button
                className="w-full"
                onClick={() => supplierId ? fileRef.current?.click() : toast('請先選擇廠商', 'error')}
                isLoading={uploading}
              >
                選擇檔案並開始
              </Button>
            </div>
          </div>

          <p className="mt-2 text-xs text-neutral-400">
            支援 .xlsx / .xls / .csv。廠商的進貨單通常沒有類型欄，一份檔案就是一種類型 ——
            不指定的話會全部當成一番賞。
          </p>
        </PageCard>

        <PageCard>
          <h2 className="mb-3 text-sm font-black text-neutral-900">補齊工作</h2>
          <DataTable
            columns={columns}
            data={jobs}
            keyField="id"
            isLoading={isLoading}
            emptyMessage="還沒有任何工作，上傳一份廠商清單開始"
          />
        </PageCard>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="刪除這筆工作？"
        message={`「${deleteTarget?.filename}」與底下 ${deleteTarget?.total_rows ?? 0} 筆補齊結果都會刪掉。已經匯入的商品不受影響。`}
        confirmText="刪除"
        type="danger"
      />
    </AdminLayout>
  )
}
