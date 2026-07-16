'use client'

import Link from 'next/link'
import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, FilterTags, CopyableID } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
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

export default function SellOrdersAdminPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

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
          listing_title: listingTitle || '販售商品',
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

  return (
    <AdminLayout pageTitle="販售訂單">
      <div className="space-y-6 p-6">
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
          />

          <div className="mt-3">
            <FilterTags
              tags={[
                {
                  key: 'status',
                  label: '狀態',
                  value:
                    statusFilter === 'all'
                      ? '全部'
                      : statusFilter === 'in_progress'
                      ? '進行中'
                      : statusFilter === 'completed'
                      ? '已完成'
                      : '已取消',
                  color: 'primary',
                  onRemove: () => setStatusFilter('all'),
                },
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {([
              { key: 'all' as const, label: '全部' },
              { key: 'in_progress' as const, label: '進行中' },
              { key: 'completed' as const, label: '已完成' },
              { key: 'cancelled' as const, label: '已取消' },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatusFilter(t.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  statusFilter === t.key ? 'bg-primary text-white border-primary' : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <SortableTableHeader sortKey="id" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="py-3 px-4">
                    訂單
                  </SortableTableHeader>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">上架單</th>
                  <SortableTableHeader sortKey="total_price" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="py-3 px-4">
                    金額(G)
                  </SortableTableHeader>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">付款</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">進度</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">買家</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">賣家</th>
                  <SortableTableHeader sortKey="created_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="py-3 px-4">
                    建立時間
                  </SortableTableHeader>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-neutral-700 sticky right-0 bg-neutral-50 z-20 border-l border-neutral-200 whitespace-nowrap">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-neutral-500">
                      載入中…
                    </td>
                  </tr>
                ) : sortedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-neutral-500">
                      目前沒有符合條件的販售訂單
                    </td>
                  </tr>
                ) : (
                  sortedOrders.map((o) => {
                    const isCompleted = Boolean(o.completed_at) && !o.cancelled
                    const statusText = o.cancelled ? '已取消' : isCompleted ? '已完成' : '進行中'
                    const statusClass = o.cancelled
                      ? 'bg-neutral-100 text-neutral-700'
                      : isCompleted
                      ? 'bg-green-50 text-green-700'
                      : 'bg-amber-50 text-amber-700'

                    return (
                      <tr key={o.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-neutral-900">#{o.id}</span>
                            <span className="text-xs text-neutral-500">
                              <CopyableID id={String(o.id)} />
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col min-w-0">
                            <div className="text-sm font-medium text-neutral-900 truncate">{o.listing_title}</div>
                            <div className="text-xs text-neutral-500 truncate">
                              {o.item_name} × {o.quantity}（{o.unit_price.toLocaleString()}）
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm font-semibold text-neutral-900 whitespace-nowrap">
                          {o.total_price.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                          {o.payment_method === 'transfer' ? '轉帳' : o.payment_method === 'private' ? '私下' : o.payment_method}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${statusClass}`}>{statusText}</span>
                            <span className="text-xs text-neutral-500">{stepLabel(o.step)}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">{o.buyer_name}</td>
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">{o.seller_name}</td>
                        <td className="py-3 px-4 text-sm text-neutral-500 whitespace-nowrap">
                          {formatDateTime(o.created_at)}
                        </td>
                        <td className="py-3 px-4 sticky right-0 bg-white border-l border-neutral-200 whitespace-nowrap">
                          <Link href={`/sell-orders/${o.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                            查看
                          </Link>
                        </td>
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

