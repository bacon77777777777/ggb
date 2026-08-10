'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminLayout, Modal, DateRangePicker, ListTableCard, RowAction, type ListColumn } from '@/components'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [idleFilter, setIdleFilter] = useState('active')

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

  const machineLabel = (r: ReportRow) =>
    `${r.theme_name || r.machine_name}${r.machine_number ? ` #${r.machine_number}` : ''}`

  const visibleRows = useMemo(() => {
    let filtered = idleFilter === 'active' ? rows.filter(r => r.spins > 0 || r.direct_count > 0) : rows
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(r =>
        machineLabel(r).toLowerCase().includes(q) || String(r.machine_id).includes(q)
      )
    }
    return filtered
  }, [rows, idleFilter, searchQuery])

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

  const columns: ListColumn<ReportRow>[] = [
    {
      key: 'machine', label: '機台',
      sortValue: r => r.machine_id,
      render: r => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900 whitespace-nowrap">{machineLabel(r)}</span>
            {!r.is_active && <Badge variant="default">下架</Badge>}
          </div>
          <div className="text-xs text-neutral-400">ID {r.machine_id}</div>
        </div>
      ),
    },
    {
      key: 'spins', label: '轉數',
      sortValue: r => r.spins,
      className: 'tabular-nums font-semibold',
      render: r => <>{fmt(r.spins)}</>,
    },
    {
      key: 'bet', label: '投注額',
      sortValue: r => r.bet_total,
      className: 'tabular-nums',
      render: r => <>{fmt(r.bet_total)} G</>,
    },
    {
      key: 'direct', label: '直衝',
      sortValue: r => r.direct_total,
      className: 'tabular-nums text-neutral-600',
      render: r => <>{r.direct_count > 0 ? `${r.direct_count} 次 / ${fmt(r.direct_total)} G` : '—'}</>,
    },
    {
      key: 'rush', label: 'RUSH',
      sortValue: r => r.rush_count,
      className: 'tabular-nums',
      render: r => <>{fmt(r.rush_count)} 次</>,
    },
    {
      key: 'coin_return', label: '退幣',
      sortValue: r => r.coin_return_total,
      className: 'tabular-nums',
      render: r => <>{fmt(r.coin_return_total)} G</>,
    },
    {
      key: 'prize', label: '出獎',
      sortValue: r => r.prize_value_total,
      className: 'tabular-nums text-neutral-600',
      render: r => <>{r.prize_count > 0 ? `${r.prize_count} 件 / ${fmt(r.prize_value_total)} G` : '—'}</>,
    },
    {
      key: 'profit', label: '毛利',
      sortValue: r => profit(r),
      className: 'tabular-nums',
      render: r => (
        <span className={`font-semibold ${profit(r) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {fmt(profit(r))} G
        </span>
      ),
    },
    {
      key: 'rtp', label: 'RTP',
      sortValue: r => rtp(r) ?? -1,
      className: 'tabular-nums',
      render: r => <>{rtpText(rtp(r))}</>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: r => <RowAction onClick={() => openDetail(r)}>每日明細</RowAction>,
    },
  ]

  return (
    <AdminLayout pageTitle="機台報表">
      <div className="space-y-4">
        {/* 日期區間 — 靠右對齊，同對帳報表風格 */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <DateRangePicker startDate={start} endDate={end} onStartDateChange={setStart} onEndDateChange={setEnd} placeholder="選擇日期範圍" />
        </div>

        {/* KPI 小卡（合計數字集中在這裡） */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="總營收" value={`${fmt(totals.revenue)} G`} sub={`投注 ${fmt(totals.bet)} + 直衝 ${fmt(totals.directTotal)}（${fmt(totals.directCount)} 次）`} color="text-green-600" />
            <KpiCard label="總派彩" value={`${fmt(totals.payout)} G`} sub={`退幣 ${fmt(totals.coinReturn)} + 出獎 ${fmt(totals.prizeValue)}（${fmt(totals.prizeCount)} 件）`} color="text-orange-500" />
            <KpiCard label="毛利" value={`${fmt(totals.profit)} G`} sub={totals.profit >= 0 ? '平台盈餘' : '平台虧損'} color={totals.profit >= 0 ? 'text-primary' : 'text-red-600'} />
            <KpiCard label="RTP" value={rtpText(totals.rtp)} sub={`轉數 ${fmt(totals.spins)}・RUSH ${fmt(totals.rush)} 次・共 ${visibleRows.length} 台`} color="text-indigo-600" />
          </div>
        )}

        {/* 機台明細表 */}
        <ListTableCard
          pageKey="slot_reports"
          data={visibleRows}
          columns={columns}
          keyField="machine_id"
          isLoading={loading}
          emptyMessage="此區間無機台交易紀錄"
          defaultSortField="machine"
          searchPlaceholder="搜尋機台名稱、ID..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          filters={[
            {
              key: 'idle', label: '交易狀態',
              value: idleFilter, onChange: setIdleFilter,
              options: [
                { value: 'active', label: '隱藏無交易機台' },
                { value: 'all',    label: '顯示全部機台' },
              ],
            },
          ]}
          toolbarChildren={
            <button
              onClick={handleExport}
              className="h-9 px-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              匯出CSV
            </button>
          }
        />

        <p className="text-xs text-neutral-400">點「每日明細」可看機台每日數據。出獎價值以品項回收價計算；毛利 = 投注 + 直衝 − 退幣 − 出獎價值。</p>
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
