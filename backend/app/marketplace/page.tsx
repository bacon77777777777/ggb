'use client'

/**
 * 交易所品項管理
 *
 * 交易所＝玩家把倉庫裡還沒配送的賞掛上來，用 G 幣賣給別的玩家（跟商城收真錢不同）。
 * 這頁只管「架上的東西」；成交金流看「交易紀錄」，規則看「交易所設定」。
 *
 * 2026-09-01 重寫：原本這頁是手刻 <table>、手刻按鈕、全部錯誤只 console.error，
 * 而且 FilterTags 上那顆「狀態：全部」永遠在、狀態卻**沒有任何地方能切換**
 * —— 篩選功能等於不存在。現在整頁改用後台既有元件（DataTable／SearchToolbar／
 * ActionMenu／BulkActionBar／useToast）。
 *
 * 測試工具（插入假資料／清除市集）已移到「交易所設定 → 測試工具」——
 * 那兩顆是不可逆操作，不該和日常審核並排在同一排。
 *
 * 2026-09-02 老闆：「簡單點，這邊只會有上架中的，下架就是回到賣家的倉庫」。
 * 已售出去「交易紀錄」看、已下架的東西就回倉庫了 —— 這頁不留屍體：
 * 只撈 active、沒有狀態欄也沒有狀態篩選，強制下架成功那列直接消失。
 */

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AdminLayout, PageCard, SearchToolbar, StatsCard, DataTable, MemberNo, FilterTags } from '@/components'
import type { Column } from '@/components'
import { Badge, Button, ActionMenu } from '@/components/ui'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'

interface Listing {
  id: number
  price: number
  created_at: string
  updated_at: string
  seller_id: string
  seller_name: string
  seller_email: string
  seller_member_no: number | null
  seller_is_bot: boolean
  product_name: string
  product_type: string
  prize_name: string
  prize_level: string
  prize_image: string | null
  ticket_number: number | null
}

type BotFilter = 'real' | 'all' | 'bot'

export default function MarketplaceListingsPage() {
  const { confirm, dialogProps } = useConfirmDialog()
  const { toast } = useToast()

  const [listings, setListings] = useState<Listing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [botFilter, setBotFilter] = useState<BotFilter>('all')
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [density, setDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact')
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set())
  const [busy, setBusy] = useState(false)

  const fetchListings = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/marketplace/listings', { credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '載入失敗')
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (await res.json()) as any[]
      setListings((rows || []).filter((r) => r.status === 'active').map((r) => ({
        id: r.id,
        price: r.price,
        created_at: r.created_at,
        updated_at: r.updated_at,
        seller_id: r.seller?.id || r.seller_id,
        seller_name: r.seller?.name || '未知會員',
        seller_email: r.seller?.email || '',
        seller_member_no: r.seller?.member_no ?? null,
        seller_is_bot: !!r.seller?.is_bot,
        product_name: r.draw_records?.products?.name || '未知商品',
        product_type: r.draw_records?.products?.type || '',
        prize_name: r.draw_records?.product_prizes?.name || '未知獎項',
        prize_level: r.draw_records?.product_prizes?.level || '',
        prize_image: r.draw_records?.product_prizes?.image_url || null,
        ticket_number: r.draw_records?.ticket_number ?? null,
      })))
    } catch (e) {
      toast(e instanceof Error ? e.message : '載入失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchListings() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (field: string) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDirection('asc') }
  }

  /** 強制下架一筆。走 cancel_listing（跟玩家自己下架同一支），獎品會退回賣家倉庫 */
  const cancelOne = async (item: Listing) => {
    const res = await fetch('/api/admin/marketplace/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ listingId: item.id, sellerId: item.seller_id }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || data?.success === false) throw new Error(data?.message || data?.error || '下架失敗')
    return true
  }

  const handleForceCancel = (item: Listing) => {
    confirm({
      title: '強制下架',
      message: `${item.prize_level} ${item.prize_name}｜售價 ${item.price.toLocaleString()} G\n下架後獎品退回賣家倉庫，賣家可以重新上架或申請配送。`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await cancelOne(item)
          setListings(prev => prev.filter(x => x.id !== item.id))
          toast('已強制下架，獎品退回賣家倉庫', 'success')
        } catch (e) {
          toast(e instanceof Error ? e.message : '下架失敗', 'error')
        }
      },
    })
  }

  const handleBulkCancel = () => {
    const targets = listings.filter(x => selectedIds.has(x.id))
    if (targets.length === 0) { toast('先勾選要下架的品項', 'warning'); return }
    confirm({
      title: `強制下架 ${targets.length} 筆`,
      message: '下架後獎品全部退回各自賣家的倉庫。此操作會逐筆執行，失敗的會保留在架上。',
      type: 'danger',
      onConfirm: async () => {
        setBusy(true)
        let ok = 0
        const failed: number[] = []
        for (const t of targets) {
          try { await cancelOne(t); ok++ } catch { failed.push(t.id) }
        }
        setBusy(false)
        setSelectedIds(new Set())
        await fetchListings()
        if (failed.length) toast(`下架 ${ok} 筆，失敗 ${failed.length} 筆`, 'warning')
        else toast(`已強制下架 ${ok} 筆`, 'success')
      },
    })
  }

  const filtered = useMemo(() => listings.filter((item) => {
    if (botFilter === 'real' && item.seller_is_bot) return false
    if (botFilter === 'bot' && !item.seller_is_bot) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const hay = [item.prize_name, item.product_name, item.prize_level, item.seller_name,
        item.seller_email, item.seller_id, String(item.id)].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [listings, searchQuery, botFilter])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let av: any, bv: any
    switch (sortField) {
      case 'created_at': av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); break
      case 'price': av = a.price; bv = b.price; break
      case 'prize': av = a.prize_name; bv = b.prize_name; break
      case 'seller': av = a.seller_name; bv = b.seller_name; break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      default: av = (a as any)[sortField]; bv = (b as any)[sortField]
    }
    if (typeof av === 'string') return sortDirection === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDirection === 'asc' ? av - bv : bv - av
  }), [filtered, sortField, sortDirection])

  const activeCount = listings.length
  // 架上總值：買家要買光整個交易所得付多少 G。看得出這池子有多重
  const activeValue = listings.reduce((n, x) => n + x.price, 0)

  const exportCSV = () => {
    const head = ['上架編號', '上架時間', '賞等', '獎項', '來源商品', '售價(G)', '賣家', '會員編號', 'Email']
    const rows = sorted.map(x => [
      x.id, formatDateTime(x.created_at), x.prize_level, x.prize_name, x.product_name,
      x.price, x.seller_name, x.seller_member_no ?? '', x.seller_email,
    ])
    const csv = [head, ...rows]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `交易所品項_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns: Column<Listing>[] = [
    {
      key: 'prize', label: '獎項', sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
            {item.prize_image && (
              <Image src={item.prize_image} alt="" fill sizes="44px" className="object-contain" unoptimized />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {item.prize_level && <Badge variant="warning" size="sm">{item.prize_level}</Badge>}
              <span className="truncate text-sm font-medium text-neutral-900">{item.prize_name}</span>
            </div>
            <div className="truncate text-xs text-neutral-500">
              {item.product_name}{item.ticket_number ? `\u3000#${item.ticket_number}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'price', label: '售價(G)', sortable: true,
      render: (item) => <span className="text-sm font-semibold tabular-nums text-amber-600">{item.price.toLocaleString()}</span>,
    },
    {
      key: 'seller', label: '賣家', sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-neutral-900">{item.seller_name}</span>
            {item.seller_is_bot && <Badge variant="default" size="sm">機器人</Badge>}
          </div>
          <div className="truncate text-xs text-neutral-500">
            {item.seller_email || <MemberNo no={item.seller_member_no} uuid={item.seller_id} />}
          </div>
        </div>
      ),
    },
    {
      key: 'created_at', label: '上架時間', sortable: true,
      render: (item) => <span className="whitespace-nowrap text-sm text-neutral-600">{formatDateTime(item.created_at)}</span>,
    },
    {
      key: 'operations', label: '操作', sticky: true,
      render: (item) => (
        <div className="flex justify-end">
          <ActionMenu
            items={[
              { label: '複製賣家 UUID', onClick: () => { navigator.clipboard.writeText(item.seller_id); toast('已複製賣家 UUID', 'success') } },
              { label: '強制下架', danger: true, onClick: () => handleForceCancel(item) },
            ]}
          />
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="交易所品項管理">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <StatsCard title="上架中" value={activeCount} />
          <StatsCard title="架上總值" value={`${activeValue.toLocaleString()} G`} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋獎項、來源商品、賣家名稱、Email、UUID…"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showDensity
            density={density}
            onDensityChange={setDensity}
            showExportCSV
            onExportCSV={exportCSV}
            showFilter
            filterOptions={[
              {
                key: 'bot', label: '賣家', type: 'select', value: botFilter,
                onChange: (v: BotFilter) => setBotFilter(v),
                options: [
                  { value: 'all', label: '全部賣家' },
                  { value: 'real', label: '只看真實玩家' },
                  { value: 'bot', label: '只看機器人' },
                ],
              },
            ]}
            selectedCount={selectedIds.size}
            batchActions={[{ label: '強制下架', variant: 'danger', onClick: handleBulkCancel }]}
            onClearSelection={() => setSelectedIds(new Set())}
          >
            <Button variant="secondary" size="sm" onClick={fetchListings} isLoading={isLoading || busy}>
              重新整理
            </Button>
          </SearchToolbar>

          {botFilter !== 'all' && (
            <div className="mt-3">
              <FilterTags
                tags={[{
                  key: 'bot', label: '賣家',
                  value: botFilter === 'real' ? '只看真實玩家' : '只看機器人',
                  color: 'primary' as const, onRemove: () => setBotFilter('all'),
                }]}
              />
            </div>
          )}

          <div className="mt-4">
            <DataTable
              data={sorted}
              columns={columns}
              keyField="id"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              selectable
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              density={density}
              isLoading={isLoading}
              emptyMessage="目前沒有符合條件的上架品項"
            />
          </div>
        </PageCard>
      </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
