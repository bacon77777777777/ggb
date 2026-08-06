'use client'

import { AdminLayout, PageCard } from '@/components'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import InfoDot from '@/components/ui/InfoDot'
import { useToast } from '@/contexts/ToastContext'
import { PRODUCT_IMPORT_FIELDS, PRIZE_IMPORT_FIELDS } from '@/lib/productSchema'

/**
 * 補齊結果
 *
 * 表格要攤平顯示所有欄位（含品項），跟輸出的 CSV 同一個形狀 ——
 * 這樣「畫面上看到的」跟「下載下來的」是同一份東西，不會有落差。
 *
 * 但 26 個商品欄位全部同時攤開沒人看得完，所以預設只顯示最關鍵的幾個，
 * 其餘用欄位開關自己打開。品項則是展開該列時在下方攤出來 ——
 * 每個商品品項數不一樣，硬塞成固定欄位只會出現一堆空格。
 */

interface Row {
  id: number
  row_no: number
  product: Record<string, unknown>
  prizes: Record<string, unknown>[]
  status: 'pending' | 'enriching' | 'done' | 'failed' | 'skipped'
  filled: { key: string; label: string; value: unknown; source: string }[]
  warnings: string[]
  error: string | null
}

interface Job {
  id: number
  filename: string
  product_type: string | null
  status: string
  total_rows: number
  done_rows: number
}

// 殺率不顯示。那個機制的名字本身就不該出現在上架流程裡
const PRODUCT_COLS = PRODUCT_IMPORT_FIELDS.filter(f => !f.key.startsWith('_') && f.key !== 'profit_rate')

/** 預設顯示的欄位。其餘要看的時候自己打開 */
const DEFAULT_VISIBLE = new Set(['name', 'type', 'price', 'total_count', 'barcode', 'distributor'])

const TYPE_LABEL: Record<string, string> = {
  ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋',
  card: '抽卡', custom: '自製賞', slot: '機台',
}

const ROW_STATUS: Record<Row['status'], { text: string; tone: string }> = {
  pending:   { text: '待補齊', tone: 'bg-neutral-100 text-neutral-500' },
  enriching: { text: '補齊中', tone: 'bg-blue-100 text-blue-700' },
  done:      { text: '已補齊', tone: 'bg-green-100 text-green-700' },
  failed:    { text: '失敗',   tone: 'bg-red-100 text-red-700' },
  skipped:   { text: '已匯入', tone: 'bg-neutral-800 text-white' },
}

function cellText(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (key === 'type') return TYPE_LABEL[String(v)] ?? String(v)
  if (key === 'status') return v === 'active' ? '上架' : '待上架'
  if (typeof v === 'boolean') return v ? '是' : '否'
  return String(v)
}

export default function ImportJobDetailPage() {
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [job, setJob] = useState<Job | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [visible, setVisible] = useState<Set<string>>(new Set(DEFAULT_VISIBLE))
  const [showCols, setShowCols] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)

  const load = async () => {
    try {
      const res = await fetch(`/api/admin/import-jobs/${id}/rows`, { credentials: 'include', cache: 'no-store' })
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      if (json.job) setJob(json.job)
      if (Array.isArray(json.rows)) setRows(json.rows)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { if (id) load() }, [id])

  // 還在補齊就持續更新，讓人看得到資料一列一列長出來
  useEffect(() => {
    if (!rows.some(r => r.status === 'pending' || r.status === 'enriching')) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [rows])

  const cols = useMemo(() => PRODUCT_COLS.filter(f => visible.has(f.key)), [visible])
  const selectable = rows.filter(r => r.status !== 'skipped')
  const allSelected = selectable.length > 0 && selectable.every(r => selected.has(r.id))

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectable.map(r => r.id)))
  }
  const toggleOne = (rid: number) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(rid)) n.delete(rid); else n.add(rid)
      return n
    })
  }

  const act = async (path: 'requeue' | 'commit') => {
    if (!selected.size) { toast('沒有選取任何商品', 'error'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/import-jobs/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rowIds: [...selected] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '操作失敗')
      toast(path === 'requeue'
        ? `${json.queued} 筆已排入重新補齊`
        : `匯入完成：成功 ${json.ok} 筆${json.fail ? `，失敗 ${json.fail} 筆` : ''}`)
      setSelected(new Set())
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失敗', 'error')
    } finally {
      setBusy(false)
      setConfirmImport(false)
    }
  }

  const pct = job?.total_rows ? Math.round((job.done_rows / job.total_rows) * 100) : 0

  return (
    <AdminLayout pageTitle={job?.filename ?? '補齊結果'}>
      <div className="space-y-4">
        <PageCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/products/import')}
                className="rounded border border-neutral-200 px-3 py-1.5 text-xs transition-colors hover:bg-neutral-50"
              >
                ← 回工作列表
              </button>
              {job && job.status === 'enriching' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 tabular-nums">
                    補齊中 {job.done_rows} / {job.total_rows}
                  </span>
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">已選 {selected.size} / {selectable.length}</span>
              <Button size="sm" variant="secondary" onClick={() => setShowCols(v => !v)}>欄位</Button>
              <Button size="sm" variant="secondary" onClick={() => act('requeue')} disabled={busy || !selected.size}>
                重新補齊
              </Button>
              <a
                href={`/api/admin/import-jobs/${id}/csv`}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-50"
              >
                下載 CSV
              </a>
              <Button size="sm" onClick={() => setConfirmImport(true)} disabled={busy || !selected.size}>
                匯入商品
              </Button>
            </div>
          </div>

          {showCols && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
              {PRODUCT_COLS.map(f => {
                const on = visible.has(f.key)
                return (
                  <button
                    key={f.key}
                    onClick={() => setVisible(prev => {
                      const n = new Set(prev)
                      if (n.has(f.key)) n.delete(f.key); else n.add(f.key)
                      return n
                    })}
                    className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                      on ? 'border-primary bg-primary text-white' : 'border-neutral-200 bg-white text-neutral-400'
                    }`}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          )}
        </PageCard>

        <PageCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50">
                <tr className="text-left text-xs text-neutral-500">
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4" />
                  </th>
                  <th className="w-12 px-2 py-2.5">列</th>
                  <th className="w-16 px-2 py-2.5">圖</th>
                  {cols.map(f => <th key={f.key} className="whitespace-nowrap px-3 py-2.5">{f.label}</th>)}
                  <th className="whitespace-nowrap px-3 py-2.5">品項</th>
                  <th className="whitespace-nowrap px-3 py-2.5">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {isLoading && (
                  <tr><td colSpan={cols.length + 5} className="px-3 py-10 text-center text-sm text-neutral-400">讀取中…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={cols.length + 5} className="px-3 py-10 text-center text-sm text-neutral-400">沒有資料</td></tr>
                )}
                {rows.map(r => {
                  const st = ROW_STATUS[r.status]
                  const img = r.product.image_url ? String(r.product.image_url) : null
                  const open = expanded.has(r.id)
                  return (
                    <>
                      <tr key={r.id} className="hover:bg-neutral-50/60">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selected.has(r.id)}
                            disabled={r.status === 'skipped'}
                            onChange={() => toggleOne(r.id)}
                          />
                        </td>
                        <td className="px-2 py-2 text-xs tabular-nums text-neutral-400">{r.row_no}</td>
                        <td className="px-2 py-2">
                          {img ? (
                            <Image src={img} alt="" width={40} height={40} unoptimized
                              className="h-10 w-10 rounded object-cover" />
                          ) : (
                            <div className="grid h-10 w-10 place-items-center rounded bg-neutral-100 text-[10px] text-neutral-400">無</div>
                          )}
                        </td>
                        {cols.map(f => (
                          <td key={f.key} className="max-w-[22rem] truncate px-3 py-2" title={cellText(f.key, r.product[f.key])}>
                            {cellText(f.key, r.product[f.key]) || <span className="text-neutral-300">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {r.prizes.length ? (
                            <button onClick={() => setExpanded(p => {
                              const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n
                            })} className="text-xs font-bold text-primary hover:underline">
                              {r.prizes.length} 個 {open ? '▴' : '▾'}
                            </button>
                          ) : <span className="text-xs text-neutral-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.tone}`}>{st.text}</span>
                          {r.error && <div className="mt-0.5 max-w-[16rem] truncate text-[11px] text-red-500" title={r.error}>{r.error}</div>}
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${r.id}-prizes`} className="bg-neutral-50/60">
                          <td colSpan={cols.length + 5} className="px-6 py-3">
                            {/* 品項每個商品數量不一樣，硬塞成固定欄位只會出現一堆空格，
                                所以展開時另外攤一張小表 */}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-neutral-400">
                                  <th className="w-12 py-1">圖</th>
                                  {PRIZE_IMPORT_FIELDS.filter(f => f.key !== 'image_url').map(f => (
                                    <th key={f.key} className="py-1 pr-4">{f.label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {r.prizes.map((z, i) => (
                                  <tr key={i} className="border-t border-neutral-100">
                                    <td className="py-1.5">
                                      {z.image_url ? (
                                        <Image src={String(z.image_url)} alt="" width={32} height={32} unoptimized
                                          className="h-8 w-8 rounded object-cover" />
                                      ) : (
                                        <div className="grid h-8 w-8 place-items-center rounded bg-neutral-200 text-[9px] text-neutral-400">無</div>
                                      )}
                                    </td>
                                    {PRIZE_IMPORT_FIELDS.filter(f => f.key !== 'image_url').map(f => (
                                      <td key={f.key} className="py-1.5 pr-4 text-neutral-700">
                                        {String(z[f.key] ?? '') || <span className="text-neutral-300">—</span>}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {r.filled.length > 0 && (
                              <p className="mt-2 text-[11px] text-neutral-400">
                                系統補了：{r.filled.map(f => `${f.label}（${f.source}）`).join('、')}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </PageCard>
      </div>

      <ConfirmDialog
        isOpen={confirmImport}
        onClose={() => setConfirmImport(false)}
        onConfirm={() => act('commit')}
        title={`匯入 ${selected.size} 個商品？`}
        message="會依現在畫面上的資料建立商品與品項，狀態是待上架，不會直接開賣。匯入過的列會標成「已匯入」，不能重複匯入。"
        confirmText="匯入"
        type="warning"
      />
    </AdminLayout>
  )
}
