'use client'

/**
 * 交易所交易紀錄
 *
 * 一筆成交同時動三方帳：買家 −售價、賣家 +實收、平台收手續費。
 * 這三個數字全部由 DB 的 buy_listing 在同一個交易裡寫死（migration 488），
 * 這頁只是把它讀出來 —— **不要在前端重算手續費**，設定改過之後舊單的費率不同，
 * 重算會跟 token_ledger 對不起來。
 *
 * 手續費是平台唯一從交易所賺到的東西，所以「手續費收入」放第一張卡。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AdminLayout, PageCard, SearchToolbar, StatsCard, DataTable, MemberNo, FilterTags } from '@/components'
import type { Column } from '@/components'
import { Badge, Button } from '@/components/ui'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'

interface Deal {
  id: number
  listing_id: number | null
  price: number
  fee: number
  seller_receive: number
  created_at: string
  buyer_id: string
  buyer_name: string
  buyer_email: string
  buyer_member_no: number | null
  buyer_is_bot: boolean
  seller_id: string
  seller_name: string
  seller_email: string
  seller_member_no: number | null
  seller_is_bot: boolean
  prize_name: string
  prize_level: string
  prize_image: string | null
  product_name: string
}

type BotFilter = 'all' | 'real' | 'bot'

/** 台灣時間的今天／N 天前，用來當日期輸入框的預設值 */
const twDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d)
}

export default function MarketplaceTransactionsPage() {
  const { toast } = useToast()

  const [deals, setDeals] = useState<Deal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [from, setFrom] = useState(twDate(-29))
  const [to, setTo] = useState(twDate())
  const [searchQuery, setSearchQuery] = useState('')
  const [botFilter, setBotFilter] = useState<BotFilter>('all')
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [density, setDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact')

  const fetchDeals = useCallback(async () => {
    try {
      setIsLoading(true)
      const qs = new URLSearchParams()
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      const res = await fetch(`/api/admin/marketplace/transactions?${qs}`, { credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '載入失敗')
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (await res.json()) as any[]
      setDeals((rows || []).map((r) => ({
        id: r.id,
        listing_id: r.listing_id ?? null,
        price: r.price,
        fee: r.fee,
        seller_receive: r.seller_receive,
        created_at: r.created_at,
        buyer_id: r.buyer?.id || r.buyer_id,
        buyer_name: r.buyer?.name || '未知會員',
        buyer_email: r.buyer?.email || '',
        buyer_member_no: r.buyer?.member_no ?? null,
        buyer_is_bot: !!r.buyer?.is_bot,
        seller_id: r.seller?.id || r.seller_id,
        seller_name: r.seller?.name || '未知會員',
        seller_email: r.seller?.email || '',
        seller_member_no: r.seller?.member_no ?? null,
        seller_is_bot: !!r.seller?.is_bot,
        prize_name: r.draw_records?.product_prizes?.name || '未知獎項',
        prize_level: r.draw_records?.product_prizes?.level || '',
        prize_image: r.draw_records?.product_prizes?.image_url || null,
        product_name: r.draw_records?.products?.name || '',
      })))
    } catch (e) {
      toast(e instanceof Error ? e.message : '載入失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [from, to, toast])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  const handleSort = (field: string) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDirection('asc') }
  }

  const filtered = useMemo(() => deals.filter((d) => {
    // 機器人篩選看的是「雙方都不是機器人」—— 只要有一邊是，這筆就不是真實市場成交
    if (botFilter === 'real' && (d.buyer_is_bot || d.seller_is_bot)) return false
    if (botFilter === 'bot' && !(d.buyer_is_bot || d.seller_is_bot)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const hay = [d.prize_name, d.product_name, d.buyer_name, d.seller_name,
        d.buyer_email, d.seller_email, d.buyer_id, d.seller_id, String(d.id), String(d.listing_id)]
        .join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [deals, searchQuery, botFilter])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let av: any, bv: any
    switch (sortField) {
      case 'created_at': av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); break
      case 'price': av = a.price; bv = b.price; break
      case 'fee': av = a.fee; bv = b.fee; break
      case 'prize': av = a.prize_name; bv = b.prize_name; break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      default: av = (a as any)[sortField]; bv = (b as any)[sortField]
    }
    if (typeof av === 'string') return sortDirection === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDirection === 'asc' ? av - bv : bv - av
  }), [filtered, sortField, sortDirection])

  const sum = (pick: (d: Deal) => number) => filtered.reduce((n, d) => n + pick(d), 0)
  const gmv = sum(d => d.price)
  const feeTotal = sum(d => d.fee)
  const avgPrice = filtered.length ? Math.round(gmv / filtered.length) : 0

  const exportCSV = () => {
    const head = ['成交編號', '成交時間', '上架編號', '賞等', '獎項', '來源商品', '售價(G)', '手續費(G)', '賣家實收(G)', '買家', '賣家']
    const rows = sorted.map(d => [
      d.id, formatDateTime(d.created_at), d.listing_id ?? '', d.prize_level, d.prize_name, d.product_name,
      d.price, d.fee, d.seller_receive, d.buyer_name, d.seller_name,
    ])
    const csv = [head, ...rows]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `交易所成交_${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns: Column<Deal>[] = [
    {
      key: 'created_at', label: '成交時間', sortable: true,
      render: (d) => <span className="whitespace-nowrap text-sm text-neutral-600">{formatDateTime(d.created_at)}</span>,
    },
    {
      key: 'prize', label: '獎項', sortable: true,
      render: (d) => (
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
            {d.prize_image && <Image src={d.prize_image} alt="" fill sizes="44px" className="object-contain" unoptimized />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {d.prize_level && <Badge variant="warning" size="sm">{d.prize_level}</Badge>}
              <span className="truncate text-sm font-medium text-neutral-900">{d.prize_name}</span>
            </div>
            <div className="truncate text-xs text-neutral-500">{d.product_name}</div>
          </div>
        </div>
      ),
    },
    /* 三個金額各自一欄、一律黑字（老闆 2026-09-02：後台是給管理員看的）；
       手續費是平台唯一從交易所賺到的東西，放最右邊壓軸 */
    {
      key: 'price', label: '售價(G)', sortable: true,
      render: (d) => (
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-neutral-900">{d.price.toLocaleString()}</span>
      ),
    },
    {
      key: 'seller_receive', label: '賣家實收(G)', sortable: true,
      render: (d) => (
        <span className="whitespace-nowrap text-sm tabular-nums text-neutral-900">{d.seller_receive.toLocaleString()}</span>
      ),
    },
    {
      key: 'buyer', label: '買家',
      render: (d) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-neutral-900">{d.buyer_name}</span>
            {d.buyer_is_bot && <Badge variant="default" size="sm">機器人</Badge>}
          </div>
          <div className="truncate text-xs text-neutral-500">
            {d.buyer_email || <MemberNo no={d.buyer_member_no} uuid={d.buyer_id} />}
          </div>
        </div>
      ),
    },
    {
      key: 'seller', label: '賣家',
      render: (d) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-neutral-900">{d.seller_name}</span>
            {d.seller_is_bot && <Badge variant="default" size="sm">機器人</Badge>}
          </div>
          <div className="truncate text-xs text-neutral-500">
            {d.seller_email || <MemberNo no={d.seller_member_no} uuid={d.seller_id} />}
          </div>
        </div>
      ),
    },
    {
      key: 'fee', label: '手續費(G)', sortable: true,
      render: (d) => (
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-neutral-900">{d.fee.toLocaleString()}</span>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="交易所交易紀錄">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatsCard title="成交筆數" value={filtered.length} />
          <StatsCard title="成交金額" value={`${gmv.toLocaleString()} G`} />
          <StatsCard title="手續費收入" value={`${feeTotal.toLocaleString()} G`} subtitle="平台實收" />
          <StatsCard title="平均成交價" value={`${avgPrice.toLocaleString()} G`} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋獎項、商品、買賣雙方名稱、Email、UUID…"
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
                key: 'range', label: '成交日期', type: 'date-range',
                startDate: from, endDate: to,
                onStartDateChange: setFrom, onEndDateChange: setTo,
              },
              {
                key: 'bot', label: '對象', type: 'select', value: botFilter,
                onChange: (v: BotFilter) => setBotFilter(v),
                options: [
                  { value: 'all', label: '全部成交' },
                  { value: 'real', label: '只看真實玩家之間' },
                  { value: 'bot', label: '只看含機器人' },
                ],
              },
            ]}
          >
            <Button variant="secondary" size="sm" onClick={fetchDeals} isLoading={isLoading}>
              重新整理
            </Button>
          </SearchToolbar>

          {botFilter !== 'all' && (
            <div className="mt-3">
              <FilterTags
                tags={[{
                  key: 'bot', label: '對象',
                  value: botFilter === 'real' ? '只看真實玩家之間' : '只看含機器人',
                  color: 'primary', onRemove: () => setBotFilter('all'),
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
              density={density}
              isLoading={isLoading}
              emptyMessage="這段期間沒有交易所成交紀錄"
            />
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
