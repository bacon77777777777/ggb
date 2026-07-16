'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, FilterTags, CopyableID } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { useEffect, useMemo, useState } from 'react'

type DoneFilter = 'all' | 'in_progress' | 'done'

type OrderRow = {
  id: string
  offer_id: string
  offer_status: string
  owner_id: string
  owner_name: string
  owner_email: string
  initiator_id: string
  initiator_name: string
  initiator_email: string
  step: number
  done: boolean
  created_at: string
  updated_at: string
}

const stepLabel = (step: number) => {
  if (step === 1) return '建立交換'
  if (step === 2) return '雙方確認'
  if (step === 3) return '寄出'
  if (step === 4) return '收件'
  return '評價'
}

export default function ExchangeOrdersAdminPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [doneFilter, setDoneFilter] = useState<DoneFilter>('all')
  const [sortField, setSortField] = useState<string>('updated_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const fetchOrders = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/exchange/orders', { method: 'GET', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || res.statusText || '載入失敗')
      }

      const data = (await res.json()) as any[]
      const mapped: OrderRow[] = (data || []).map((row) => ({
        id: row.id,
        offer_id: row.offer_id,
        offer_status: row.offer?.status || '',
        owner_id: row.owner_id,
        owner_name: row.owner?.name || '未知會員',
        owner_email: row.owner?.email || '',
        initiator_id: row.initiator_id,
        initiator_name: row.initiator?.name || '未知會員',
        initiator_email: row.initiator?.email || '',
        step: typeof row.step === 'number' ? row.step : 1,
        done: !!row.done,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }))

      setOrders(mapped)
    } catch (e) {
      console.error('Unexpected error fetching exchange orders:', e)
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

  const handlePatch = async (order: OrderRow, patch: { step?: number; done?: boolean }) => {
    const nextDone = typeof patch.done === 'boolean' ? patch.done : order.done
    if (nextDone && !order.done) {
      const ok = window.confirm(`確定要將此交換紀錄標記為已完成嗎？\n\nOrder：${order.id}`)
      if (!ok) return
    }

    const prev = order
    const next: OrderRow = {
      ...order,
      step: typeof patch.step === 'number' ? patch.step : order.step,
      done: typeof patch.done === 'boolean' ? patch.done : order.done,
      updated_at: new Date().toISOString(),
    }
    setOrders((rows) => rows.map((r) => (r.id === order.id ? next : r)))

    try {
      const res = await fetch('/api/admin/exchange/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: order.id, ...patch }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '更新失敗')
      }
    } catch (e) {
      console.error('Unexpected error updating exchange order:', e)
      setOrders((rows) => rows.map((r) => (r.id === prev.id ? prev : r)))
      alert('更新失敗')
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (doneFilter === 'done' && !order.done) return false
      if (doneFilter === 'in_progress' && order.done) return false

      if (!normalizedQuery) return true
      const source = [
        order.id,
        order.offer_id,
        order.owner_id,
        order.initiator_id,
        order.owner_name,
        order.owner_email,
        order.initiator_name,
        order.initiator_email,
        String(order.step),
        order.offer_status,
      ]
        .join(' ')
        .toLowerCase()
      return source.includes(normalizedQuery)
    })
  }, [doneFilter, normalizedQuery, orders])

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
        case 'step':
          aValue = a.step
          bValue = b.step
          break
        case 'done':
          aValue = a.done ? 1 : 0
          bValue = b.done ? 1 : 0
          break
        default:
          aValue = (a as any)[sortField]
          bValue = (b as any)[sortField]
      }

      if (typeof aValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
  }, [filteredOrders, sortField, sortDirection])

  const counts = useMemo(() => {
    const done = orders.filter((o) => o.done).length
    const inProgress = orders.length - done
    return { total: orders.length, done, inProgress }
  }, [orders])

  return (
    <AdminLayout pageTitle="交換紀錄">
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatsCard title="全部" value={counts.total} />
          <StatsCard title="進行中" value={counts.inProgress} />
          <StatsCard title="已完成" value={counts.done} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋 Order ID、Offer ID、會員..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <div className="mt-3">
            <FilterTags
              tags={[
                {
                  key: 'done',
                  label: '狀態',
                  value: doneFilter === 'all' ? '全部' : doneFilter === 'in_progress' ? '進行中' : '已完成',
                  color: 'primary',
                  onRemove: () => setDoneFilter('all'),
                }
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {([
              { key: 'all' as const, label: '全部' },
              { key: 'in_progress' as const, label: '進行中' },
              { key: 'done' as const, label: '已完成' },
            ]).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDoneFilter(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  doneFilter === opt.key
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="bg-neutral-50 border-y border-neutral-200">
                  <SortableTableHeader sortKey="updated_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    更新時間
                  </SortableTableHeader>
                  <SortableTableHeader sortKey="step" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    流程
                  </SortableTableHeader>
                  <SortableTableHeader sortKey="done" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    完成
                  </SortableTableHeader>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500">Order</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500">Offer</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500">創建者</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500">發起者</th>
                  <SortableTableHeader sortKey="created_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    建立時間
                  </SortableTableHeader>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm text-neutral-500">
                      載入中…
                    </td>
                  </tr>
                )}
                {!isLoading && sortedOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm text-neutral-500">
                      沒有資料
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  sortedOrders.map((order) => (
                    <tr key={order.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                        {order.updated_at ? formatDateTime(order.updated_at) : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            value={order.step}
                            onChange={(e) => handlePatch(order, { step: Number(e.target.value) })}
                            className="border border-neutral-200 rounded-lg px-2 py-1 text-sm bg-white"
                          >
                            {[1, 2, 3, 4, 5].map((s) => (
                              <option key={s} value={s}>
                                {s}. {stepLabel(s)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={order.done}
                            onChange={(e) => handlePatch(order, { done: e.target.checked })}
                          />
                          <span className={`text-xs px-2 py-1 rounded border ${order.done ? 'bg-green-50 text-green-700 border-green-200' : 'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>
                            {order.done ? '已完成' : '進行中'}
                          </span>
                        </label>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700">
                        <CopyableID id={order.id} />
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700">
                        <CopyableID id={order.offer_id} />
                        {order.offer_status && (
                          <div className="text-xs text-neutral-500 mt-1">Offer 狀態：{order.offer_status}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700">
                        <div className="font-medium">{order.owner_name || '未知會員'}</div>
                        <div className="text-xs text-neutral-500">{order.owner_email}</div>
                        <div className="mt-1">
                          <CopyableID id={order.owner_id} />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700">
                        <div className="font-medium">{order.initiator_name || '未知會員'}</div>
                        <div className="text-xs text-neutral-500">{order.initiator_email}</div>
                        <div className="mt-1">
                          <CopyableID id={order.initiator_id} />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                        {order.created_at ? formatDateTime(order.created_at) : '-'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
