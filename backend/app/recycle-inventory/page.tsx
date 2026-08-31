'use client'

/**
 * 回收品項管理（回收品的實體盤點）
 *
 * 老闆 2026-08-25 從「回收紀錄」拆出來獨立成頁，2026-08-31 兩次改版定案成現在這樣。
 *
 * ## 這頁在回答什麼
 *
 * 「這個賞被回收回來的散件還剩幾件、處理了沒」。跟「回收紀錄」是兩件事：
 * 那邊是逐筆流水（誰、何時、退了多少幣，已完成式），這邊是實體盤點與處置。
 *
 * ## 一列一個品項，勾選批次標記
 *
 * 中間試過「一列一檔商品、展開看品項」，老闆試用後判定難用（多一層點擊，
 * 而實際操作幾乎都是「把這幾個賞一起標掉」）。改回品項平鋪＋勾選批次。
 *
 * ## 處置是「負責方制」（migration 663）
 *
 * 誰的貨誰處理：
 *   吉吉比（`is_platform`）的貨 → 平台處理（重組自製賞／進官方商城／報廢）
 *   第三方廠商的貨              → 廠商自己處理（重組成一檔自製賞）
 *   轉蛋／盒玩                  → 回收後已還回原商品庫存，沒人要處理，這頁不列
 *
 * 狀態只有「待處理／已處理」兩種，操作也只有這兩個。
 * 廠商帳號只看得到也只標得動自己那家 —— 收斂在 API（依 admins.supplier_id），
 * 不是靠前端篩，前端篩掉的資料還是進過瀏覽器。
 */

import { useState, useEffect, useMemo } from 'react'
import { AdminLayout, PageCard, SearchToolbar, StatsCard, DataTable, type Column } from '@/components'
import { ActionMenu, BulkActionBar, BulkButton } from '@/components/ui'
import SelectField from '@/components/ui/SelectField'
import Badge from '@/components/ui/Badge'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { logExport } from '@/lib/logExport'
import { useToast } from '@/contexts/ToastContext'
import { useAdmin } from '@/contexts/AdminContext'
import { productTypeLabel, productTypeVariant, PRODUCT_TYPES } from '@/lib/productTypes'

interface Supplier { id: number; name: string; is_platform?: boolean }

/*
 * 類別篩選。
 *
 * 轉蛋／盒玩**完全不會出現在這一頁**：它們回收後 remaining +1 直接回到原商品、
 * 之後會再被抽走，庫存已經還回去了，沒有任何東西要盤點或處置。
 */
const HANDLED_TYPES = ['ichiban', 'card', 'custom'] as const

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  ...HANDLED_TYPES.map(t => ({ value: t, label: PRODUCT_TYPES[t].label })),
]

const STATUS_FILTER_OPTIONS = [
  { value: 'pending', label: '待處理' },
  { value: 'handled', label: '已處理' },
  { value: 'all',     label: '全部' },
]

/** RPC recycle_inventory_summary 的一列＝一個品項 */
interface PrizeRow {
  id: string
  supplier_id: number | null
  supplier_name: string
  is_platform: boolean
  product_id: number
  product_name: string
  product_type: string
  product_prize_id: number | null
  prize_name: string
  prize_level: string
  unit_price: number
  qty_total: number
  qty_pending: number
  qty_handled: number
  refund_cost: number
  first_recycled_at: string | null
  last_recycled_at: string | null
}

export default function RecycleInventoryPage() {
  const [rows, setRows] = useState<PrizeRow[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [supplierId, setSupplierId] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set())
  const [marking, setMarking] = useState(false)
  const { tableDensity, setTableDensity } = useTablePrefs('recycle-inventory', 'compact', {})
  const { toast } = useToast()
  const { user: adminUser } = useAdmin()
  const isSupplier = adminUser?.role === 'supplier'

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/recycle-inventory')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '載入失敗')
      setRows((json.rows ?? []).map((r: any) => ({
        ...r,
        // 品項可能為 null（早期資料），退回用商品＋賞名組 key
        id: String(r.product_prize_id ?? `${r.product_id}-${r.prize_level}-${r.prize_name}`),
        unit_price: Number(r.unit_price ?? 0),
        qty_total: Number(r.qty_total ?? 0),
        qty_pending: Number(r.qty_pending ?? 0),
        qty_handled: Number(r.qty_handled ?? 0),
        refund_cost: Number(r.refund_cost ?? 0),
      })))

      const list: Supplier[] = json.suppliers ?? []
      setSuppliers(list)
      /*
       * 預設選吉吉比（老闆 2026-08-31）—— 需要動手的貨幾乎都是自家的，
       * 每次進來還要先選一次很煩。廠商帳號只會拿到自己那家。
       */
      setSupplierId(prev => {
        if (prev && list.some(s => String(s.id) === prev)) return prev
        const house = list.find(s => s.is_platform)
        return String((house ?? list[0])?.id ?? '')
      })
    } catch (err: any) {
      toast(err?.message ?? '載入失敗', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (supplierId && String(r.supplier_id) !== supplierId) return false
      if (typeFilter !== 'all' && r.product_type !== typeFilter) return false
      if (statusFilter === 'pending' && r.qty_pending === 0) return false
      if (statusFilter === 'handled' && r.qty_pending > 0) return false
      if (q && !(
        r.product_name.toLowerCase().includes(q) ||
        r.prize_name.toLowerCase().includes(q) ||
        r.prize_level.toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [rows, search, supplierId, typeFilter, statusFilter])

  const pendingQty = filtered.reduce((s, r) => s + r.qty_pending, 0)
  const totalQty   = filtered.reduce((s, r) => s + r.qty_total, 0)

  /*
   * 標記處置。API 以品項為單位整批標，所以批次就是逐個品項打一次。
   * 早期資料沒有 product_prize_id，退回用「商品＋賞等＋品項名」認同一批。
   */
  const mark = async (targets: PrizeRow[], status: 'pending' | 'handled') => {
    if (targets.length === 0) return
    setMarking(true)
    try {
      let updated = 0
      for (const t of targets) {
        const res = await fetch('/api/admin/recycle-inventory', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            t.product_prize_id !== null
              ? { product_prize_id: t.product_prize_id, status }
              : { product_id: t.product_id, prize_level: t.prize_level, prize_name: t.prize_name, status }
          ),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? '標記失敗')
        updated += json.updated ?? 0
      }
      toast(`已將 ${targets.length} 個品項、共 ${updated} 件標為「${status === 'handled' ? '已處理' : '待處理'}」`)
      setSelectedIds(new Set())
      await load()
    } catch (err: any) {
      toast(err?.message ?? '標記失敗', 'error')
    } finally {
      setMarking(false)
    }
  }

  const selectedRows = filtered.filter(r => selectedIds.has(r.id))

  const columns: Column<PrizeRow>[] = [
    {
      /*
       * ⚠️ DataTable 的 td 與內層 span 都有 whitespace-nowrap，
       * 這裡要自己 whitespace-normal 蓋回來，不然 line-clamp 不會斷行。
       */
      key: 'prize', label: '品項名稱', className: 'w-[260px] max-w-[260px]',
      render: r => (
        <div className="whitespace-normal line-clamp-2 font-medium text-neutral-900">{r.prize_name}</div>
      ),
    },
    {
      key: 'product', label: '商品名稱', className: 'w-[260px] max-w-[260px]',
      render: r => (
        <div className="whitespace-normal line-clamp-2 text-neutral-700">{r.product_name}</div>
      ),
    },
    {
      key: 'type', label: '類別', className: 'whitespace-nowrap',
      render: r => <Badge variant={productTypeVariant(r.product_type)}>{productTypeLabel(r.product_type)}</Badge>,
    },
    { key: 'level', label: '賞等', className: 'whitespace-nowrap text-sm text-neutral-700', render: r => r.prize_level },
    {
      key: 'qty', label: '回收總數量', className: 'whitespace-nowrap tabular-nums',
      render: r => <span className="font-bold text-neutral-900">{r.qty_total}</span>,
    },
    {
      key: 'status', label: '狀態', className: 'whitespace-nowrap',
      render: r => (
        <Badge variant={r.qty_pending > 0 ? 'warning' : 'success'}>
          {r.qty_pending > 0 ? '待處理' : '已處理'}
        </Badge>
      ),
    },
    {
      key: 'actions', label: '操作', className: 'w-16 whitespace-nowrap',
      render: r => (
        <ActionMenu
          label="處置"
          items={[
            { label: '標為已處理', onClick: () => mark([r], 'handled'), disabled: marking || r.qty_pending === 0 },
            { label: '退回待處理', onClick: () => mark([r], 'pending'), disabled: marking || r.qty_handled === 0 },
          ]}
        />
      ),
    },
  ]

  const exportCsv = () => {
    if (filtered.length === 0) { toast('目前沒有可匯出的資料', 'error'); return }
    const header = ['廠商', '品項名稱', '商品名稱', '類別', '賞等', '回收總數量', '狀態']
    const lines = filtered.map(r => [
      r.supplier_name, r.prize_name, r.product_name, productTypeLabel(r.product_type),
      r.prize_level, r.qty_total, r.qty_pending > 0 ? '待處理' : '已處理',
    ])
    // 欄位裡有中文品名與逗號，一律加引號並跳脫
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [header, ...lines].map(row => row.map(esc).join(',')).join('\n')
    // BOM：Excel 開 UTF-8 CSV 沒有它會變亂碼
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `回收品項盤點_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    logExport('回收品項盤點', `${filtered.length} 個品項、待處理 ${pendingQty} 件`)
  }

  return (
    <AdminLayout pageTitle="回收品項管理">
      <div className="space-y-4">
        {/* 廠商選擇：在統計小卡上面 —— 它決定下面所有數字算的是哪一家。
            樣式跟結算頁同一套。廠商帳號只有自己那家，不用選 */}
        {!isSupplier && (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-sm text-neutral-500">廠商</span>
            <SelectField
              value={supplierId}
              onChange={e => { setSupplierId(e.target.value); setSelectedIds(new Set()) }}
              className="min-w-[140px] rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20"
            >
              {suppliers.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
              {suppliers.length === 0 && <option value="">載入中…</option>}
            </SelectField>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <StatsCard title="品項數" value={filtered.length} />
          <StatsCard title="待處理件數" value={pendingQty} />
          <StatsCard title="回收總件數" value={totalQty} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋品項、商品、賞等..."
            searchValue={search}
            onSearchChange={setSearch}
            showExportCSV={true}
            onExportCSV={exportCsv}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showFilter={true}
            filterOptions={[
              { key: 'status', label: '狀態', type: 'select', value: statusFilter, onChange: setStatusFilter, options: STATUS_FILTER_OPTIONS },
              { key: 'type',   label: '類別', type: 'select', value: typeFilter,   onChange: setTypeFilter,   options: TYPE_FILTER_OPTIONS },
            ]}
          />

          <DataTable
            data={filtered}
            columns={columns}
            keyField="id"
            density={tableDensity}
            isLoading={loading}
            emptyMessage={statusFilter === 'pending' ? '沒有待處理的回收品項' : '目前沒有回收品項'}
            selectable
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
          />
        </PageCard>
      </div>

      <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} noun="個品項">
        <BulkButton
          primary
          disabled={marking || selectedRows.every(r => r.qty_pending === 0)}
          onClick={() => mark(selectedRows.filter(r => r.qty_pending > 0), 'handled')}
        >
          標為已處理
        </BulkButton>
        <BulkButton
          disabled={marking || selectedRows.every(r => r.qty_handled === 0)}
          onClick={() => mark(selectedRows.filter(r => r.qty_handled > 0), 'pending')}
        >
          退回待處理
        </BulkButton>
      </BulkActionBar>
    </AdminLayout>
  )
}
