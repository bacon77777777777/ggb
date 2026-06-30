'use client'

import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import { useState, useEffect, useCallback } from 'react'
import { formatDateTime } from '@/utils/dateFormat'

type Tab = 'recharge' | 'consumption' | 'summary'

interface RechargeRecord {
  id: number
  order_number: string
  amount: number
  bonus: number
  payment_method: string | null
  status: string
  created_at: string
  user?: { id: string; name: string; email: string }
}

interface DrawRecord {
  id: number
  prize_name: string | null
  prize_level: string | null
  status: string
  created_at: string
  user?: { id: string; name: string; email: string }
  product?: { id: number; name: string; price: number }
}

interface Summary {
  totalRecharge: number
  totalRechargeCount: number
  totalTokenConsumed: number
  totalDraws: number
  newUserCount: number
  uniquePayers: number
  avgPerPayer: number
}

interface DailyBreakdown {
  date: string
  recharge: number
  draws: number
  newUsers: number
}

const STATUS_LABEL: Record<string, string> = {
  completed: '完成',
  pending: '待處理',
  failed: '失敗',
  refunded: '已退款',
  success: '成功',
  in_warehouse: '倉庫中',
  pending_delivery: '待配送',
  shipped: '已出貨',
  exchanged: '已兌換',
  dismantled: '已拆解',
  listing: '上架中',
  cancelled: '已取消',
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  success: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-yellow-100 text-yellow-700',
  pending_delivery: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700',
  shipped: 'bg-blue-100 text-blue-700',
  in_warehouse: 'bg-purple-100 text-purple-700',
  exchanged: 'bg-neutral-100 text-neutral-600',
  dismantled: 'bg-neutral-100 text-neutral-600',
  listing: 'bg-indigo-100 text-indigo-700',
}

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿'
  const content =
    bom +
    [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('recharge')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(false)

  const [rechargeData, setRechargeData] = useState<RechargeRecord[]>([])
  const [consumptionData, setConsumptionData] = useState<DrawRecord[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [dailyBreakdown, setDailyBreakdown] = useState<DailyBreakdown[]>([])

  // Default to current month
  useEffect(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    setStart(`${y}-${m}-01`)
    setEnd(`${y}-${m}-${String(now.getDate()).padStart(2, '0')}`)
  }, [])

  const fetchData = useCallback(async () => {
    if (!start || !end) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/reports?tab=${tab}&start=${start}&end=${end}`)
      if (!res.ok) throw new Error((await res.json()).error || '載入失敗')
      const json = await res.json()
      if (tab === 'recharge') setRechargeData(json.data ?? [])
      else if (tab === 'consumption') setConsumptionData(json.data ?? [])
      else {
        setSummary(json.summary ?? null)
        setDailyBreakdown(json.dailyBreakdown ?? [])
      }
    } catch (e: any) {
      alert(e.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [tab, start, end])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleExportRecharge = () => {
    exportCSV(
      `儲值明細_${start}_${end}.csv`,
      ['日期', '訂單編號', '用戶姓名', '用戶Email', '金額(TWD)', '贈點', '付款方式', '狀態'],
      rechargeData.map((r) => [
        formatDateTime(r.created_at),
        r.order_number ?? '',
        r.user?.name ?? '',
        r.user?.email ?? '',
        String(r.amount ?? 0),
        String(r.bonus ?? 0),
        r.payment_method ?? '',
        STATUS_LABEL[r.status] ?? r.status,
      ])
    )
  }

  const handleExportConsumption = () => {
    exportCSV(
      `消費明細_${start}_${end}.csv`,
      ['日期', '用戶姓名', '用戶Email', '商品', '消耗代幣(G)', '獎品等級', '獎品名稱', '狀態'],
      consumptionData.map((d) => [
        formatDateTime(d.created_at),
        d.user?.name ?? '',
        d.user?.email ?? '',
        d.product?.name ?? '',
        String(d.product?.price ?? 0),
        d.prize_level ?? '',
        d.prize_name ?? '',
        STATUS_LABEL[d.status] ?? d.status,
      ])
    )
  }

  const handleExportSummary = () => {
    if (!summary) return
    const summaryRows = [
      ['總儲值金額(TWD)', String(summary.totalRecharge)],
      ['儲值筆數', String(summary.totalRechargeCount)],
      ['總消費代幣(G)', String(summary.totalTokenConsumed)],
      ['總抽獎次數', String(summary.totalDraws)],
      ['新增用戶數', String(summary.newUserCount)],
      ['付費用戶數', String(summary.uniquePayers)],
      ['平均客單價(TWD)', String(summary.avgPerPayer)],
    ]
    const dailyRows = [
      ['', '', '', ''],
      ['===每日明細===', '', '', ''],
      ['日期', '儲值金額(TWD)', '抽獎次數', '新用戶數'],
      ...dailyBreakdown.map((d) => [d.date, String(d.recharge), String(d.draws), String(d.newUsers)]),
    ]
    exportCSV(
      `期間摘要_${start}_${end}.csv`,
      ['項目', '數值'],
      [...summaryRows, ...dailyRows]
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'recharge', label: '儲值明細' },
    { key: 'consumption', label: '消費明細' },
    { key: 'summary', label: '期間摘要' },
  ]

  return (
    <AdminLayout pageTitle="報表" breadcrumbs={[{ label: '報表', href: '/reports' }]}>
      <div className="space-y-4">
        {/* 工具列 */}
        <div className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-primary text-white'
                    : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-[220px] max-w-xs">
            <DateRangePicker
              startDate={start}
              endDate={end}
              onStartDateChange={setStart}
              onEndDateChange={setEnd}
              placeholder="選擇日期範圍"
            />
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? '載入中…' : '查詢'}
          </button>

          {tab === 'recharge' && rechargeData.length > 0 && (
            <button
              onClick={handleExportRecharge}
              className="px-4 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              匯出 CSV
            </button>
          )}
          {tab === 'consumption' && consumptionData.length > 0 && (
            <button
              onClick={handleExportConsumption}
              className="px-4 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              匯出 CSV
            </button>
          )}
          {tab === 'summary' && summary && (
            <button
              onClick={handleExportSummary}
              className="px-4 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              匯出 CSV
            </button>
          )}
        </div>

        {/* 儲值明細 */}
        {tab === 'recharge' && (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">儲值明細</h3>
              <span className="text-sm text-neutral-500">共 {rechargeData.length} 筆</span>
            </div>
            {loading ? (
              <div className="py-16 text-center text-neutral-400 text-sm">載入中…</div>
            ) : rechargeData.length === 0 ? (
              <div className="py-16 text-center text-neutral-400 text-sm">此區間無儲值紀錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      {['日期', '訂單編號', '用戶', 'Email', '金額(TWD)', '贈點', '付款方式', '狀態'].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-neutral-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {rechargeData.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2 text-neutral-600 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.order_number}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{r.user?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-neutral-500 text-xs">{r.user?.email ?? '—'}</td>
                        <td className="px-4 py-2 font-semibold text-right">{(r.amount ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{r.bonus ?? 0}</td>
                        <td className="px-4 py-2 text-neutral-500">{r.payment_method ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? 'bg-neutral-100 text-neutral-600'}`}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 border-t border-neutral-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-700">合計</td>
                      <td className="px-4 py-2 text-right font-bold text-neutral-900">
                        {rechargeData.filter(r => r.status === 'completed').reduce((s, r) => s + (r.amount ?? 0), 0).toLocaleString()}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 消費明細 */}
        {tab === 'consumption' && (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">消費明細</h3>
              <span className="text-sm text-neutral-500">共 {consumptionData.length} 筆</span>
            </div>
            {loading ? (
              <div className="py-16 text-center text-neutral-400 text-sm">載入中…</div>
            ) : consumptionData.length === 0 ? (
              <div className="py-16 text-center text-neutral-400 text-sm">此區間無消費紀錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      {['日期', '用戶', 'Email', '商品', '消耗代幣(G)', '獎品等級', '獎品名稱', '狀態'].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-neutral-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {consumptionData.map((d) => (
                      <tr key={d.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2 text-neutral-600 whitespace-nowrap">{formatDateTime(d.created_at)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{d.user?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-neutral-500 text-xs">{d.user?.email ?? '—'}</td>
                        <td className="px-4 py-2">{d.product?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold">{(d.product?.price ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          {d.prize_level ? (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                              {d.prize_level}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2 text-neutral-700">{d.prize_name ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[d.status] ?? 'bg-neutral-100 text-neutral-600'}`}>
                            {STATUS_LABEL[d.status] ?? d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 border-t border-neutral-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-700">合計消費代幣</td>
                      <td className="px-4 py-2 text-right font-bold text-neutral-900">
                        {consumptionData.reduce((s, d) => s + (d.product?.price ?? 0), 0).toLocaleString()} G
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 期間摘要 */}
        {tab === 'summary' && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-lg border border-neutral-200 py-16 text-center text-neutral-400 text-sm">載入中…</div>
            ) : !summary ? (
              <div className="bg-white rounded-lg border border-neutral-200 py-16 text-center text-neutral-400 text-sm">無資料</div>
            ) : (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: '總儲值金額', value: `NT$ ${summary.totalRecharge.toLocaleString()}`, sub: `${summary.totalRechargeCount} 筆`, color: 'text-purple-600' },
                    { label: '總消費代幣', value: `${summary.totalTokenConsumed.toLocaleString()} G`, sub: `${summary.totalDraws} 次抽獎`, color: 'text-emerald-600' },
                    { label: '新增用戶', value: `${summary.newUserCount.toLocaleString()} 人`, sub: `付費 ${summary.uniquePayers} 人`, color: 'text-blue-600' },
                    { label: '平均客單價', value: `NT$ ${summary.avgPerPayer.toLocaleString()}`, sub: '付費用戶', color: 'text-amber-600' },
                  ].map((card) => (
                    <div key={card.label} className="bg-white rounded-lg border border-neutral-200 p-4">
                      <p className="text-xs text-neutral-500 mb-1">{card.label}</p>
                      <p className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</p>
                      <p className="text-xs text-neutral-400 mt-1">{card.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Daily Breakdown */}
                {dailyBreakdown.length > 0 && (
                  <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-neutral-100">
                      <h3 className="font-semibold text-neutral-900">每日明細</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-100">
                          <tr>
                            {['日期', '儲值金額(TWD)', '抽獎次數', '新用戶數'].map((h) => (
                              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-neutral-500">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {dailyBreakdown.map((d) => (
                            <tr key={d.date} className="hover:bg-neutral-50">
                              <td className="px-4 py-2 font-mono text-xs">{d.date}</td>
                              <td className="px-4 py-2 text-right font-semibold">{d.recharge.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right">{d.draws.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right">{d.newUsers.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-neutral-50 border-t border-neutral-200">
                          <tr>
                            <td className="px-4 py-2 text-sm font-semibold text-neutral-700">合計</td>
                            <td className="px-4 py-2 text-right font-bold">{dailyBreakdown.reduce((s, d) => s + d.recharge, 0).toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-bold">{dailyBreakdown.reduce((s, d) => s + d.draws, 0).toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-bold">{dailyBreakdown.reduce((s, d) => s + d.newUsers, 0).toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
