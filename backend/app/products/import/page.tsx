'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminLayout, PageCard, DataTable, type Column } from '@/components'
import { CardSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
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

  useEffect(() => { load() }, [])

  /*
   * 開著這一頁時順便推進補齊，不用進內頁也會跑。
   * cron 只是沒人看著時的後備：pg_cron 排的是打正式站，
   * 本機與 STG 沒有 pg_cron，只靠它工作永遠不會動。
   */
  useEffect(() => {
    const active = jobs.filter(j => j.status === 'enriching')
    if (!active.length) return
    let stopped = false
    const tick = async () => {
      // 一次只推一個工作，避免同時開好幾個把外部網站打爆
      try {
        await fetch(`/api/admin/import-jobs/${active[0].id}/run`, { method: 'POST', credentials: 'include' })
      } catch { /* 單輪失敗不該中斷 */ }
      if (!stopped) await load()
    }
    tick()
    const t = setInterval(tick, 3000)
    return () => { stopped = true; clearInterval(t) }
  }, [jobs])

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)

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
    {
      key: 'type', label: '類別',
      // 補齊前沒人知道是什麼類別（廠商的清單通常沒有類型欄），補完才由
      // 商品頁判斷出來。全部同一類就顯示那一類，混著就是「綜合」
      render: j => {
        const types: string[] = j.resolved_types ?? []
        if (!types.length) return <span className="text-neutral-400">判斷中</span>
        if (types.length > 1) return <>綜合</>
        return <>{TYPE_LABEL[types[0]] ?? types[0]}</>
      },
    },
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
      {/* 版面照廠商管理那頁：說明在左、主要動作在右，底下一張無內距的表格卡 */}
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-500">
            丟任何格式的廠商清單進來，系統會對好欄位、查回商品資料與圖片、把名稱與款式翻成台灣用語。
            補齊在背景跑，上傳完就可以離開這一頁。
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
            </svg>
            {uploading ? '上傳中…' : '上傳廠商清單'}
          </button>
        </div>

        <PageCard noPadding>
          {isLoading ? (
            <CardSkeleton rows={5} />
          ) : jobs.length === 0 ? (
            <EmptyState message="還沒有任何工作，點擊「上傳廠商清單」開始" />
          ) : (
            <div className="overflow-x-auto">
              <DataTable data={jobs} columns={columns} keyField="id" />
            </div>
          )}
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
