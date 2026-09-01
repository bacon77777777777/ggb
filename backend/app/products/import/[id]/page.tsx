'use client'

import { AdminLayout, PageCard, SearchToolbar } from '@/components'
import DataTable, { type Column } from '@/components/DataTable'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import Badge, { type BadgeVariant } from '@/components/ui/Badge'
import Modal from '@/components/Modal'
import SelectField from '@/components/ui/SelectField'
import { useToast } from '@/contexts/ToastContext'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { PRODUCT_IMPORT_FIELDS, PRIZE_IMPORT_FIELDS } from '@/lib/productSchema'

/**
 * 補齊結果
 *
 * 表格要攤平顯示所有欄位（含品項），跟輸出的 CSV 同一個形狀 ——
 * 這樣「畫面上看到的」跟「下載下來的」是同一份東西，不會有落差。
 *
 * 但 26 個商品欄位全部同時攤開沒人看得完，所以預設只顯示最關鍵的幾個，
 * 其餘用工具列的欄位開關自己打開（開關狀態存在 useTablePrefs，下次進來還在）。
 * 品項則是展開該列時在下方攤出來 —— 每個商品品項數不一樣，
 * 硬塞成固定欄位只會出現一堆空格。
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
const PRIZE_COLS = PRIZE_IMPORT_FIELDS.filter(f => f.key !== 'image_url')

/** 預設打開的欄位。其餘要看的時候自己從工具列開 */
const DEFAULT_VISIBLE = ['name', 'type', 'price', 'total_count', 'barcode', 'distributor']

const DEFAULT_COLUMNS: Record<string, boolean> = {
  row_no: true,
  image: true,
  ...Object.fromEntries(PRODUCT_COLS.map(f => [f.key, DEFAULT_VISIBLE.includes(f.key)])),
  prizes: true,
  rowStatus: true,
}

const TYPE_LABEL: Record<string, string> = {
  ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋',
  card: '抽卡', custom: '自製賞', slot: '機台',
}

const ROW_STATUS: Record<Row['status'], { text: string; variant: BadgeVariant }> = {
  pending:   { text: '待補齊', variant: 'default' },
  enriching: { text: '補齊中', variant: 'info' },
  done:      { text: '已補齊', variant: 'success' },
  failed:    { text: '失敗',   variant: 'danger' },
  skipped:   { text: '已匯入', variant: 'primary' },
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
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [job, setJob] = useState<Job | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number | string>>(new Set())
  const [expanded, setExpanded] = useState<Set<number | string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)
  // 廠商在匯入這一步才問 —— 補齊跟哪一家供貨無關，但建立商品時是必填
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [supplierId, setSupplierId] = useState('')

  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } =
    useTablePrefs('import-job-rows', 'compact', DEFAULT_COLUMNS)

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

  useEffect(() => {
    fetch('/api/admin/suppliers', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setSuppliers(d) }).catch(() => {})
  }, [])

  /*
   * 開著這一頁時由前端推進補齊：跑完一輪就再打一次，直到沒有待處理的列。
   *
   * cron 只是沒人看著時的後備 —— pg_cron 排的是打正式站的網址，
   * 本機與 STG 沒有 pg_cron，只靠它的話工作永遠停在 0/33（實測就是這樣）。
   * 兩邊同時跑不會重複處理，撈到的列會先被標成 enriching。
   *
   * **一輪跑完才發下一輪**。原本用 setInterval(3 秒)，它不管前一輪有沒有
   * 回來就照發，而一輪要十幾秒 —— 於是同時有十幾個請求在飛，每個各領走
   * 6 列標成 enriching，畫面整片都是「補齊中」，中斷的那些還會變成孤兒。
   */
  useEffect(() => {
    if (job?.status !== 'enriching') return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>

    const loop = async () => {
      try {
        await fetch(`/api/admin/import-jobs/${id}/run`, { method: 'POST', credentials: 'include' })
      } catch { /* 單輪失敗不該中斷，下一輪再試 */ }
      if (stopped) return
      await load()
      if (stopped) return
      // 一輪之間留 1 秒，讓資料庫的進度觸發器跟上，也避免空轉時打太兇
      timer = setTimeout(loop, 1000)
    }
    loop()
    return () => { stopped = true; clearTimeout(timer) }
  }, [job?.status, id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      Object.values(r.product).some(v => String(v ?? '').toLowerCase().includes(q)) ||
      r.prizes.some(z => String(z.name ?? '').toLowerCase().includes(q))
    )
  }, [rows, search])

  // 已匯入的不能再匯一次，全選時要跳過
  const isSelectable = (r: Row) => r.status !== 'skipped'

  const columns: Column<Row>[] = useMemo(() => [
    {
      key: 'row_no', label: '列', className: 'w-12',
      render: (r) => <span className="text-xs tabular-nums text-neutral-400">{r.row_no}</span>,
    },
    {
      key: 'image', label: '圖', className: 'w-16',
      render: (r) => r.product.image_url ? (
        <Image src={String(r.product.image_url)} alt="" width={40} height={40} unoptimized
          className="h-10 w-10 rounded object-contain" />
      ) : (
        <div className="grid h-10 w-10 place-items-center rounded bg-neutral-100 text-[10px] text-neutral-400">無</div>
      ),
    },
    ...PRODUCT_COLS.map<Column<Row>>(f => ({
      key: f.key,
      label: f.label,
      render: (r) => {
        const text = cellText(f.key, r.product[f.key])
        return text
          ? <span className="block max-w-[22rem] truncate" title={text}>{text}</span>
          : <span className="text-neutral-300">—</span>
      },
    })),
    {
      // 整列點下去就會展開（DataTable 的行為），這裡只當指示燈。
      // 再掛一顆自己 toggle 的按鈕會連動兩次，按了等於沒反應
      key: 'prizes', label: '品項',
      render: (r) => r.prizes.length ? (
        <span className="text-xs font-bold text-primary">
          {r.prizes.length} 個 {expanded.has(r.id) ? '▴' : '▾'}
        </span>
      ) : <span className="text-xs text-neutral-300">—</span>,
    },
    {
      key: 'rowStatus', label: '狀態',
      render: (r) => (
        <>
          <Badge variant={ROW_STATUS[r.status].variant}>{ROW_STATUS[r.status].text}</Badge>
          {r.error && (
            <div className="mt-0.5 max-w-[16rem] truncate text-[11px] text-red-500" title={r.error}>{r.error}</div>
          )}
        </>
      ),
    },
  ], [expanded])

  /** 展開該列時攤出品項。每個商品品項數不一樣，塞成固定欄位只會出現一堆空格 */
  const renderPrizes = (r: Row) => (
    <div>
      {r.prizes.length === 0 ? (
        <p className="text-xs text-neutral-400">這一列還沒有品項</p>
      ) : (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-neutral-400">
            <th className="w-12 py-1">圖</th>
            {PRIZE_COLS.map(f => <th key={f.key} className="py-1 pr-4">{f.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {r.prizes.map((z, i) => (
            <tr key={i} className="border-t border-neutral-100">
              <td className="py-1.5">
                {z.image_url ? (
                  <Image src={String(z.image_url)} alt="" width={32} height={32} unoptimized
                    className="h-8 w-8 rounded object-contain" />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded bg-neutral-200 text-[9px] text-neutral-400">無</div>
                )}
              </td>
              {PRIZE_COLS.map(f => (
                <td key={f.key} className="py-1.5 pr-4 text-neutral-700">
                  {String(z[f.key] ?? '') || <span className="text-neutral-300">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      )}
      {r.filled.length > 0 && (
        <p className="mt-2 text-[11px] text-neutral-400">
          系統補了：{r.filled.map(f => `${f.label}（${f.source}）`).join('、')}
        </p>
      )}
    </div>
  )

  const act = async (path: 'requeue' | 'commit') => {
    if (busy) return
    if (!selected.size) { toast('沒有選取任何商品', 'error'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/import-jobs/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rowIds: [...selected], supplierId: supplierId || undefined }),
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
      <div className="space-y-6">
        <PageCard>
          {job?.status === 'enriching' && (
            <div className="mb-4 flex items-center gap-3">
              <span className="text-xs font-bold text-blue-600 tabular-nums">
                補齊中 {job.done_rows} / {job.total_rows}
              </span>
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          <SearchToolbar
            searchPlaceholder="搜尋商品名稱、條碼、品項..."
            searchValue={search}
            onSearchChange={setSearch}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showColumnToggle={true}
            columns={[
              { key: 'row_no', label: '列', visible: visibleColumns.row_no },
              { key: 'image', label: '圖', visible: visibleColumns.image },
              ...PRODUCT_COLS.map(f => ({ key: f.key, label: f.label, visible: visibleColumns[f.key] })),
              { key: 'prizes', label: '品項', visible: visibleColumns.prizes },
              { key: 'rowStatus', label: '狀態', visible: visibleColumns.rowStatus },
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
            showExportCSV={true}
            onExportCSV={() => { window.location.href = `/api/admin/import-jobs/${id}/csv` }}
            selectedCount={selected.size}
            onClearSelection={() => setSelected(new Set())}
            batchActions={[
              { label: '重新補齊', variant: 'secondary', onClick: () => act('requeue') },
              { label: '匯入商品', variant: 'primary', onClick: () => setConfirmImport(true) },
            ]}
          />

          <DataTable<Row>
            data={filtered}
            columns={columns}
            keyField="id"
            isLoading={isLoading}
            emptyMessage={search ? '沒有符合的商品' : '沒有資料'}
            density={tableDensity}
            visibleColumns={visibleColumns}
            selectable
            selectedIds={selected}
            onSelectChange={setSelected}
            isSelectable={isSelectable}
            expandable
            expandedIds={expanded}
            onExpandChange={setExpanded}
            renderExpanded={renderPrizes}
          />
        </PageCard>
      </div>

      <Modal isOpen={confirmImport} onClose={() => setConfirmImport(false)} title={`匯入 ${selected.size} 個商品`}>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-500">
              廠商 <span className="text-red-500">*</span>
            </label>
            <SelectField value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">請選擇廠商</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
            <p className="mt-1 text-xs text-neutral-400">
              整批商品都會歸到這家廠商底下。補齊階段不需要指定，建立商品時才是必填。
            </p>
          </div>
          <p className="text-sm text-neutral-500">
            會依現在畫面上的資料建立商品與品項，狀態是待上架，不會直接開賣。
            匯入過的列會標成「已匯入」，不能重複匯入。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmImport(false)}>取消</Button>
            <Button onClick={() => act('commit')} isLoading={busy} disabled={!supplierId}>匯入</Button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}
