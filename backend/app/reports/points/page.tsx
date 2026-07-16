'use client'

import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import { useState, useEffect, useCallback } from 'react'

interface PointRow {
  id: string
  claimed_at: string
  user_name: string
  task_title: string
  task_type: string
  reward_coins: number
}

function fmt(n: number) { return n.toLocaleString() }

const TASK_TYPE_LABEL: Record<string, string> = {
  daily: '每日任務', weekly: '每週任務', achievement: '成就', one_time: '一次性'
}

export default function PointsReportPage() {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [rows, setRows] = useState<PointRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab: 'points', start: startDate, end: endDate })
      const res = await fetch(`/api/admin/reports?${params}`)
      const json = await res.json()
      setRows(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPoints = rows.reduce((s, r) => s + (r.reward_coins ?? 0), 0)

  const handleExport = () => {
    if (!rows.length) return
    const BOM = '﻿'
    const header = ['時間', '用戶', '任務名稱', '任務類型', '積分']
    const body = rows.map(r => [
      new Date(r.claimed_at).toLocaleString('zh-TW', { hour12: false }),
      r.user_name,
      r.task_title,
      TASK_TYPE_LABEL[r.task_type] ?? r.task_type,
      String(r.reward_coins),
    ])
    const csv = BOM + [header, ...body].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `積分明細_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout
      pageTitle="積分明細"
    >
      <div className="space-y-4">
        {/* 篩選列 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-wrap items-center gap-3">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            查詢
          </button>
          <button
            onClick={handleExport}
            disabled={!rows.length}
            className="ml-auto px-4 py-2 bg-white border-2 border-neutral-200 rounded-lg hover:border-neutral-300 text-sm font-medium flex items-center gap-2 disabled:opacity-40"
          >
            匯出 CSV
          </button>
        </div>

        {/* KPI 小卡 */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">領取筆數</p>
              <p className="text-2xl font-black text-neutral-900">{fmt(rows.length)}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">積分合計</p>
              <p className="text-2xl font-black text-indigo-600">{fmt(totalPoints)}</p>
              <p className="text-xs text-neutral-400 mt-0.5">點</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">平均每筆</p>
              <p className="text-2xl font-black text-neutral-700">{rows.length ? fmt(Math.round(totalPoints / rows.length)) : 0}</p>
              <p className="text-xs text-neutral-400 mt-0.5">點</p>
            </div>
          </div>
        )}

        {/* 資料表 */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-neutral-400">載入中…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-neutral-400">本期無積分領取紀錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    {['時間', '用戶', '任務名稱', '任務類型', '積分'].map(h => (
                      <th key={h} className="py-2 px-3 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-2 px-3 font-mono whitespace-nowrap text-neutral-500 text-xs">
                        {new Date(r.claimed_at).toLocaleString('zh-TW', { hour12: false })}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap font-medium">{r.user_name}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{r.task_title}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.task_type === 'daily' ? 'bg-primary text-primary' :
                          r.task_type === 'weekly' ? 'bg-purple-50 text-purple-700' :
                          r.task_type === 'achievement' ? 'bg-amber-50 text-amber-700' :
                          'bg-neutral-100 text-neutral-600'
                        }`}>
                          {TASK_TYPE_LABEL[r.task_type] ?? r.task_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 tabular-nums font-semibold text-indigo-600">
                        +{fmt(r.reward_coins)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
