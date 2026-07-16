'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, FilterTags, CopyableID } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface SellListing {
  id: number
  status: string
  title: string
  view_count: number
  created_at: string
  updated_at: string
  seller_id: string
  seller_name: string
  seller_email: string
  note?: string
  images?: string[]
  items?: Array<{
    name?: string
    series?: string
    grade?: string
    image?: string
    quantity?: number
    price?: number
  }>
}

type StatusFilter = 'all' | 'draft' | 'active' | 'sold' | 'hidden'

export default function SellAdminPage() {
  const [listings, setListings] = useState<SellListing[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [isClearing, setIsClearing] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [expandedListings, setExpandedListings] = useState<Set<number>>(new Set())
  const [selectedListings, setSelectedListings] = useState<Set<number>>(new Set())
  const FRONTEND_URL = (process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace('127.0.0.1', 'localhost')

  const maybeBootstrap = async (errorText: string) => {
    const msg = String(errorText || '')
    const looksMissingSell =
      msg.includes("Could not find the table 'public.sell_listings'") ||
      (msg.includes('sell_listings') && msg.includes('schema cache')) ||
      (msg.includes('view_count') && msg.includes('sell_listings')) ||
      msg.includes('increment_sell_listing_view')
    if (!looksMissingSell) return false

    const bootstrapRes = await fetch('/api/admin/sell/bootstrap', { method: 'POST', credentials: 'include' })
    if (!bootstrapRes.ok) {
      const data = await bootstrapRes.json().catch(() => null)
      alert(data?.error || '初始化販售資料表失敗')
      return false
    }
    const data = await bootstrapRes.json().catch(() => null)
    if (!data?.success) {
      alert(data?.error || '初始化販售資料表失敗')
      return false
    }
    return true
  }

  const fetchListings = async () => {
    try {
      setIsLoading(true)
      let res = await fetch('/api/admin/sell/listings', { method: 'GET', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const didBootstrap = await maybeBootstrap(String(data?.error || ''))
        if (didBootstrap) {
          res = await fetch('/api/admin/sell/listings', { method: 'GET', credentials: 'include' })
        }
        if (!res.ok) {
          const data2 = await res.json().catch(() => null)
          throw new Error(data2?.error || data?.error || res.statusText || '載入失敗')
        }
      }

      const data = (await res.json()) as any[]
      const mapped: SellListing[] = (data || []).map((row) => ({
        id: row.id,
        status: row.status,
        title: row.title || '販售商品',
        view_count: Number(row.view_count || 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        seller_id: row.seller?.id || row.seller_id,
        seller_name: row.seller?.name || '未知會員',
        seller_email: row.seller?.email || '',
        note: row.note || '',
        images: Array.isArray(row.images) ? row.images : [],
        items: Array.isArray(row.items) ? row.items : [],
      }))

      setListings(mapped)
    } catch (e) {
      console.error('Unexpected error fetching sell listings:', e)
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

  const handleClear = async () => {
    if (!window.confirm('此操作會清空所有販售上架資料（含訂單/私聊將因 FK cascade 一起刪除），確定要繼續嗎？')) {
      return
    }

    try {
      setIsClearing(true)
      let res = await fetch('/api/admin/sell/clear', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const didBootstrap = await maybeBootstrap(String(data?.error || ''))
        if (didBootstrap) {
          res = await fetch('/api/admin/sell/clear', { method: 'POST', credentials: 'include' })
        }
        if (!res.ok) {
          const data2 = await res.json().catch(() => null)
          alert(data2?.error || data?.error || '清除失敗')
          return
        }
      }
      await fetchListings()
      alert('已清除販售測試資料')
    } catch (e) {
      console.error('Unexpected error clearing sell listings:', e)
      alert('清除失敗')
    } finally {
      setIsClearing(false)
    }
  }

  const handleSeed = async () => {
    if (!window.confirm('此操作會新增「寶可夢實體卡」販售假資料（含多規格/多圖），確定要繼續嗎？')) {
      return
    }

    try {
      setIsSeeding(true)
      let res = await fetch('/api/admin/sell/seed', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const didBootstrap = await maybeBootstrap(String(data?.error || ''))
        if (didBootstrap) {
          res = await fetch('/api/admin/sell/seed', { method: 'POST', credentials: 'include' })
        }
        if (!res.ok) {
          const data2 = await res.json().catch(() => null)
          alert(data2?.error || data?.error || '建立假資料失敗')
          return
        }
      }
      const data = await res.json().catch(() => null)
      if (!data || !data.success) {
        alert(data?.message || '建立假資料失敗')
        return
      }
      await fetchListings()
      alert(`已建立 ${data.created || 0} 筆販售假資料`)
    } catch (e) {
      console.error('Unexpected error seeding sell listings:', e)
      alert('建立假資料失敗')
    } finally {
      setIsSeeding(false)
    }
  }

  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      const source = [item.title, item.seller_name, item.seller_email, item.seller_id, String(item.id)].join(' ').toLowerCase()
      return source.includes(q)
    })
  }, [listings, searchQuery, statusFilter])

  const sortedListings = useMemo(() => {
    const arr = [...filteredListings]
    arr.sort((a, b) => {
      const va = (a as any)[sortField]
      const vb = (b as any)[sortField]
      if (va === vb) return 0
      const dir = sortDirection === 'asc' ? 1 : -1
      return va > vb ? dir : -dir
    })
    return arr
  }, [filteredListings, sortDirection, sortField])

  const toggleExpand = (id: number) => {
    setExpandedListings((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedListings(new Set())
      return
    }
    setSelectedListings(new Set(sortedListings.map((x) => x.id)))
  }

  const handleSelectOne = (id: number) => {
    setSelectedListings((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const updateStatus = async (id: number, status: string) => {
    const res = await fetch('/api/admin/sell/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, status }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || '更新狀態失敗')
    }
  }

  const deleteListing = async (id: number, title: string) => {
    if (!window.confirm(`確定要刪除販售上架「${title || id}」嗎？此動作無法復原。`)) return
    const res = await fetch(`/api/admin/sell/listings?id=${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || '刪除失敗')
    }
    setListings((prev) => prev.filter((x) => x.id !== id))
    setExpandedListings((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setSelectedListings((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const stats = useMemo(() => {
    const total = listings.length
    const active = listings.filter((x) => x.status === 'active').length
    const sold = listings.filter((x) => x.status === 'sold').length
    return { total, active, sold }
  }, [listings])

  return (
    <AdminLayout pageTitle="販售管理" pageSubtitle="自由上架寶可夢實體卡（與市集分開）">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <StatsCard title="總上架" value={stats.total} />
        <StatsCard title="上架中" value={stats.active} />
        <StatsCard title="已售出" value={stats.sold} />
      </div>

      <PageCard>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSeed}
              disabled={isSeeding}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSeeding ? '建立中…' : '建立販售假資料'}
            </button>
            <button
              type="button"
              onClick={fetchListings}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
            >
              重新整理
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={isClearing}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClearing ? '清除中…' : '清除販售測試資料'}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <SearchToolbar searchPlaceholder="搜尋標題、賣家名稱、Email、UUID..." searchValue={searchQuery} onSearchChange={setSearchQuery} />
        </div>

        <div className="mt-3">
          <FilterTags
            tags={[
              {
                key: 'status',
                label: '狀態',
                value:
                  statusFilter === 'all'
                    ? '全部'
                    : statusFilter === 'draft'
                    ? '草稿'
                    : statusFilter === 'active'
                    ? '上架中'
                    : statusFilter === 'sold'
                    ? '已售出'
                    : '已下架',
                color: 'primary',
                onRemove: () => setStatusFilter('all'),
              },
            ]}
          />
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedListings.size === sortedListings.length && sortedListings.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 text-primary focus:ring-primary rounded"
                  />
                </th>
                <SortableTableHeader sortKey="title" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="py-3 px-4">
                  標題
                </SortableTableHeader>
                <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">規格</th>
                <SortableTableHeader sortKey="view_count" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="py-3 px-4">
                  瀏覽
                </SortableTableHeader>
                <SortableTableHeader sortKey="seller_name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="py-3 px-4">
                  賣家
                </SortableTableHeader>
                <SortableTableHeader sortKey="status" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="py-3 px-4">
                  狀態
                </SortableTableHeader>
                <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">上架</th>
                <SortableTableHeader sortKey="created_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="py-3 px-4">
                  建立時間
                </SortableTableHeader>
                <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500 sticky right-0 bg-neutral-50 z-20 border-l border-neutral-200 whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-500">
                    載入中…
                  </td>
                </tr>
              ) : sortedListings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-500">
                    目前沒有符合條件的販售上架資料
                  </td>
                </tr>
              ) : (
                sortedListings.map((item) => {
                  const items = Array.isArray(item.items) ? item.items : []
                  const itemCount = items.length
                  const totalQty = items.reduce((sum, it) => sum + Math.max(0, Number(it?.quantity) || 0), 0)
                  const isExpanded = expandedListings.has(item.id)
                  const isVisible = item.status === 'active'
                  const disableToggle = item.status === 'sold'
                  const statusLabel =
                    item.status === 'active' ? '上架中' : item.status === 'sold' ? '已售出' : item.status === 'draft' ? '草稿' : '已下架'

                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => toggleExpand(item.id)}
                        className={`group border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-all duration-300 ${isExpanded ? 'bg-neutral-50' : ''}`}
                      >
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedListings.has(item.id)}
                            onChange={() => handleSelectOne(item.id)}
                            className="w-4 h-4 text-primary focus:ring-primary rounded"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <svg
                              className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180 text-primary' : 'text-neutral-400'}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="text-sm font-medium text-neutral-900 whitespace-nowrap">{item.title}</span>
                            <span className="text-xs text-neutral-400 whitespace-nowrap">
                              <CopyableID id={String(item.id)} />
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                          {itemCount > 0 ? `${itemCount}項 / ${totalQty}件` : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                          {Number(item.view_count || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">{item.seller_name}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                              item.status === 'active'
                                ? 'bg-green-50 text-green-700'
                                : item.status === 'sold'
                                ? 'bg-primary text-primary'
                                : item.status === 'draft'
                                ? 'bg-neutral-100 text-neutral-700'
                                : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={disableToggle}
                            onClick={async () => {
                              if (disableToggle) return
                              const nextStatus = isVisible ? 'hidden' : 'active'
                              try {
                                await updateStatus(item.id, nextStatus)
                                setListings((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: nextStatus } : x)))
                              } catch (e) {
                                console.error('Failed to update sell listing status:', e)
                                alert('更新狀態失敗')
                              }
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all flex-shrink-0 disabled:opacity-50 ${
                              isVisible ? 'bg-primary' : 'bg-neutral-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                isVisible ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-600 whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                        <td
                          className={`py-3 px-4 sticky right-0 z-20 border-l border-neutral-200 whitespace-nowrap ${
                            isExpanded ? 'bg-neutral-50' : 'bg-white group-hover:bg-neutral-50'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2">
                            <Link
                              href={`${FRONTEND_URL}/sell/${item.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:text-blue-800 text-sm font-medium whitespace-nowrap"
                            >
                              前台
                            </Link>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await deleteListing(item.id, item.title)
                                } catch (e) {
                                  console.error('Failed to delete sell listing:', e)
                                  alert('刪除失敗')
                                }
                              }}
                              className="text-red-600 hover:text-red-800 text-sm font-medium whitespace-nowrap"
                            >
                              刪除
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`expanded:${item.id}`} className="bg-neutral-50">
                          <td colSpan={8} className="py-4 px-4">
                            <div className="pl-8 space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="text-sm text-neutral-700">
                                  <div className="text-xs text-neutral-400 mb-1">賣家 Email</div>
                                  <div className="font-mono text-xs break-all">{item.seller_email || '-'}</div>
                                </div>
                                <div className="text-sm text-neutral-700">
                                  <div className="text-xs text-neutral-400 mb-1">賣家 UUID</div>
                                  <div className="text-xs text-neutral-500">
                                    <CopyableID id={item.seller_id} />
                                  </div>
                                </div>
                                <div className="text-sm text-neutral-700">
                                  <div className="text-xs text-neutral-400 mb-1">備註</div>
                                  <div className="text-xs text-neutral-600 break-words">{String(item.note || '').trim() || '-'}</div>
                                </div>
                              </div>

                              <div className="border-t border-neutral-200 pt-3">
                                {itemCount === 0 ? (
                                  <div className="text-sm text-neutral-500">此上架單沒有設定品項</div>
                                ) : (
                                  <div className="space-y-2">
                                    {items.map((it, idx) => {
                                      const name = String(it?.name || '').trim() || '未命名'
                                      const series = String(it?.series || '').trim()
                                      const grade = String(it?.grade || '').trim()
                                      const image = String(it?.image || '').trim()
                                      const qty = Math.max(0, Math.round(Number(it?.quantity) || 0))
                                      const price = Math.max(0, Math.round(Number(it?.price) || 0))

                                      return (
                                        <div key={idx} className="flex items-center gap-3 text-sm">
                                          <div className="w-10 h-10 rounded-lg bg-white border border-neutral-200 overflow-hidden flex items-center justify-center">
                                            {image ? (
                                              <img src={image} alt={name} className="w-full h-full object-cover" />
                                            ) : (
                                              <span className="text-xs text-neutral-300">No</span>
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="text-neutral-800 font-medium truncate">{name}</div>
                                            <div className="text-xs text-neutral-400 truncate">
                                              {[series, grade].filter(Boolean).join(' / ') || '—'}
                                            </div>
                                          </div>
                                          <div className="w-24 text-right text-neutral-700 font-mono whitespace-nowrap">{price ? `${price.toLocaleString()} G` : '-'}</div>
                                          <div className="w-16 text-right text-neutral-500 font-mono whitespace-nowrap">{qty}</div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-0 sticky right-0 bg-neutral-50 border-l border-neutral-200"></td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </PageCard>
    </AdminLayout>
  )
}
