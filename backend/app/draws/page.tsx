'use client'

import { AdminLayout, PageCard, SearchToolbar, DataTable, FilterTags, DateRangePicker, type Column } from '@/components'
import Badge from '@/components/ui/Badge'
import MemberNo from '@/components/MemberNo'
import { userMatches } from '@/lib/userSearch'
import { realEmail } from '@/lib/syntheticEmail'
import { useState, useEffect, useMemo } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { formatDateTime } from '@/utils/dateFormat'
import { logExport } from '@/lib/logExport'

interface DrawRecord {
  id: number
  user_id: string
  product_id: number
  prize_level: string
  prize_name: string
  created_at: string
  ticket_number: number
  status: string
  points_used?: number
  /** 這一抽實際收的 G（促銷/優惠券折抵後；migration 512）。舊資料 null → fallback 單價 */
  tokens_spent?: number | null
  user?: { name: string; email: string; id: string; member_no?: number | null }
  product?: { name: string; image_url: string; price?: number; type?: string; cards_per_pack?: number | null }
  /** 品項（轉蛋紀錄的 prize_name/prize_level 快照為空，靠這個 join 補） */
  prize?: { name: string; level: string } | null
  slot_log?: {
    bet: number
    kind: string
    machine?: { machine_number: number | null; theme?: { name: string } | null } | null
  }[]
}

/** 一次交易（同用戶＋同商品＋同秒寫入的多筆抽獎合併） */
interface DrawTx {
  key: string
  id: number
  created_at: string
  user?: DrawRecord['user']
  product?: DrawRecord['product']
  records: DrawRecord[]
  /** draw_records 筆數（抽卡商品是「張數」） */
  count: number
  /** 玩家實際買了幾次（抽卡商品是「包數」，其他商品等於 count） */
  units: number
  /** 一包幾張；非抽卡商品為 1 */
  packSize: number
  cost: number
  pointsUsed: number
  promoDiscount: number
  statuses: string[]
}

/*
 * 原始狀態碼不給管理員看（跟前台不給玩家看技術術語同一個道理）。
 *
 * ⚠️ 這張表要蓋滿 draw_records_status_check 的每一個值。少一個就會 fallback 成
 * 原始代碼直接印在畫面上 —— 老闆 2026-08-31 截圖到的「coin_return」就是漏了機台
 * 那兩個狀態（那批是老虎機的紀錄，商品不在 products 表裡，之前沒人注意到）。
 */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  in_warehouse:     { label: '倉庫中',   className: 'bg-neutral-100 text-neutral-600' },
  pending_delivery: { label: '待出貨',   className: 'bg-blue-50 text-blue-700' },
  shipped:          { label: '已出貨',   className: 'bg-green-50 text-green-700' },
  dismantled:       { label: '已回收',   className: 'bg-amber-50 text-amber-700' },
  exchanged:        { label: '已兌換',   className: 'bg-purple-50 text-purple-700' },
  listing:          { label: '上架中',   className: 'bg-indigo-50 text-indigo-700' },
  // 挑戰機台（老虎機）專用。機台一定會中，結果只有兩種：退幣或實體獎品，
  // 實體那種就是 in_warehouse。消費紀錄裡機台與一番賞混在一起，
  // 標籤要帶「機台」兩個字，不然看不出這筆是哪來的
  coin_return:      { label: '機台退幣', className: 'bg-cyan-50 text-cyan-700' },
  // 抽籤販售專用（migration 444）。落選要留紀錄（查得到誰抽過幾次），但不進倉庫
  lost:             { label: '未中獎',   className: 'bg-neutral-100 text-neutral-500' },
  // 同為抽籤販售：中籤後逾期沒申請寄出
  expired:          { label: '逾期未領', className: 'bg-amber-50 text-amber-700' },
  cancelled:        { label: '已取消',   className: 'bg-red-50 text-red-600' },
  success:          { label: '成功',     className: 'bg-green-50 text-green-700' },
  failed:           { label: '失敗',     className: 'bg-red-50 text-red-600' },
}
const statusInfo = (s: string) => STATUS_LABELS[s] ?? { label: s, className: 'bg-neutral-100 text-neutral-600' }

/*
 * 篩選下拉直接從 STATUS_LABELS 產生，不要再抄一份 —— 原本那份寫死 5 個，
 * 少了退幣（459 筆）與未中獎（182 筆），那兩種紀錄篩不出來。
 * success／failed 不列：draw_records 沒有在用（是 CHECK 裡的歷史殘留）。
 */
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '全部狀態' },
  ...Object.entries(STATUS_LABELS)
    .filter(([v]) => v !== 'success' && v !== 'failed')
    .map(([value, { label }]) => ({ value, label })),
]

/*
 * 賞等徽章。機台的退幣品項 prize_level 直接存 'coin_return'，抽籤落選存「未中獎」——
 * 那兩個不是賞等，印在賞等徽章上只會讓人看不懂（老闆截圖到的黃色 coin_return 標籤）。
 */
const NON_LEVEL_VALUES = new Set(['coin_return', '未中獎', '普通', '普通款', 'Normal / Common'])

// 老虎機 spin 流水（migration 390 之後才有；舊紀錄無法回溯）
const slotLogOf = (r: DrawRecord) => r.slot_log?.[0] ?? null
const slotMachineLabel = (r: DrawRecord) => {
  const log = slotLogOf(r)
  if (!log) return null
  const theme = log.machine?.theme?.name || '挑戰機台'
  return log.machine?.machine_number ? `${theme} ${log.machine.machine_number}號機` : theme
}

/** 這一抽實收：老虎機看 bet；一般抽獎看 tokens_spent（舊資料 fallback 單價） */
const recordCost = (r: DrawRecord) =>
  slotLogOf(r)?.bet ?? r.tokens_spent ?? r.product?.price ?? 0

/*
 * 抽卡商品一「抽」是一整包：一包 cards_per_pack 張、每張各寫一筆 draw_records，
 * 但只有第一張帶 tokens_spent（整包的價錢），其餘幾張是 0。
 * 所以筆數 ≠ 抽數，拿「筆數 × 單價」當定價會憑空多出折扣 ——
 * 老闆 2026-09-04 截圖到的「共 50 抽 5,500 G 已折 22,000」其實是 10 包 × 550，沒有任何促銷。
 */
const packSizeOf = (p?: DrawRecord['product']) =>
  p?.type === 'card' && (p.cards_per_pack ?? 0) > 1 ? (p.cards_per_pack as number) : 1

export default function DrawsPage() {
  const [records, setRecords] = useState<DrawRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [expandedIds, setExpandedIds] = useState<Set<number | string>>(new Set())
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('draws', 'compact', {
    created_at: true, memberNo: true, user: true, product: true, count: true, cost: true, status: true
  })

  // 篩選與欄位顯示狀態
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedPrizeLevel, setSelectedPrizeLevel] = useState<string>('all')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/draw-records', { method: 'GET', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || res.statusText || '載入失敗')
      }
      const data = (await res.json()) as DrawRecord[]
      setRecords(data || [])
    } catch (error) {
      console.error('Error fetching draw records:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredRecords = useMemo(() => {
    let result = records
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        userMatches(q, r.user) ||
        r.product?.name?.toLowerCase().includes(q) ||
        slotMachineLabel(r)?.toLowerCase().includes(q) ||
        String(r.ticket_number).includes(q)
      )
    }

    // 狀態過濾
    if (selectedStatus !== 'all') {
      result = result.filter(r => r.status === selectedStatus)
    }

    // 賞品等級過濾
    if (selectedPrizeLevel !== 'all') {
      result = result.filter(r => r.prize_level === selectedPrizeLevel)
    }

    // 時間範圍過濾
    if (filterStartDate) {
      result = result.filter(r => r.created_at >= filterStartDate)
    }
    if (filterEndDate) {
      // 結束日期包含當天
      const endDate = new Date(filterEndDate)
      endDate.setDate(endDate.getDate() + 1)
      result = result.filter(r => new Date(r.created_at) < endDate)
    }

    return result
  }, [records, searchQuery, selectedStatus, selectedPrizeLevel, filterStartDate, filterEndDate])

  // 合併成交易：同用戶＋同商品＋同一時間戳（同交易 now() 相同）視為一次購買。
  // 消費金額用每筆實收加總 —— 買五送一 4筆150＋1筆0 = 600，跟前台用戶看到的一致
  const transactions = useMemo<DrawTx[]>(() => {
    const map = new Map<string, DrawTx>()
    for (const r of filteredRecords) {
      const key = `${r.user_id}|${r.product_id}|${r.created_at}|${slotLogOf(r) ? r.id : 'tx'}`
      let tx = map.get(key)
      if (!tx) {
        tx = {
          key, id: r.id, created_at: r.created_at,
          user: r.user, product: r.product,
          records: [], count: 0, units: 0, packSize: 1, cost: 0, pointsUsed: 0, promoDiscount: 0, statuses: [],
        }
        map.set(key, tx)
      }
      tx.records.push(r)
      tx.count += 1
      tx.cost += recordCost(r)
      tx.pointsUsed += r.points_used || 0
      tx.id = Math.min(tx.id, r.id)
      if (!tx.statuses.includes(r.status)) tx.statuses.push(r.status)
    }
    for (const tx of map.values()) {
      tx.records.sort((a, b) => a.id - b.id)
      // 抽卡：筆數換算成包數。cards_per_pack 沒設的抽卡商品退而用「有收錢的筆數」當包數
      //（促銷送整包的那種會少算一包 —— 寧可漏標折扣，不要誤標）
      tx.packSize = packSizeOf(tx.product)
      tx.units = tx.packSize > 1
        ? Math.max(1, Math.round(tx.count / tx.packSize))
        : tx.product?.type === 'card'
          ? Math.max(1, tx.records.filter(r => recordCost(r) > 0).length)
          : tx.count
      // 有促銷/優惠券折抵時（實收 < 單價×抽數）標出折了多少
      const nominal = (tx.product?.price ?? 0) * tx.units
      const isSlot = tx.records.some(r => slotLogOf(r))
      if (!isSlot && tx.pointsUsed === 0 && nominal > tx.cost) tx.promoDiscount = nominal - tx.cost
    }
    return [...map.values()]
  }, [filteredRecords])

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        case 'user':
          aValue = a.user?.name || ''
          bValue = b.user?.name || ''
          break
        case 'product':
          aValue = a.product?.name || ''
          bValue = b.product?.name || ''
          break
        case 'cost':
          aValue = a.cost
          bValue = b.cost
          break
        case 'count':
          aValue = a.units
          bValue = b.units
          break
        default:
          aValue = a.id
          bValue = b.id
      }

      if (typeof aValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
  }, [transactions, sortField, sortDirection])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const formatDrawId = (id: number, dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const year = d.getFullYear().toString().slice(-2);
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      // Generate pseudo-random 4 digits from ID (stable)
      const suffix = ((id * 1367) % 10000).toString().padStart(4, '0');
      return `TX${year}${month}${day}${suffix}`;
    } catch (e) {
      return `TX${id}`;
    }
  };

  const columns: Column<DrawTx>[] = [
    {
      key: 'id',
      label: '編號',
      render: (tx) => <span className="text-xs font-mono font-bold text-neutral-600 bg-neutral-100 px-2 py-1 rounded">{formatDrawId(tx.id, tx.created_at)}</span>
    },
    {
      key: 'created_at',
      label: '時間',
      sortable: true,
      render: (tx) => <span className="text-neutral-500 font-mono whitespace-nowrap">{formatDateTime(tx.created_at)}</span>
    },
    /* 會員編號｜暱稱 兩欄（老闆 2026-09-04）：編號獨立一欄才對得齊、點了直接進會員詳情；信箱只在會員管理看 */
    {
      key: 'memberNo',
      label: '會員編號',
      render: (tx) => <MemberNo no={tx.user?.member_no} uuid={tx.user?.id} />
    },
    {
      key: 'user',
      label: '暱稱',
      sortable: true,
      render: (tx) => <span className="font-medium text-neutral-900">{tx.user?.name || '未知用戶'}</span>
    },
    {
      key: 'product',
      label: '商品',
      sortable: true,
      render: (tx) => (
        <div className="flex items-center gap-2">
          {tx.product?.image_url && (
            <img src={tx.product.image_url} alt="" className="w-8 h-8 rounded object-contain" />
          )}
          <span className="truncate max-w-[200px]" title={tx.product?.name}>{slotMachineLabel(tx.records[0]) || tx.product?.name || '未知商品'}</span>
        </div>
      )
    },
    {
      key: 'count',
      label: '抽數',
      sortable: true,
      render: (tx) => (
        <span className="tabular-nums text-neutral-700 whitespace-nowrap">
          共 {tx.units} 抽
          {tx.units !== tx.count && <span className="ml-1 text-xs text-neutral-400">{tx.count} 張</span>}
        </span>
      )
    },
    {
      key: 'cost',
      label: '消費',
      sortable: true,
      render: (tx) => (
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums font-medium text-neutral-800">
            {tx.pointsUsed > 0 ? `${(tx.pointsUsed * 4).toLocaleString()} 積分` : `${tx.cost.toLocaleString()} G`}
          </span>
          {tx.promoDiscount > 0 && (
            <Badge variant="danger" size="sm">已折 {tx.promoDiscount.toLocaleString()}</Badge>
          )}
        </div>
      )
    },
    {
      key: 'status',
      label: '狀態',
      render: (tx) => (
        <div className="flex flex-wrap gap-1">
          {tx.statuses.map(s => {
            const info = statusInfo(s)
            return <span key={s} className={`px-2 py-1 rounded text-xs ${info.className}`}>{info.label}</span>
          })}
        </div>
      )
    }
  ]

  // 展開明細：逐筆籤號／品項／實收，稽核與客訴查證用
  const renderExpanded = (tx: DrawTx) => (
    <div className="px-4 py-3 bg-neutral-50">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-400">
            <th className="py-1.5 pr-4 font-medium">籤號</th>
            <th className="py-1.5 pr-4 font-medium">品項</th>
            <th className="py-1.5 pr-4 font-medium text-right">消費(G)</th>
            <th className="py-1.5 font-medium">狀態</th>
          </tr>
        </thead>
        <tbody>
          {tx.records.map(r => {
            const cost = recordCost(r)
            const info = statusInfo(r.status)
            // 快照欄位（prize_level/prize_name）轉蛋紀錄是空的，fallback 到品項 join；
            // 等級統一「一般版」（migration 514），空值/舊髒值一律顯示一般版
            const prizeName = r.prize_name || r.prize?.name || '—'
            const rawLevel = (r.prize_level || r.prize?.level || '').trim()
            // 機台的退幣／未中獎沒有賞等可言，整顆徽章不要畫
            const level = NON_LEVEL_VALUES.has(rawLevel) || !rawLevel || rawLevel === prizeName
              ? (rawLevel === 'coin_return' || rawLevel === '未中獎' ? null : '一般版')
              : rawLevel
            return (
              <tr key={r.id} className="border-t border-neutral-200/70">
                <td className="py-1.5 pr-4 font-mono text-neutral-600">{r.ticket_number}</td>
                <td className="py-1.5 pr-4">
                  <div className="flex items-center gap-1.5">
                    {level && <Badge variant="warning" size="sm">{level}</Badge>}
                    <span className="text-neutral-700">{prizeName}</span>
                  </div>
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-neutral-600">
                  {r.points_used ? `${(r.points_used * 4).toLocaleString()} 積分` : cost.toLocaleString()}
                  {/* 抽卡同一包的其他幾張本來就是 0，不是贈品 */}
                  {!r.points_used && cost === 0 && (
                    tx.packSize > 1
                      ? <span className="ml-1 text-xs text-neutral-400">（同包）</span>
                      : <span className="ml-1 text-xs text-red-500">（促銷贈送）</span>
                  )}
                </td>
                <td className="py-1.5">
                  <span className={`px-2 py-0.5 rounded text-xs ${info.className}`}>{info.label}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const handleExportCSV = () => {
    const BOM = '﻿'
    const headers = ['交易編號', '時間', '會員編號', '暱稱', '商品', '賞等', '品項名稱', '籤號', '消費(G)', '狀態']
    const rows = sortedTransactions.flatMap(tx => tx.records.map(r => [
      formatDrawId(tx.id, tx.created_at),
      formatDateTime(r.created_at),
      r.user?.member_no ? String(r.user.member_no) : '',
      r.user?.name || '',
      slotMachineLabel(r) || r.product?.name || '',
      r.prize_level || r.prize?.level || '一般版',
      r.prize_name || r.prize?.name || '',
      String(r.ticket_number ?? ''),
      String(r.points_used ? `${r.points_used * 4}積分` : recordCost(r)),
      statusInfo(r.status).label,
    ]))
    const csv = BOM + [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `抽獎紀錄_${new Date().toISOString().split('T')[0]}.csv`
    void logExport('抽獎紀錄', `抽獎紀錄_${new Date().toISOString().split('T')[0]}.csv`)
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoadMore = () => {
    setIsLoadingMore(true)
    setTimeout(() => {
      setDisplayCount(prev => prev + 20)
      setIsLoadingMore(false)
    }, 500)
  }

  return (
    <AdminLayout pageTitle="抽獎紀錄">
      <div className="space-y-6">
        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋用戶、商品、籤號..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showExportCSV={true}
            onExportCSV={handleExportCSV}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showFilter={true}
            filterOptions={[
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                value: selectedStatus,
                onChange: setSelectedStatus,
                options: STATUS_FILTER_OPTIONS
              },
              {
                key: 'prize_level',
                label: '賞品等級',
                type: 'select',
                value: selectedPrizeLevel,
                onChange: setSelectedPrizeLevel,
                options: [
                  { value: 'all', label: '全部等級' },
                  { value: 'A', label: 'A賞' },
                  { value: 'B', label: 'B賞' },
                  { value: 'C', label: 'C賞' },
                  { value: 'D', label: 'D賞' },
                  { value: 'E', label: 'E賞' },
                  { value: 'F', label: 'F賞' },
                  { value: 'G', label: 'G賞' },
                  { value: 'H', label: 'H賞' },
                  { value: 'LAST', label: 'Last賞' }
                ]
              },
              {
                key: 'date',
                label: '抽獎時間',
                type: 'date-range',
                startDate: filterStartDate,
                endDate: filterEndDate,
                render: () => (
                  <DateRangePicker
                    startDate={filterStartDate}
                    endDate={filterEndDate}
                    onStartDateChange={setFilterStartDate}
                    onEndDateChange={setFilterEndDate}
                    placeholder="選擇時間範圍"
                  />
                )
              }
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'created_at', label: '時間', visible: visibleColumns.created_at },
              { key: 'memberNo', label: '會員編號', visible: visibleColumns.memberNo },
              { key: 'user', label: '暱稱', visible: visibleColumns.user },
              { key: 'product', label: '商品', visible: visibleColumns.product },
              { key: 'count', label: '抽數', visible: visibleColumns.count },
              { key: 'cost', label: '消費', visible: visibleColumns.cost },
              { key: 'status', label: '狀態', visible: visibleColumns.status }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
          />

          <FilterTags
            tags={[
              ...(selectedStatus !== 'all' ? [{
                key: 'status',
                label: '狀態',
                value: statusInfo(selectedStatus).label,
                color: 'primary' as const,
                onRemove: () => setSelectedStatus('all')
              }] : []),
              ...(selectedPrizeLevel !== 'all' ? [{
                key: 'prize_level',
                label: '等級',
                value: selectedPrizeLevel + '賞',
                color: 'yellow' as const,
                onRemove: () => setSelectedPrizeLevel('all')
              }] : []),
              ...((filterStartDate || filterEndDate) ? [{
                key: 'date',
                label: '時間',
                value: `${filterStartDate || '起始'} - ${filterEndDate || '結束'}`,
                color: 'blue' as const,
                onRemove: () => { setFilterStartDate(''); setFilterEndDate('') }
              }] : [])
            ]}
            onClearAll={() => {
              setSelectedStatus('all')
              setSelectedPrizeLevel('all')
              setFilterStartDate('')
              setFilterEndDate('')
            }}
          />

          <div className="mt-4">
            <DataTable
              data={sortedTransactions}
              columns={columns}
              keyField="key"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              density={tableDensity}
              displayCount={displayCount}
              onLoadMore={handleLoadMore}
              enableInfiniteScroll={true}
              isLoadingMore={isLoadingMore}
              totalCount={sortedTransactions.length}
              visibleColumns={visibleColumns}
              emptyMessage="無相關紀錄"
              isLoading={isLoading}
              expandable={true}
              expandedIds={expandedIds}
              onExpandChange={setExpandedIds}
              renderExpanded={renderExpanded}
            />
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
