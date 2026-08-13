'use client'

/**
 * 商城訂單（玩家商城 sell_orders，不是抽獎出貨的 orders）
 *
 * 表格照「商品管理」的標準配方：SearchToolbar（搜尋＋篩選＋密度＋欄位開關）
 * ＋ FilterTags ＋ SortableTableHeader ＋ 靠右釘住的操作欄。
 * 篩選收在工具列的漏斗裡，不做自製膠囊列 —— 全後台同一套操作習慣。
 */

import Link from 'next/link'
import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, FilterTags, CopyableID } from '@/components'
import { TableEmpty } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import Badge from '@/components/ui/Badge'
import { formatDateTime } from '@/utils/dateFormat'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { useEffect, useMemo, useState } from 'react'

type StatusFilter = 'all' | 'in_progress' | 'completed' | 'cancelled'

type OrderRow = {
  id: number
  listing_id: number
  listing_title: string
  item_name: string
  item_index: number
  quantity: number
  unit_price: number
  total_price: number
  payment_method: string
  step: number
  cancelled: boolean
  completed_at: string | null
  buyer_id: string
  buyer_name: string
  buyer_email: string
  seller_id: string
  seller_name: string
  seller_email: string
  created_at: string
  updated_at: string
}

const stepLabel = (step: number) => {
  if (step === 1) return '建立'
  if (step === 2) return '付款'
  if (step === 3) return '確認'
  if (step === 4) return '出貨'
  if (step === 5) return '收貨'
  return '完成'
}

/** 玩家商城只有這兩種（雙方自理）；舊資料的 transfer 一併顯示成銀行轉帳 */
const paymentLabel = (m: string) =>
  m === 'linepay' ? 'LINE Pay' : m === 'bank' || m === 'transfer' ? '銀行轉帳' : m || '—'

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: '全部',
  in_progress: '進行中',
  completed: '已完成',
  cancelled: '已取消',
}

export default function SellOrdersAdminPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('sell_orders', 'compact', {
    order: true,
    listing: true,
    totalPrice: true,
    payment: true,
    progress: true,
    buyer: true,
    seller: true,
    createdAt: true,
    operations: true,
  })

  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  const fetchOrders = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/sell/orders', { method: 'GET', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || res.statusText || '載入失敗')
      }

      const data = (await res.json()) as any[]
      const mapped: OrderRow[] = (data || []).map((row) => {
        const listingId = Number(row.listing_id || 0)
        const listingTitle = String(row.listing?.title || '').trim()
        const items = Array.isArray(row.listing?.items) ? (row.listing.items as any[]) : []
        const itemIndex = Number(row.item_index || 0)
        const item = items[itemIndex] || null
        const itemName = String(item?.name || '').trim()
        const qty = Math.max(1, Number(row.quantity || 1))
        const unit = Math.max(0, Number(row.unit_price || 0))
        const total = unit * qty

        return {
          id: Number(row.id || 0),
          listing_id: listingId,
          listing_title: listingTitle || '商城商品',
          item_name: itemName || '品項',
          item_index: itemIndex,
          quantity: qty,
          unit_price: unit,
          total_price: total,
          payment_method: String(row.payment_method || ''),
          step: typeof row.step === 'number' ? row.step : Number(row.step || 1),
          cancelled: Boolean(row.cancelled),
          completed_at: row.completed_at ? String(row.completed_at) : null,
          buyer_id: String(row.buyer?.id || row.buyer_id || ''),
          buyer_name: String(row.buyer?.name || '未知會員'),
          buyer_email: String(row.buyer?.email || ''),
          seller_id: String(row.seller?.id || row.seller_id || ''),
          seller_name: String(row.seller?.name || '未知會員'),
          seller_email: String(row.seller?.email || ''),
          created_at: String(row.created_at || ''),
          updated_at: String(row.updated_at || ''),
        }
      })

      setOrders(mapped.filter((x) => Number.isFinite(x.id) && x.id > 0))
    } catch (e) {
      console.error('Unexpected error fetching sell orders:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const isCompleted = Boolean(o.completed_at) && !o.cancelled
      const isCancelled = o.cancelled
      const isInProgress = !isCompleted && !isCancelled

      if (statusFilter === 'completed' && !isCompleted) return false
      if (statusFilter === 'cancelled' && !isCancelled) return false
      if (statusFilter === 'in_progress' && !isInProgress) return false

      if (!normalizedQuery) return true
      const src = [
        o.id,
        o.listing_id,
        o.listing_title,
        o.item_name,
        o.buyer_id,
        o.buyer_name,
        o.buyer_email,
        o.seller_id,
        o.seller_name,
        o.seller_email,
        o.payment_method,
        String(o.step),
      ]
        .join(' ')
        .toLowerCase()
      return src.includes(normalizedQuery)
    })
  }, [normalizedQuery, orders, statusFilter])

  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      let aValue: any
      let bValue: any
      switch (sortField) {
        case 'created_at':
        case 'updated_at':
          aValue = new Date((a as any)[sortField]).getTime()
          bValue = new Date((b as any)[sortField]).getTime()
          break
        case 'total_price':
          aValue = a.total_price
          bValue = b.total_price
          break
        default:
          aValue = (a as any)[sortField]
          bValue = (b as any)[sortField]
      }
      if (typeof aValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
  }, [filteredOrders, sortDirection, sortField])

  const counts = useMemo(() => {
    const cancelled = orders.filter((o) => o.cancelled).length
    const completed = orders.filter((o) => Boolean(o.completed_at) && !o.cancelled).length
    const inProgress = orders.length - cancelled - completed
    return { total: orders.length, inProgress, completed, cancelled }
  }, [orders])

  const densityClasses = getDensityClasses()

  return (
    <AdminLayout pageTitle="商城訂單">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="全部" value={counts.total} />
          <StatsCard title="進行中" value={counts.inProgress} />
          <StatsCard title="已完成" value={counts.completed} />
          <StatsCard title="已取消" value={counts.cancelled} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋訂單 ID、上架單、會員、品項..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showColumnToggle={true}
            columns={[
              { key: 'order', label: '訂單', visible: visibleColumns.order },
              { key: 'listing', label: '上架單', visible: visibleColumns.listing },
              { key: 'totalPrice', label: '金額(G)', visible: visibleColumns.totalPrice },
              { key: 'payment', label: '付款', visible: visibleColumns.payment },
              { key: 'progress', label: '進度', visible: visibleColumns.progress },
              { key: 'buyer', label: '買家', visible: visibleColumns.buyer },
              { key: 'seller', label: '賣家', visible: visibleColumns.seller },
              { key: 'createdAt', label: '建立時間', visible: visibleColumns.createdAt },
              { key: 'operations', label: '操作', visible: visibleColumns.operations },
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns({ ...visibleColumns, [key]: visible })}
            showFilter={true}
            filterOptions={[
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                value: statusFilter,
                onChange: setStatusFilter,
                options: (Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((k) => ({
                  value: k,
                  label: STATUS_FILTER_LABEL[k],
                })),
              },
            ]}
          />

          {statusFilter !== 'all' && (
            <div className="mt-3">
              <FilterTags
                tags={[
                  {
                    key: 'status',
                    label: '狀態',
                    value: STATUS_FILTER_LABEL[statusFilter],
                    color: 'primary',
                    onRemove: () => setStatusFilter('all'),
                  },
                ]}
              />
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {visibleColumns.order && (
                    <SortableTableHeader sortKey="id" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={densityClasses}>
                      訂單
                    </SortableTableHeader>
                  )}
                  {visibleColumns.listing && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>上架單</th>
                  )}
                  {visibleColumns.totalPrice && (
                    <SortableTableHeader sortKey="total_price" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={densityClasses}>
                      金額(G)
                    </SortableTableHeader>
                  )}
                  {visibleColumns.payment && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>付款</th>
                  )}
                  {visibleColumns.progress && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>進度</th>
                  )}
                  {visibleColumns.buyer && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>買家</th>
                  )}
                  {visibleColumns.seller && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>賣家</th>
                  )}
                  {visibleColumns.createdAt && (
                    <SortableTableHeader sortKey="created_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={densityClasses}>
                      建立時間
                    </SortableTableHeader>
                  )}
                  {visibleColumns.operations && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 sticky right-0 bg-neutral-50 z-20 border-l border-neutral-200 whitespace-nowrap`}>
                      操作
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {isLoading ? (
                  <TableSkeleton rows={6} cols={9} />
                ) : sortedOrders.length === 0 ? (
                  <TableEmpty colSpan={9} message="目前沒有符合條件的商城訂單" />
                ) : (
                  sortedOrders.map((o) => {
                    const isCompleted = Boolean(o.completed_at) && !o.cancelled
                    const statusText = o.cancelled ? '已取消' : isCompleted ? '已完成' : '進行中'

                    return (
                      <tr key={o.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        {visibleColumns.order && (
                          <td className={`${densityClasses} whitespace-nowrap`}>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-neutral-900">#{o.id}</span>
                              <span className="text-xs text-neutral-500">
                                <CopyableID id={String(o.id)} />
                              </span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.listing && (
                          <td className={densityClasses}>
                            <div className="flex flex-col min-w-0">
                              <div className="text-sm font-medium text-neutral-900 truncate">{o.listing_title}</div>
                              <div className="text-xs text-neutral-500 truncate">
                                {o.item_name} × {o.quantity}（{o.unit_price.toLocaleString()}）
                              </div>
                            </div>
                          </td>
                        )}
                        {visibleColumns.totalPrice && (
                          <td className={`${densityClasses} text-sm font-semibold text-neutral-900 whitespace-nowrap`}>
                            {o.total_price.toLocaleString()}
                          </td>
                        )}
                        {visibleColumns.payment && (
                          <td className={`${densityClasses} text-sm text-neutral-700 whitespace-nowrap`}>
                            {paymentLabel(o.payment_method)}
                          </td>
                        )}
                        {visibleColumns.progress && (
                          <td className={`${densityClasses} whitespace-nowrap`}>
                            <div className="flex items-center gap-2">
                              <Badge status={statusText}>{statusText}</Badge>
                              <span className="text-xs text-neutral-500">{stepLabel(o.step)}</span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.buyer && (
                          <td className={`${densityClasses} text-sm text-neutral-700 whitespace-nowrap`}>{o.buyer_name}</td>
                        )}
                        {visibleColumns.seller && (
                          <td className={`${densityClasses} text-sm text-neutral-700 whitespace-nowrap`}>{o.seller_name}</td>
                        )}
                        {visibleColumns.createdAt && (
                          <td className={`${densityClasses} text-sm text-neutral-500 whitespace-nowrap`}>
                            {formatDateTime(o.created_at)}
                          </td>
                        )}
                        {visibleColumns.operations && (
                          <td className={`${densityClasses} sticky right-0 bg-white border-l border-neutral-200 whitespace-nowrap`}>
                            <Link href={`/sell-orders/${o.id}`} className="text-primary hover:text-blue-800 text-sm font-medium">
                              查看
                            </Link>
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
