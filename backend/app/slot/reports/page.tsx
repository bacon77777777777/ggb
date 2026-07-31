'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminLayout, PageCard, Modal, SortableTableHeader, DateRangePicker } from '@/components'
import Badge from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
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

const fmt = (n: number) => n.toLocaleString('zh-TW')

const revenue = (r: ReportRow | DailyRow) => r.bet_total + r.direct_total
const payout = (r: ReportRow | DailyRow) => r.coin_return_total + r.prize_value_total
const profit = (r: ReportRow | DailyRow) => revenue(r) - payout(r)
const rtp = (r: ReportRow | DailyRow) => (revenue(r) > 0 ? (payout(r) / revenue(r)) * 100 : null)
const rtpText = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)

// ── KPI 卡片（同對帳報表頁樣式）──────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-neutral-900' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿'
  const content = bom + [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function SlotReportsPage() {
  const { toast } = useToast()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hideIdle, setHideIdle] = useState(true)
  const [sortField, setSortField] = useState('machine_id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // 每日明細 modal
  const [detailMachine, setDetailMachine] = useState<ReportRow | null>(null)
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [dailyLoading, setDailyLoading] = useState(false)

  // 預設本月（同其他報表頁）
  useEffect(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    setStart(`${y}-${m}-01`)
    setEnd(`${y}-${m}-${String(now.getDate()).padStart(2, '0')}`)
  }, [])

  const fetchReport = useCallback(async () => {
    if (!start || !end) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/slot/reports?start=${start}&end=${end}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '載入失敗')
      setRows(data.report ?? [])
    } catch (e: any) {
      toast(e.message || '載入失敗', 'error')
    } finally {
      setLoading(false)
    }
  }, [start, end, toast])

  useEffect(() => { fetchReport() }, [fetchReport])

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

  const machineLabel = (r: ReportRow) =>
    `${r.theme_name || r.machine_name}${r.machine_number ? ` #${r.machine_number}` : ''}`

  const handleExport = () => {
    exportCSV(`機台報表_${start}_${end}.csv`,
      ['機台', '機台ID', '轉數', '投注額(G)', '直衝次數', '直衝金額(G)', 'RUSH次數', '退幣(G)', '出獎件數', '出獎價值(G)', '毛利(G)', 'RTP(%)'],
      visibleRows.map(r => [
        machineLabel(r), String(r.machine_id), String(r.spins), String(r.bet_total),
        String(r.direct_count), String(r.direct_total), String(r.rush_count),
        String(r.coin_return_total), String(r.prize_count), String(r.prize_value_total),
        String(profit(r)), rtp(r) === null ? '—' : rtp(r)!.toFixed(1),
      ])
    )
  }

  const openDetail = async (row: ReportRow) => {
    setDetailMachine(row)
    setDailyLoading(true)
    try {
      const res = await fetch(`/api/admin/slot/reports?machine_id=${row.machine_id}&start=${start}&end=${end}`)
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

  return (
    <AdminLayout pageTitle="機台報表">
      <div className="space-y-4">
        {/* 工具列 — 靠右對齊，同對帳報表風格 */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <DateRangePicker startDate={start} endDate={end} onStartDateChange={setStart} onEndDateChange={setEnd} placeholder="選擇日期範圍" />
          <button onClick={handleExport} disabled={visibleRows.length === 0}
            className="h-9 px-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-neutral-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            匯出 CSV
          </button>
        </div>

        {/* KPI 小卡 */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="總營收" value={`${fmt(totals.revenue)} G`} sub={`投注 ${fmt(totals.bet)} + 直衝 ${fmt(totals.directTotal)}`} color="text-green-600" />
            <KpiCard label="總派彩" value={`${fmt(totals.payout)} G`} sub={`退幣 ${fmt(totals.coinReturn)} + 出獎價值 ${fmt(totals.prizeValue)}`} color="text-orange-500" />
            <KpiCard label="毛利" value={`${fmt(totals.profit)} G`} sub={totals.profit >= 0 ? '平台盈餘' : '平台虧損'} color={totals.profit >= 0 ? 'text-primary' : 'text-red-600'} />
            <KpiCard label="RTP" value={rtpText(totals.rtp)} sub={`轉數 ${fmt(totals.spins)}・RUSH ${fmt(totals.rush)} 次`} color="text-indigo-600" />
          </div>
        )}

        {/* 機台明細表 */}
        <PageCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-neutral-900">機台明細</h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-neutral-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideIdle}
                  onChange={e => setHideIdle(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                隱藏無交易機台
              </label>
              <span className="text-sm text-neutral-500">共 {visibleRows.length} 台</span>
            </div>
          </div>
          {loading ? (
            <CardSkeleton rows={5} />
          ) : visibleRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-400">此區間無機台交易紀錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <SortableTableHeader sortKey="machine_id" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">機台</SortableTableHeader>
                    <SortableTableHeader sortKey="spins" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">轉數</SortableTableHeader>
                    <SortableTableHeader sortKey="bet_total" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">投注額</SortableTableHeader>
                    <SortableTableHeader sortKey="direct" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">直衝</SortableTableHeader>
                    <SortableTableHeader sortKey="rush_count" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">RUSH</SortableTableHeader>
                    <SortableTableHeader sortKey="coin_return" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">退幣</SortableTableHeader>
                    <SortableTableHeader sortKey="prize_value" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">出獎</SortableTableHeader>
                    <SortableTableHeader sortKey="profit" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">毛利</SortableTableHeader>
                    <SortableTableHeader sortKey="rtp" currentSortField={sortField} sortDirection={sortDir} onSort={handleSort} className="py-3 px-4">RTP</SortableTableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {visibleRows.map(r => (
                    <tr
                      key={r.machine_id}
                      onClick={() => openDetail(r)}
                      className="hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-900">{machineLabel(r)}</span>
                          {!r.is_active && <Badge color="gray">下架</Badge>}
                        </div>
                        <div className="text-xs text-neutral-400">ID {r.machine_id}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{fmt(r.spins)}</td>
                      <td className="px-4 py-3 tabular-nums">{fmt(r.bet_total)} G</td>
                      <td className="px-4 py-3 tabular-nums text-neutral-600 whitespace-nowrap">
                        {r.direct_count > 0 ? `${r.direct_count} 次 / ${fmt(r.direct_total)} G` : '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{fmt(r.rush_count)} 次</td>
                      <td className="px-4 py-3 tabular-nums">{fmt(r.coin_return_total)} G</td>
                      <td className="px-4 py-3 tabular-nums text-neutral-600 whitespace-nowrap">
                        {r.prize_count > 0 ? `${r.prize_count} 件 / ${fmt(r.prize_value_total)} G` : '—'}
                      </td>
                      <td className={`px-4 py-3 tabular-nums font-semibold ${profit(r) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(profit(r))} G
                      </td>
                      <td className="px-4 py-3 tabular-nums">{rtpText(rtp(r))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-neutral-50 border-t border-neutral-200">
                  <tr>
                    <td className="px-4 py-2 text-sm font-semibold text-neutral-700">合計（{visibleRows.length} 台）</td>
                    <td className="px-4 py-2 font-bold tabular-nums">{fmt(totals.spins)}</td>
                    <td className="px-4 py-2 font-bold tabular-nums">{fmt(totals.bet)} G</td>
                    <td className="px-4 py-2 font-bold tabular-nums whitespace-nowrap">
                      {totals.directCount > 0 ? `${totals.directCount} 次 / ${fmt(totals.directTotal)} G` : '—'}
                    </td>
                    <td className="px-4 py-2 font-bold tabular-nums">{fmt(totals.rush)} 次</td>
                    <td className="px-4 py-2 font-bold tabular-nums">{fmt(totals.coinReturn)} G</td>
                    <td className="px-4 py-2 font-bold tabular-nums whitespace-nowrap">
                      {totals.prizeCount > 0 ? `${totals.prizeCount} 件 / ${fmt(totals.prizeValue)} G` : '—'}
                    </td>
                    <td className={`px-4 py-2 font-bold tabular-nums ${totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(totals.profit)} G
                    </td>
                    <td className="px-4 py-2 font-bold tabular-nums">{rtpText(totals.rtp)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </PageCard>

        <p className="text-xs text-neutral-400">點機台列可看每日明細。出獎價值以品項回收價計算；毛利 = 投注 + 直衝 − 退幣 − 出獎價值。</p>
      </div>

      {/* 每日明細 */}
      <Modal
        isOpen={!!detailMachine}
        onClose={() => setDetailMachine(null)}
        title={detailMachine ? `${machineLabel(detailMachine)}｜每日明細（${start} ~ ${end}）` : ''}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                {['日期', '轉數', '投注額', '直衝', 'RUSH', '退幣', '出獎', '毛利', 'RTP'].map(h => (
                  <th key={h} className="py-2 px-3 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                ))}
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
                    <td className="py-2 px-3 font-mono text-xs">{d.day}</td>
                    <td className="py-2 px-3 tabular-nums">{fmt(d.spins)}</td>
                    <td className="py-2 px-3 tabular-nums">{fmt(d.bet_total)} G</td>
                    <td className="py-2 px-3 tabular-nums whitespace-nowrap">
                      {d.direct_count > 0 ? `${d.direct_count} 次 / ${fmt(d.direct_total)} G` : '—'}
                    </td>
                    <td className="py-2 px-3 tabular-nums">{fmt(d.rush_count)} 次</td>
                    <td className="py-2 px-3 tabular-nums">{fmt(d.coin_return_total)} G</td>
                    <td className="py-2 px-3 tabular-nums whitespace-nowrap">
                      {d.prize_count > 0 ? `${d.prize_count} 件 / ${fmt(d.prize_value_total)} G` : '—'}
                    </td>
                    <td className={`py-2 px-3 tabular-nums font-semibold ${profit(d) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(profit(d))} G
                    </td>
                    <td className="py-2 px-3 tabular-nums">{rtpText(rtp(d))}</td>
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
