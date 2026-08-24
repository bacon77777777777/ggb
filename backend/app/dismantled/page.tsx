'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, CopyableID, Modal } from '@/components'
import Badge, { type BadgeVariant } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Textarea from '@/components/ui/Textarea'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'
import { useState, useMemo, useEffect } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { TableEmpty } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/TableSkeleton'

const PRODUCT_TYPE_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  gacha:     { label: '轉蛋',   variant: 'info' },
  blindbox:  { label: '盒玩',   variant: 'primary' },
  ichiban:   { label: '一番賞', variant: 'warning' },
  card:      { label: '抽卡',   variant: 'success' },
  custom:    { label: '自製賞', variant: 'default' },
}

/*
 * 回收品處置狀態（migration 617）。
 *
 * 為什麼要有這個：一番賞／自製賞的一般賞被回收後，實體留在平台手上、玩家只拿到退幣。
 * 那件實體有沒有真的變成收入（重組自製賞、進官方商城），決定了退幣比例能給多高。
 * 在這欄位出現之前，回收池躺著一千多筆、沒有任何人知道那些貨去哪了。
 */
type RecycleStatus = 'pending' | 'reused' | 'scrapped'

const STATUS_LABELS: Record<RecycleStatus, { label: string; variant: BadgeVariant }> = {
  pending:  { label: '待處理',   variant: 'warning' },
  reused:   { label: '已再利用', variant: 'success' },
  scrapped: { label: '已報廢',   variant: 'default' },
}

interface DismantledItem {
  id: string
  pool_id: number | null
  created_at: string
  product_name: string
  product_type: string
  prize_name: string
  prize_level: string
  recycle_value: number
  status: RecycleStatus
  handled_at: string | null
  handled_by: string | null
  handled_note: string | null
  supplier_id: number | null
  supplier_name: string
  user_name: string
  user_id: string
}

interface Supplier {
  id: number
  name: string
}

const COLUMNS = [
  { key: 'date',          label: '日期' },
  { key: 'prize',         label: '品項' },
  { key: 'product_type',  label: '類型' },
  { key: 'supplier',      label: '廠商' },
  { key: 'recycle_value', label: '退幣(G)' },
  { key: 'status',        label: '處置' },
  { key: 'user',          label: '會員' },
  { key: 'uuid',          label: 'UUID' },
]

export default function DismantledPage() {
  const [items, setItems] = useState<DismantledItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [markTarget, setMarkTarget] = useState<RecycleStatus | null>(null)
  const [markNote, setMarkNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const { tableDensity, setTableDensity } = useTablePrefs('dismantled', 'compact', {})
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    Object.fromEntries(COLUMNS.map(c => [c.key, true]))
  )

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/dismantled')
      const json = await res.json()
      setItems(json.items ?? [])
      setSuppliers(json.suppliers ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const submitMark = async () => {
    if (!markTarget || selectedIds.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/dismantled', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_ids: selectedIds,
          status: markTarget,
          note: markNote.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '標記失敗')
      toast(`已標記 ${json.updated} 件為「${STATUS_LABELS[markTarget].label}」`)
      setMarkTarget(null)
      setMarkNote('')
      setSelectedIds([])
      await load()
    } catch (err: any) {
      toast(err?.message ?? '標記失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact':     return 'py-2 px-2'
      case 'normal':      return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (supplierFilter !== 'all' && String(item.supplier_id) !== supplierFilter) return false
      if (typeFilter !== 'all' && item.product_type !== typeFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !item.prize_name.toLowerCase().includes(q) &&
          !item.product_name.toLowerCase().includes(q) &&
          !item.user_name.toLowerCase().includes(q) &&
          !item.user_id.toLowerCase().includes(q) &&
          !item.supplier_name.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [items, searchQuery, supplierFilter, typeFilter, statusFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any, bv: any
      switch (sortField) {
        case 'created_at':    av = a.created_at;    bv = b.created_at;    break
        case 'prize_name':    av = a.prize_name;    bv = b.prize_name;    break
        case 'supplier':      av = a.supplier_name; bv = b.supplier_name; break
        case 'recycle_value': av = a.recycle_value; bv = b.recycle_value; break
        case 'status':        av = a.status;        bv = b.status;        break
        case 'user':          av = a.user_name;     bv = b.user_name;     break
        default:              av = a.created_at;    bv = b.created_at
      }
      if (typeof av === 'string') return sortDirection === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDirection === 'asc' ? av - bv : bv - av
    })
  }, [filtered, sortField, sortDirection])

  const show = (key: string) => visibleColumns[key] !== false
  const dc = getDensityClasses()

  const totalTokens = filtered.reduce((sum, i) => sum + i.recycle_value, 0)
  const countBy = (st: RecycleStatus) => filtered.filter(i => i.status === st).length

  // 只有真的寫進回收池的那筆才標得動（早期資料可能沒有對應 pool 列）
  const selectableIds = sorted.filter(i => i.pool_id !== null).map(i => i.pool_id as number)
  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length
  const toggleAll = () => setSelectedIds(allSelected ? [] : selectableIds)
  const toggleOne = (poolId: number) =>
    setSelectedIds(prev => prev.includes(poolId) ? prev.filter(v => v !== poolId) : [...prev, poolId])

  const supplierFilterOptions = [
    { value: 'all', label: '全部廠商' },
    ...suppliers.map(s => ({ value: String(s.id), label: s.name })),
  ]

  const typeFilterOptions = [
    { value: 'all', label: '全部類型' },
    ...Object.entries(PRODUCT_TYPE_LABELS).map(([v, { label }]) => ({ value: v, label })),
  ]

  const statusFilterOptions = [
    { value: 'all', label: '全部狀態' },
    ...Object.entries(STATUS_LABELS).map(([v, { label }]) => ({ value: v, label })),
  ]

  return (
    <AdminLayout pageTitle="回收池 / 回收品管理">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard title="總回收數量" value={filtered.length} />
          <StatsCard title="總退還代幣" value={totalTokens} unit="G" />
          <StatsCard title="待處理" value={countBy('pending')} />
          <StatsCard title="已再利用" value={countBy('reused')} />
          <StatsCard title="已報廢" value={countBy('scrapped')} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋品項、商品、會員、廠商..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
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
                options: supplierFilterOptions,
              },
              {
                key: 'type',
                label: '商品類型',
                type: 'select',
                value: typeFilter,
                onChange: setTypeFilter,
                options: typeFilterOptions,
              },
              {
                key: 'status',
                label: '處置狀態',
                type: 'select',
                value: statusFilter,
                onChange: setStatusFilter,
                options: statusFilterOptions,
              },
            ]}
            showColumnToggle={true}
            columns={COLUMNS.map(c => ({ key: c.key, label: c.label, visible: visibleColumns[c.key] }))}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
          />

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 mb-2 bg-primary/5 border border-primary/20 rounded-lg">
              <span className="text-sm font-medium text-neutral-700">已選取 {selectedIds.length} 件</span>
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button size="sm" variant="primary"   onClick={() => setMarkTarget('reused')}>標記已再利用</Button>
                <Button size="sm" variant="secondary" onClick={() => setMarkTarget('scrapped')}>標記已報廢</Button>
                <Button size="sm" variant="ghost"     onClick={() => setMarkTarget('pending')}>退回待處理</Button>
                <Button size="sm" variant="ghost"     onClick={() => setSelectedIds([])}>取消選取</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className={`${dc} w-10`}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={selectableIds.length === 0}
                      className="w-4 h-4 rounded border-neutral-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed"
                      aria-label="全選"
                    />
                  </th>
                  {show('date')          && <SortableTableHeader sortKey="created_at"    currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>日期</SortableTableHeader>}
                  {show('prize')         && <SortableTableHeader sortKey="prize_name"    currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>品項</SortableTableHeader>}
                  {show('product_type')  && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>類型</th>}
                  {show('supplier')      && <SortableTableHeader sortKey="supplier"      currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>廠商</SortableTableHeader>}
                  {show('recycle_value') && <SortableTableHeader sortKey="recycle_value" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>退幣(G)</SortableTableHeader>}
                  {show('status')        && <SortableTableHeader sortKey="status"        currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>處置</SortableTableHeader>}
                  {show('user')          && <SortableTableHeader sortKey="user"          currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>會員</SortableTableHeader>}
                  {show('uuid')          && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>UUID</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <TableSkeleton rows={6} cols={COLUMNS.length + 1} />
                ) : sorted.length === 0 ? (
                  <TableEmpty colSpan={COLUMNS.length + 1} />
                ) : (
                  sorted.map(item => {
                    const typeInfo = PRODUCT_TYPE_LABELS[item.product_type]
                    return (
                      <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                        <td className={`${dc}`}>
                          <input
                            type="checkbox"
                            checked={item.pool_id !== null && selectedIds.includes(item.pool_id)}
                            onChange={() => item.pool_id !== null && toggleOne(item.pool_id)}
                            disabled={item.pool_id === null}
                            className="w-4 h-4 rounded border-neutral-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed"
                            aria-label={`選取 ${item.prize_name}`}
                          />
                        </td>
                        {show('date') && (
                          <td className={`${dc} text-neutral-500 whitespace-nowrap text-xs`}>
                            {formatDateTime(item.created_at)}
                          </td>
                        )}
                        {show('prize') && (
                          <td className={`${dc}`}>
                            <div className="font-medium text-neutral-900">{item.prize_name}</div>
                            <div className="text-xs text-neutral-400 mt-0.5">{item.product_name}</div>
                          </td>
                        )}
                        {show('product_type') && (
                          <td className={`${dc} whitespace-nowrap`}>
                            {typeInfo
                              ? <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                              : <span className="text-xs text-neutral-400">{item.product_type || '—'}</span>
                            }
                          </td>
                        )}
                        {show('supplier') && (
                          <td className={`${dc} text-neutral-700 whitespace-nowrap text-sm`}>
                            {item.supplier_name}
                          </td>
                        )}
                        {show('recycle_value') && (
                          <td className={`${dc} whitespace-nowrap tabular-nums font-medium ${item.recycle_value > 0 ? 'text-primary' : 'text-neutral-400'}`}>
                            {item.recycle_value > 0 ? `+${item.recycle_value}` : '—'}
                          </td>
                        )}
                        {show('status') && (
                          <td className={`${dc} whitespace-nowrap`}>
                            <Badge variant={STATUS_LABELS[item.status].variant}>{STATUS_LABELS[item.status].label}</Badge>
                            {item.status !== 'pending' && (
                              <div className="text-[11px] text-neutral-400 mt-0.5">
                                {item.handled_by ?? '—'}
                                {item.handled_at ? ` · ${formatDateTime(item.handled_at)}` : ''}
                                {item.handled_note ? ` · ${item.handled_note}` : ''}
                              </div>
                            )}
                          </td>
                        )}
                        {show('user') && (
                          <td className={`${dc} text-neutral-900 whitespace-nowrap`}>
                            {item.user_name}
                          </td>
                        )}
                        {show('uuid') && (
                          <td className={`${dc}`}>
                            <CopyableID id={item.user_id} />
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      </div>

      <Modal
        isOpen={markTarget !== null}
        onClose={() => { setMarkTarget(null); setMarkNote('') }}
        title={markTarget ? `標記為「${STATUS_LABELS[markTarget].label}」` : ''}
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            共 {selectedIds.length} 件回收品。
            {markTarget === 'pending'
              ? '退回待處理會一併清掉原本的經手人與備註。'
              : '這筆紀錄之後是決定回收退幣比例的依據，請把去向寫清楚。'}
          </p>
          {markTarget !== 'pending' && (
            <Textarea
              label="處置備註"
              placeholder={markTarget === 'reused' ? '例：併入 8 月自製賞 #124' : '例：外盒破損無法再售'}
              value={markNote}
              onChange={e => setMarkNote(e.target.value)}
              rows={3}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setMarkTarget(null); setMarkNote('') }}>取消</Button>
            <Button variant="primary" onClick={submitMark} isLoading={saving}>確認標記</Button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}
