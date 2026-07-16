'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, FilterTags, CopyableID } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { useEffect, useMemo, useState } from 'react'

type OfferStatus = 'active' | 'paused' | 'deleted'

type OfferCard = {
  id: number
  side: 'want' | 'give'
  external_id: string
  name: string
  series: string | null
  image_url: string | null
  value: number
  position: number
}

type OfferRow = {
  id: string
  owner_id: string
  status: OfferStatus
  note: string | null
  created_at: string
  updated_at: string
  owner_name: string
  owner_email: string
  cards: OfferCard[]
}

type StatusFilter = 'all' | OfferStatus

const statusLabel = (status: OfferStatus) => {
  if (status === 'active') return '上架中'
  if (status === 'paused') return '暫停'
  return '已刪除'
}

const statusBadgeClass = (status: OfferStatus) => {
  if (status === 'active') return 'bg-green-50 text-green-700 border-green-200'
  if (status === 'paused') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-neutral-100 text-neutral-600 border-neutral-200'
}

export default function ExchangeOffersAdminPage() {
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const fetchOffers = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/exchange/offers', { method: 'GET', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || res.statusText || '載入失敗')
      }

      const data = (await res.json()) as any[]
      const mapped: OfferRow[] = (data || []).map((row) => ({
        id: row.id,
        owner_id: row.owner_id,
        status: (row.status === 'paused' || row.status === 'deleted') ? row.status : 'active',
        note: row.note ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        owner_name: row.owner?.name || '未知會員',
        owner_email: row.owner?.email || '',
        cards: Array.isArray(row.cards)
          ? row.cards.map((c: any) => ({
              id: c.id,
              side: c.side === 'give' ? 'give' : 'want',
              external_id: c.external_id || '',
              name: c.name || '',
              series: c.series ?? null,
              image_url: c.image_url ?? null,
              value: typeof c.value === 'number' ? c.value : 0,
              position: typeof c.position === 'number' ? c.position : 0,
            }))
          : [],
      }))

      setOffers(mapped)
    } catch (e) {
      console.error('Unexpected error fetching exchange offers:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOffers()
  }, [])

  const handleSeedDemo = async () => {
    const ok = window.confirm('確定要插入幾筆交換假資料嗎？（用於測試列表/流程）')
    if (!ok) return
    try {
      setIsSeeding(true)
      const res = await fetch('/api/admin/exchange/seed', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offers: 6, withOrder: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '插入失敗')
      }
      await fetchOffers()
      alert('已插入假資料')
    } catch (e) {
      console.error('Unexpected error seeding exchange demo data:', e)
      alert('插入失敗')
    } finally {
      setIsSeeding(false)
    }
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleUpdateStatus = async (offer: OfferRow, nextStatus: OfferStatus) => {
    if (nextStatus === offer.status) return
    const ok = window.confirm(`確定要將此交換上架狀態改為「${statusLabel(nextStatus)}」嗎？\n\nOffer：${offer.id}`)
    if (!ok) return

    const prev = offer.status
    setOffers((rows) => rows.map((r) => (r.id === offer.id ? { ...r, status: nextStatus, updated_at: new Date().toISOString() } : r)))

    try {
      const res = await fetch('/api/admin/exchange/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: offer.id, status: nextStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '更新失敗')
      }
    } catch (e) {
      console.error('Unexpected error updating exchange offer status:', e)
      setOffers((rows) => rows.map((r) => (r.id === offer.id ? { ...r, status: prev } : r)))
      alert('更新失敗')
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredOffers = useMemo(() => {
    return offers.filter((offer) => {
      if (statusFilter !== 'all' && offer.status !== statusFilter) return false

      if (!normalizedQuery) return true
      const cardNames = offer.cards.map((c) => c.name).join(' ')
      const source = [offer.id, offer.owner_id, offer.owner_name, offer.owner_email, offer.note || '', cardNames]
        .join(' ')
        .toLowerCase()
      return source.includes(normalizedQuery)
    })
  }, [normalizedQuery, offers, statusFilter])

  const sortedOffers = useMemo(() => {
    return [...filteredOffers].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'created_at':
        case 'updated_at':
          aValue = new Date((a as any)[sortField]).getTime()
          bValue = new Date((b as any)[sortField]).getTime()
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
  }, [filteredOffers, sortField, sortDirection])

  const counts = useMemo(() => {
    let active = 0
    let paused = 0
    let deleted = 0
    for (const o of offers) {
      if (o.status === 'active') active += 1
      else if (o.status === 'paused') paused += 1
      else deleted += 1
    }
    return { active, paused, deleted, total: offers.length }
  }, [offers])

  return (
    <AdminLayout pageTitle="交換管理">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fetchOffers()}
            disabled={isLoading || isSeeding}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              isLoading || isSeeding
                ? 'bg-neutral-100 text-neutral-400 border-neutral-200'
                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            重新載入
          </button>
          <button
            type="button"
            onClick={handleSeedDemo}
            disabled={isLoading || isSeeding}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              isLoading || isSeeding
                ? 'bg-neutral-100 text-neutral-400 border-neutral-200'
                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            插入假資料
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="全部" value={counts.total} />
          <StatsCard title="上架中" value={counts.active} />
          <StatsCard title="暫停" value={counts.paused} />
          <StatsCard title="已刪除" value={counts.deleted} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋 Offer ID、會員、備註、卡名..."
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
                        : statusFilter === 'paused'
                          ? '暫停'
                          : '已刪除',
                  color: 'primary',
                  onRemove: () => setStatusFilter('all'),
                }
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {([
              { key: 'all' as const, label: '全部' },
              { key: 'active' as const, label: '上架中' },
              { key: 'paused' as const, label: '暫停' },
              { key: 'deleted' as const, label: '已刪除' },
            ]).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  statusFilter === opt.key
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
                  <SortableTableHeader sortKey="created_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    建立時間
                  </SortableTableHeader>
                  <SortableTableHeader sortKey="status" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    狀態
                  </SortableTableHeader>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500">Offer</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500">會員</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500">內容</th>
                  <SortableTableHeader sortKey="updated_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    更新時間
                  </SortableTableHeader>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-neutral-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-neutral-500">
                      載入中…
                    </td>
                  </tr>
                )}
                {!isLoading && sortedOffers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-neutral-500">
                      沒有資料
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  sortedOffers.map((offer) => {
                    const want = offer.cards.filter((c) => c.side === 'want')
                    const give = offer.cards.filter((c) => c.side === 'give')
                    const wantValue = want.reduce((acc, c) => acc + (typeof c.value === 'number' ? c.value : 0), 0)
                    const giveValue = give.reduce((acc, c) => acc + (typeof c.value === 'number' ? c.value : 0), 0)
                    return (
                      <tr key={offer.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                          {offer.created_at ? formatDateTime(offer.created_at) : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700">
                          <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${statusBadgeClass(offer.status)}`}>
                            {statusLabel(offer.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700">
                          <CopyableID id={offer.id} />
                          {offer.note && (
                            <div className="text-xs text-neutral-500 mt-1 line-clamp-2">{offer.note}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700">
                          <div className="font-medium">{offer.owner_name || '未知會員'}</div>
                          <div className="text-xs text-neutral-500">{offer.owner_email}</div>
                          <div className="mt-1">
                            <CopyableID id={offer.owner_id} />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700">
                          <div className="flex flex-col gap-1">
                            <div className="text-sm">
                              <span className="font-medium">我想要</span>
                              <span className="text-neutral-500">：{want.length} 張</span>
                              <span className="text-neutral-500">（約 {wantValue}）</span>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium">我拿出</span>
                              <span className="text-neutral-500">：{give.length} 張</span>
                              <span className="text-neutral-500">（約 {giveValue}）</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">
                          {offer.updated_at ? formatDateTime(offer.updated_at) : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-700 text-right">
                          <select
                            value={offer.status}
                            onChange={(e) => handleUpdateStatus(offer, e.target.value as OfferStatus)}
                            className="border border-neutral-200 rounded-lg px-2 py-1 text-sm bg-white"
                          >
                            <option value="active">上架中</option>
                            <option value="paused">暫停</option>
                            <option value="deleted">已刪除</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
