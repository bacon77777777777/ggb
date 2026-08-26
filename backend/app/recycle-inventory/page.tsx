'use client'

/**
 * 回收商品管理（品項庫存）
 *
 * 老闆 2026-08-25 指定從「回收紀錄」拆出來獨立成頁。
 *
 * 回答的是「這件商品的這個賞，還有幾件卡在那裡」—— 廠商要把回收品重組成
 * 自製賞時唯一需要的數字。跟「回收紀錄」是兩件事：那邊是逐筆流水（誰、何時、
 * 退了多少幣），這邊是實體盤點。
 *
 * ⚠️ 實體一律在廠商倉庫，平台不持有貨。這裡列的是已解除歸屬、且回不去原商品的貨：
 * 轉蛋／盒玩回收後 remaining +1 直接回到原商品、之後會再被抽走，不需要另外處理，
 * 所以預設不列入（池子裡有一半以上是這種，直接拿池子的數字會錯一半）。
 */

import { useState, useEffect, useMemo } from 'react'
import { AdminLayout, PageCard, SearchToolbar, StatsCard, DataTable, type Column } from '@/components'
import Badge, { type BadgeVariant } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { formatDateTime } from '@/utils/dateFormat'
import { logExport } from '@/lib/logExport'
import { useToast } from '@/contexts/ToastContext'
import { productTypeLabel, productTypeVariant, PRODUCT_TYPES } from '@/lib/productTypes'

const PRODUCT_TYPE_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  gacha:    { label: '轉蛋',   variant: 'info' },
  blindbox: { label: '盒玩',   variant: 'primary' },
  ichiban:  { label: '一番賞', variant: 'warning' },
  card:     { label: '抽卡',   variant: 'success' },
  custom:   { label: '自製賞', variant: 'default' },
}

interface Supplier { id: number; name: string }

interface InventoryRow {
  id: string
  supplier_id: number | null
  supplier_name: string
  product_id: number
  product_name: string
  product_type: string
  product_prize_id: number | null
  prize_name: string
  prize_level: string
  unit_price: number
  qty_pending: number
  qty_reused: number
  qty_scrapped: number
  refund_cost: number
  restocked: boolean
  first_recycled_at: string | null
  last_recycled_at: string | null
}

export default function RecycleInventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [includeRestocked, setIncludeRestocked] = useState(false)
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const { tableDensity, setTableDensity } = useTablePrefs('recycle-inventory', 'compact', {})
  const { toast } = useToast()

  const load = async (restocked: boolean) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/dismantled?view=inventory${restocked ? '&include_restocked=1' : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '載入失敗')
      setRows((json.rows ?? []).map((r: any) => ({
        ...r,
        // DataTable 要 id；品項可能為 null（早期資料），退回用商品+賞名組 key
        id: String(r.product_prize_id ?? `${r.product_id}-${r.prize_level}-${r.prize_name}`),
        unit_price: Number(r.unit_price ?? 0),
        qty_pending: Number(r.qty_pending ?? 0),
        qty_reused: Number(r.qty_reused ?? 0),
        qty_scrapped: Number(r.qty_scrapped ?? 0),
        refund_cost: Number(r.refund_cost ?? 0),
      })))
      if (json.suppliers) setSuppliers(json.suppliers)
    } catch (err: any) {
      toast(err?.message ?? '載入失敗', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(false)
  }, [])

  const filtered = useMemo(() => rows.filter(r => {
    if (supplierFilter !== 'all' && String(r.supplier_id) !== supplierFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !r.product_name.toLowerCase().includes(q) &&
        !r.prize_name.toLowerCase().includes(q) &&
        !r.prize_level.toLowerCase().includes(q) &&
        !r.supplier_name.toLowerCase().includes(q)
      ) return false
    }
    return true
  }), [rows, search, supplierFilter])

  const totalQty = filtered.reduce((s, r) => s + r.qty_pending, 0)
  const totalCost = filtered.reduce((s, r) => s + r.refund_cost, 0)

  const columns: Column<InventoryRow>[] = [
    {
      key: 'product', label: '商品 / 品項',
      render: r => (
        <div>
          <div className="font-medium text-neutral-900">{r.prize_level} · {r.prize_name}</div>
          <div className="mt-0.5 text-xs text-neutral-400">{r.product_name}</div>
        </div>
      ),
    },
    {
      key: 'type', label: '類別', className: 'whitespace-nowrap',
      render: r => {
        return (
          <div className="flex items-center gap-1.5">
            <Badge variant={productTypeVariant(r.product_type)}>{productTypeLabel(r.product_type)}</Badge>
            {r.restocked && <span className="text-[11px] text-neutral-400">已回原商品</span>}
          </div>
        )
      },
    },
    { key: 'supplier', label: '廠商', className: 'whitespace-nowrap text-sm text-neutral-700', render: r => r.supplier_name },
    { key: 'qty', label: '在庫件數', className: 'whitespace-nowrap tabular-nums', render: r => <span className="font-bold text-neutral-900">{r.qty_pending}</span> },
    {
      key: 'handled', label: '已處置', className: 'whitespace-nowrap tabular-nums text-xs text-neutral-500',
      render: r => (r.qty_reused + r.qty_scrapped > 0 ? `再利用 ${r.qty_reused} · 報廢 ${r.qty_scrapped}` : '—'),
    },
    { key: 'unit_price', label: '抽獎單價', className: 'whitespace-nowrap tabular-nums text-sm text-neutral-500', render: r => (r.unit_price ? r.unit_price.toLocaleString() : '—') },
    { key: 'cost', label: '退幣成本(G)', className: 'whitespace-nowrap tabular-nums font-medium text-primary', render: r => r.refund_cost.toLocaleString() },
    { key: 'last', label: '最近回收', className: 'whitespace-nowrap text-xs text-neutral-400', render: r => (r.last_recycled_at ? formatDateTime(r.last_recycled_at) : '—') },
  ]

  const exportCsv = () => {
    const header = ['廠商', '商品', '賞等', '品項', '類別', '抽獎單價', '在庫件數', '已再利用', '已報廢', '退幣成本(G)', '最早回收', '最近回收']
    const lines = filtered.map(r => [
      r.supplier_name, r.product_name, r.prize_level, r.prize_name,
      productTypeLabel(r.product_type),
      r.unit_price, r.qty_pending, r.qty_reused, r.qty_scrapped, r.refund_cost,
      r.first_recycled_at ? formatDateTime(r.first_recycled_at) : '',
      r.last_recycled_at ? formatDateTime(r.last_recycled_at) : '',
    ])
    // 欄位裡有中文品名與逗號，一律加引號並跳脫
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [header, ...lines].map(row => row.map(esc).join(',')).join('\n')
    // BOM：Excel 開 UTF-8 CSV 沒有它會變亂碼
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `回收商品庫存_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    logExport('回收商品庫存', `${filtered.length} 個品項、${totalQty} 件`)
  }

  return (
    <AdminLayout pageTitle="回收商品管理">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatsCard title="品項數" value={filtered.length} />
          <StatsCard title="在庫件數" value={totalQty} />
          <StatsCard title="退幣成本" value={totalCost} unit="G" />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋商品、品項、賞等、廠商..."
            searchValue={search}
            onSearchChange={setSearch}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showFilter={true}
            filterOptions={[
              {
                key: 'supplier',
                label: '廠商',
                type: 'select',
                value: supplierFilter,
                onChange: setSupplierFilter,
                options: [
                  { value: 'all', label: '全部廠商' },
                  ...suppliers.map(s => ({ value: String(s.id), label: s.name })),
                ],
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-3 px-1 pb-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={includeRestocked}
                onChange={e => { setIncludeRestocked(e.target.checked); load(e.target.checked) }}
                className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-primary focus:ring-primary"
              />
              一併顯示轉蛋／盒玩（已回原商品，不需處理）
            </label>
            <div className="ml-auto">
              <Button size="sm" variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
                匯出 CSV
              </Button>
            </div>
          </div>

          <DataTable
            data={filtered}
            columns={columns}
            keyField="id"
            density={tableDensity}
            isLoading={loading}
            emptyMessage="目前沒有回收品庫存"
          />
        </PageCard>
      </div>
    </AdminLayout>
  )
}
