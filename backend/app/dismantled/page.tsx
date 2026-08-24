'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, CopyableID } from '@/components'
import Badge from '@/components/ui/Badge'
import { formatDateTime } from '@/utils/dateFormat'
import { useState, useMemo, useEffect } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { TableEmpty } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/TableSkeleton'

const PRODUCT_TYPE_LABELS: Record<string, { label: string; color: 'gray' | 'blue' | 'purple' | 'amber' | 'green' | 'red' }> = {
  gacha:     { label: '轉蛋', color: 'blue' },
  blindbox:  { label: '盒玩', color: 'purple' },
  ichiban:   { label: '一番賞', color: 'amber' },
  card:      { label: '抽卡', color: 'green' },
  custom:    { label: '自製賞', color: 'gray' },
}

interface DismantledItem {
  id: string
  created_at: string
  product_name: string
  product_type: string
  prize_name: string
  prize_level: string
  recycle_value: number
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
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const { tableDensity, setTableDensity } = useTablePrefs('dismantled', 'compact', {})
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    Object.fromEntries(COLUMNS.map(c => [c.key, true]))
  )

  useEffect(() => {
    const fetch_ = async () => {
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
    fetch_()
  }, [])

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
  }, [items, searchQuery, supplierFilter, typeFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any, bv: any
      switch (sortField) {
        case 'created_at':    av = a.created_at;    bv = b.created_at;    break
        case 'prize_name':    av = a.prize_name;    bv = b.prize_name;    break
        case 'supplier':      av = a.supplier_name; bv = b.supplier_name; break
        case 'recycle_value': av = a.recycle_value; bv = b.recycle_value; break
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

  const supplierFilterOptions = [
    { value: 'all', label: '全部廠商' },
    ...suppliers.map(s => ({ value: String(s.id), label: s.name })),
  ]

  const typeFilterOptions = [
    { value: 'all', label: '全部類型' },
    ...Object.entries(PRODUCT_TYPE_LABELS).map(([v, { label }]) => ({ value: v, label })),
  ]

  return (
    <AdminLayout pageTitle="回收池 / 回收品管理">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="總回收數量" value={filtered.length} />
          <StatsCard title="總退還代幣" value={totalTokens} unit="G" />
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
            ]}
            showColumnToggle={true}
            columns={COLUMNS.map(c => ({ key: c.key, label: c.label, visible: visibleColumns[c.key] }))}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
          />

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {show('date')          && <SortableTableHeader sortKey="created_at"    currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>日期</SortableTableHeader>}
                  {show('prize')         && <SortableTableHeader sortKey="prize_name"    currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>品項</SortableTableHeader>}
                  {show('product_type')  && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>類型</th>}
                  {show('supplier')      && <SortableTableHeader sortKey="supplier"      currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>廠商</SortableTableHeader>}
                  {show('recycle_value') && <SortableTableHeader sortKey="recycle_value" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>退幣(G)</SortableTableHeader>}
                  {show('user')          && <SortableTableHeader sortKey="user"          currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>會員</SortableTableHeader>}
                  {show('uuid')          && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>UUID</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <TableSkeleton rows={6} cols={COLUMNS.length} />
                ) : sorted.length === 0 ? (
                  <TableEmpty colSpan={COLUMNS.length} />
                ) : (
                  sorted.map(item => {
                    const typeInfo = PRODUCT_TYPE_LABELS[item.product_type]
                    return (
                      <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
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
                              ? <Badge color={typeInfo.color}>{typeInfo.label}</Badge>
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
    </AdminLayout>
  )
}
