'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminLayout, PageCard, Modal, SortableTableHeader, StatsCard } from '@/components'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/contexts/ToastContext'

interface ReportRow {
  machine_id: number
  machine_name: string
  machine_number: number | null
  theme_name: string | null
  is_active: boolean
  spins: number
  bet_total: number
  direct_count: number
  direct_total: number
  rush_count: number
  coin_return_total: number
  prize_count: number
  prize_value_total: number
}

interface DailyRow {
  day: string
  spins: number
  bet_total: number
  direct_count: number
  direct_total: number
  rush_count: number
  coin_return_total: number
  prize_count: number
  prize_value_total: number
}

const INPUT = 'px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm'

const taiwanToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
}

const QUICK_RANGES = [
  { label: '今日', start: () => taiwanToday(), end: () => taiwanToday() },
  { label: '昨日', start: () => daysAgo(1), end: () => daysAgo(1) },
  { label: '近 7 日', start: () => daysAgo(6), end: () => taiwanToday() },
  { label: '近 30 日', start: () => daysAgo(29), end: () => taiwanToday() },
  { label: '本月', start: () => taiwanToday().slice(0, 8) + '01', end: () => taiwanToday() },
]

const fmt = (n: number) => n.toLocaleString('zh-TW')

const revenue = (r: ReportRow | DailyRow) => r.bet_total + r.direct_total
const payout = (r: ReportRow | DailyRow) => r.coin_return_total + r.prize_value_total
const profit = (r: ReportRow | DailyRow) => revenue(r) - payout(r)
const rtp = (r: ReportRow | DailyRow) => (revenue(r) > 0 ? (payout(r) / revenue(r)) * 100 : null)

const rtpText = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)

export default function SlotReportsPage() {
  const { toast } = useToast()
  const [startDate, setStartDate] = useState(taiwanToday())
  const [endDate, setEndDate] = useState(taiwanToday())
  const [activeRange, setActiveRange] = useState('今日')
  const [rows, setRows] = useState<ReportRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hideIdle, setHideIdle] = useState(true)
  const [sortField, setSortField] = useState('machine_id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // 每日明細 modal
  const [detailMachine, setDetailMachine] = useState<ReportRow | null>(null)
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [dailyLoading, setDailyLoading] = useState(false)

  const fetchReport = useCallback(async (start: string, end: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/slot/reports?start=${start}&end=${end}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '載入失敗')
      setRows(data.report ?? [])
    } catch (e: any) {
      toast(e.message || '載入失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchReport(startDate, endDate) }, [fetchReport, startDate, endDate])

  const applyQuickRange = (label: string) => {
    const range = QUICK_RANGES.find(r => r.label === label)
    if (!range) return
    setActiveRange(label)
    setStartDate(range.start())
    setEndDate(range.end())
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const visibleRows = useMemo(() => {
    const filtered = hideIdle ? rows.filter(r => r.spins > 0 || r.direct_count > 0) : rows
    const val = (r: ReportRow): number => {
      switch (sortField) {
        case 'spins':       return r.spins
        case 'bet_total':   return r.bet_total
        case 'direct':      return r.direct_total
        case 'rush_count':  return r.rush_count
        case 'coin_return': return r.coin_return_total
        case 'prize_value': return r.prize_value_total
        case 'payout':      return payout(r)
        case 'profit':      return profit(r)
        case 'rtp':         return rtp(r) ?? -1
        default:            return r.machine_id
      }
    }
    return [...filtered].sort((a, b) => (sortDir === 'asc' ? val(a) - val(b) : val(b) - val(a)))
  }, [rows, hideIdle, sortField, sortDir])

  const totals = useMemo(() => {
    const sum = (fn: (r: ReportRow) => number) => visibleRows.reduce((acc, r) => acc + fn(r), 0)
    const rev = sum(revenue)
    const pay = sum(payout)
    return {
      spins: sum(r => r.spins),
      bet: sum(r => r.bet_total),
      directCount: sum(r => r.direct_count),
      directTotal: sum(r => r.direct_total),
      rush: sum(r => r.rush_count),
      coinReturn: sum(r => r.coin_return_total),
      prizeCount: sum(r => r.prize_count),
      prizeValue: sum(r => r.prize_value_total),
      revenue: rev,
      payout: pay,
      profit: rev - pay,
      rtp: rev > 0 ? (pay / rev) * 100 : null,
    }
  }, [visibleRows])

  const openDetail = async (row: ReportRow) => {
    setDetailMachine(row)
    setDailyLoading(true)
    try {
      const res = await fetch(`/api/admin/slot/reports?machine_id=${row.machine_id}&start=${startDate}&end=${endDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '載入失敗')
      setDaily(data.daily ?? [])
    } catch (e: any) {
      toast(e.message || '載入失敗', 'error')
      setDaily([])
    } finally {
      setDailyLoading(false)
    }
  }

  const machineLabel = (r: ReportRow) =>
    `${r.theme_name || r.machine_name}${r.machine_number ? ` #${r.machine_number}` : ''}`

  return (
    <AdminLayout pageTitle="機台報表">
      <div className="space-y-4">
        {/* 日期範圍 */}
        <PageCard>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_RANGES.map(r => (
              <button
                key={r.label}
                onClick={() => applyQuickRange(r.label)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  activeRange === r.label
                    ? 'bg-primary text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {r.label}
              </button>
            ))}
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setActiveRange('') }}
                className={INPUT}
              />
              <span className="text-neutral-400 text-sm">~</span>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setActiveRange('') }}
                className={INPUT}
              />
            </div>
          </div>
        </PageCard>

        {/* 彙總卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="總營收" value={fmt(totals.revenue)} unit="G" subtitle={`投注 ${fmt(totals.bet)} + 直衝 ${fmt(totals.directTotal)}`} />
          <StatsCard title="總派彩" value={fmt(totals.payout)} unit="G" subtitle={`退幣 ${fmt(totals.coinReturn)} + 出獎價值 ${fmt(totals.prizeValue)}`} />
          <StatsCard title="毛利" value={fmt(totals.profit)} unit="G" subtitle={totals.profit >= 0 ? '平台盈餘' : '平台虧損'} />
          <StatsCard title="RTP" value={rtpText(totals.rtp)} subtitle={`轉數 ${fmt(totals.spins)}・RUSH ${fmt(totals.rush)} 次`} />
        </div>

        {/* 機台明細表 */}
        <PageCard>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-neutral-500">點機台列可看每日明細。出獎價值以品項回收價計算。</p>
            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hideIdle}
                onChange={e => setHideIdle(e.target.checked)}
                className="rounded border-neutral-300"
              />
              隱藏無交易機台
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <SortableTableHeader sortKey="machine_id" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort}>機台</SortableTableHeader>
                  <SortableTableHeader sortKey="spins" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="text-right">轉數</SortableTableHeader>
                  <SortableTableHeader sortKey="bet_total" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="text-right">投注額</SortableTableHeader>
                  <SortableTableHeader sortKey="direct" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="text-right">直衝</SortableTableHeader>
                  <SortableTableHeader sortKey="rush_count" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="text-right">RUSH</SortableTableHeader>
                  <SortableTableHeader sortKey="coin_return" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="text-right">退幣</SortableTableHeader>
                  <SortableTableHeader sortKey="prize_value" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="text-right">出獎</SortableTableHeader>
                  <SortableTableHeader sortKey="profit" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="text-right">毛利</SortableTableHeader>
                  <SortableTableHeader sortKey="rtp" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="text-right">RTP</SortableTableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {isLoading ? (
                  <tr><td colSpan={9} className="py-10 text-center text-neutral-400">載入中…</td></tr>
                ) : visibleRows.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-neutral-400">此區間沒有機台交易紀錄</td></tr>
                ) : (
                  visibleRows.map(r => (
                    <tr
                      key={r.machine_id}
                      onClick={() => openDetail(r)}
                      className="hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-800">{machineLabel(r)}</span>
                          {!r.is_active && <Badge color="gray">下架</Badge>}
                        </div>
                        <div className="text-xs text-neutral-400">ID {r.machine_id}</div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">{fmt(r.spins)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{fmt(r.bet_total)}G</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {r.direct_count > 0 ? `${r.direct_count} 次 / ${fmt(r.direct_total)}G` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">{fmt(r.rush_count)} 次</td>
                      <td className="py-3 px-4 text-right tabular-nums">{fmt(r.coin_return_total)}G</td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {r.prize_count > 0 ? `${r.prize_count} 件 / ${fmt(r.prize_value_total)}G` : '—'}
                      </td>
                      <td className={`py-3 px-4 text-right tabular-nums font-medium ${profit(r) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(profit(r))}G
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">{rtpText(rtp(r))}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {!isLoading && visibleRows.length > 0 && (
                <tfoot>
                  <tr className="bg-neutral-50 border-t border-neutral-200 font-medium">
                    <td className="py-3 px-4 text-neutral-800">合計（{visibleRows.length} 台）</td>
                    <td className="py-3 px-4 text-right tabular-nums">{fmt(totals.spins)}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{fmt(totals.bet)}G</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {totals.directCount > 0 ? `${totals.directCount} 次 / ${fmt(totals.directTotal)}G` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">{fmt(totals.rush)} 次</td>
                    <td className="py-3 px-4 text-right tabular-nums">{fmt(totals.coinReturn)}G</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {totals.prizeCount > 0 ? `${totals.prizeCount} 件 / ${fmt(totals.prizeValue)}G` : '—'}
                    </td>
                    <td className={`py-3 px-4 text-right tabular-nums ${totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(totals.profit)}G
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">{rtpText(totals.rtp)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </PageCard>
      </div>

      {/* 每日明細 */}
      <Modal
        isOpen={!!detailMachine}
        onClose={() => setDetailMachine(null)}
        title={detailMachine ? `${machineLabel(detailMachine)}｜每日明細（${startDate} ~ ${endDate}）` : ''}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="py-2 px-3 text-left text-xs font-semibold text-neutral-500">日期</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">轉數</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">投注額</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">直衝</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">RUSH</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">退幣</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">出獎</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">毛利</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-500">RTP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {dailyLoading ? (
                <tr><td colSpan={9} className="py-8 text-center text-neutral-400">載入中…</td></tr>
              ) : daily.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-neutral-400">此區間沒有交易紀錄</td></tr>
              ) : (
                daily.map(d => (
                  <tr key={d.day} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-2 px-3 tabular-nums">{d.day}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(d.spins)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(d.bet_total)}G</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {d.direct_count > 0 ? `${d.direct_count} 次 / ${fmt(d.direct_total)}G` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(d.rush_count)} 次</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(d.coin_return_total)}G</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {d.prize_count > 0 ? `${d.prize_count} 件 / ${fmt(d.prize_value_total)}G` : '—'}
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums font-medium ${profit(d) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(profit(d))}G
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{rtpText(rtp(d))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </AdminLayout>
  )
}
