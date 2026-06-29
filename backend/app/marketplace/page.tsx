'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, FilterTags, CopyableID } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { useEffect, useMemo, useState } from 'react'

interface MarketplaceListing {
  id: number
  price: number
  status: 'active' | 'sold' | 'cancelled'
  created_at: string
  updated_at: string
  seller_id: string
  seller_name: string
  seller_email: string
  product_name: string
  prize_name: string
  prize_level: string
}

type StatusFilter = 'all' | 'active' | 'sold' | 'cancelled'

export default function MarketplaceAdminPage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [isClearing, setIsClearing] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)

  const fetchListings = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/marketplace/listings', { method: 'GET', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || res.statusText || '載入失敗')
      }

      const data = (await res.json()) as any[]
      const mapped: MarketplaceListing[] = (data || []).map((row) => ({
        id: row.id,
        price: row.price,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        seller_id: row.seller?.id || row.seller_id,
        seller_name: row.seller?.name || '未知會員',
        seller_email: row.seller?.email || '',
        product_name: row.draw_records?.products?.name || '未知商品',
        prize_name: row.draw_records?.product_prizes?.name || '未知獎項',
        prize_level: row.draw_records?.product_prizes?.level || '?'
      }))

      setListings(mapped)
    } catch (e) {
      console.error('Unexpected error fetching marketplace listings:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchListings()
  }, [])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleForceCancel = async (listing: MarketplaceListing) => {
    if (!window.confirm(`確定要強制下架這筆上架嗎？\n\n${listing.prize_level}賞 ${listing.prize_name}\n售價：${listing.price} G`)) {
      return
    }

    try {
      const res = await fetch('/api/admin/marketplace/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ listingId: listing.id, sellerId: listing.seller_id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error || '下架失敗')
        return
      }
      const data = await res.json().catch(() => null)
      if (!data || !data.success) {
        alert(data?.message || '下架失敗')
        return
      }

      setListings((prev) =>
        prev.map((item) =>
          item.id === listing.id ? { ...item, status: 'cancelled' } : item
        )
      )
    } catch (e) {
      console.error('Unexpected error cancelling listing:', e)
      alert('下架失敗')
    }
  }

  const handleClearTestData = async () => {
    if (!window.confirm('此操作會清空所有市集上架、交易紀錄與回收池資料，僅建議在測試環境使用，確定要繼續嗎？')) {
      return
    }

    try {
      setIsClearing(true)
      const res = await fetch('/api/admin/marketplace/clear', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error || '清除測試資料失敗')
        return
      }
      const data = await res.json().catch(() => null)
      if (!data || !data.success) {
        alert('清除測試資料失敗')
        return
      }

      await fetchListings()
      alert('已清除市集與回收池測試資料')
    } catch (e) {
      console.error('Unexpected error clearing test data:', e)
      alert('清除測試資料失敗')
    } finally {
      setIsClearing(false)
    }
  }

  const handleSeedTestData = async () => {
    if (
      !window.confirm(
        '此操作會從倉庫挑選可上架的賞項（status=in_warehouse、可交易、且有圖片），建立市集上架測試資料。確定要繼續嗎？'
      )
    ) {
      return
    }

    try {
      setIsSeeding(true)
      const res = await fetch('/api/admin/marketplace/seed', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error || '建立假資料失敗')
        return
      }
      const data = await res.json().catch(() => null)
      if (!data || !data.success) {
        alert(data?.message || '建立假資料失敗')
        return
      }

      await fetchListings()
      alert(`已建立 ${data.created || 0} 筆市集上架測試資料`)
    } catch (e) {
      console.error('Unexpected error seeding marketplace listings:', e)
      alert('建立假資料失敗')
    } finally {
      setIsSeeding(false)
    }
  }

  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const source = [
          item.prize_name,
          item.product_name,
          item.prize_level,
          item.seller_name,
          item.seller_email,
          item.seller_id,
          String(item.id)
        ]
          .join(' ')
          .toLowerCase()

        if (!source.includes(q)) {
          return false
        }
      }

      return true
    })
  }, [listings, searchQuery, statusFilter])

  const sortedListings = useMemo(() => {
    return [...filteredListings].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        case 'price':
          aValue = a.price
          bValue = b.price
          break
        case 'status':
          aValue = a.status
          bValue = b.status
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
  }, [filteredListings, sortField, sortDirection])

  const activeCount = listings.filter((item) => item.status === 'active').length
  const soldCount = listings.filter((item) => item.status === 'sold').length
  const cancelledCount = listings.filter((item) => item.status === 'cancelled').length

  return (
    <AdminLayout
      pageTitle="市集管理"
      breadcrumbs={[{ label: '市集管理', href: '/marketplace' }]}
    >
      <div className="space-y-6 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">玩家市集上架審核</h2>
            <p className="text-sm text-neutral-500 mt-1">
              檢視玩家上架的獎項，必要時進行下架，並可一鍵清除測試資料。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSeedTestData}
              disabled={isSeeding}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-200 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSeeding ? '建立中…' : '插入市集假資料'}
            </button>
            <button
              onClick={handleClearTestData}
              disabled={isClearing}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClearing ? '清除中…' : '一鍵清除市集 / 回收池測試資料'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatsCard title="上架中" value={activeCount} />
          <StatsCard title="已售出" value={soldCount} />
          <StatsCard title="已下架" value={cancelledCount} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋獎項名稱、賣家名稱、Email、UUID..."
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
                      : statusFilter === 'active'
                      ? '上架中'
                      : statusFilter === 'sold'
                      ? '已售出'
                      : '已下架',
                  color: 'primary',
                  onRemove: () => setStatusFilter('all')
                }
              ]}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <SortableTableHeader
                    sortKey="created_at"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    上架時間
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="prize_name"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    獎項
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="price"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    售價(G)
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="seller_name"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    賣家
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="status"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    狀態
                  </SortableTableHeader>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-500">
                      載入中…
                    </td>
                  </tr>
                ) : sortedListings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-500">
                      目前沒有符合條件的市集上架資料
                    </td>
                  </tr>
                ) : (
                  sortedListings.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-3 px-4 text-sm text-neutral-600 whitespace-nowrap">
                        {formatDateTime(item.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-neutral-900">
                            {item.prize_level}賞 {item.prize_name}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {item.product_name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm font-semibold text-amber-600">
                          {item.price.toLocaleString()} G
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-neutral-900">
                            {item.seller_name}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {item.seller_email ? item.seller_email : <CopyableID id={item.seller_id} />}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            item.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.status === 'sold'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {item.status === 'active'
                            ? '上架中'
                            : item.status === 'sold'
                            ? '已售出'
                            : '已下架'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleForceCancel(item)}
                          disabled={item.status !== 'active'}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          強制下架
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
