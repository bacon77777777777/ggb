'use client'

import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import { useState, useEffect, useCallback } from 'react'

interface CouponRow {
  id: string
  created_at: string
  used_at: string | null
  expiry_date: string | null
  status: string
  user_name: string
  coupon_code: string
  coupon_title: string
  discount_type: string
  discount_value: number
}

function fmt(n: number) { return n.toLocaleString() }

const DISCOUNT_TYPE_LABEL: Record<string, string> = {
  fixed: '折抵金額', percentage: '折扣%', percent: '折扣%', free_shipping: '免運費', shipping: '運費折抵'
}

export default function CouponsReportPage() {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [rows, setRows] = useState<CouponRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab: 'coupons_report', start: startDate, end: endDate })
      const res = await fetch(`/api/admin/reports?${params}`)
      const json = await res.json()
      setRows(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  const usedRows = rows.filter(r => r.used_at)
  const totalDiscount = usedRows.reduce((s, r) => r.discount_type === 'fixed' ? s + r.discount_value : s, 0)

  const handleExport = () => {
    if (!rows.length) return
    const BOM = '﻿'
    const header = ['發放時間', '到期時間', '使用時間', '用戶', '折價券碼', '名稱', '折扣類型', '折扣值', '狀態']
    const body = rows.map(r => [
      new Date(r.created_at).toLocaleString('zh-TW', { hour12: false }),
      r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('zh-TW') : '無期限',
      r.used_at ? new Date(r.used_at).toLocaleString('zh-TW', { hour12: false }) : '未使用',
      r.user_name,
      r.coupon_code,
      r.coupon_title,
      DISCOUNT_TYPE_LABEL[r.discount_type] ?? r.discount_type,
      String(r.discount_value),
      r.status || '已發放',
    ])
    const csv = BOM + [header, ...body].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `折價券明細_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout
      pageTitle="折價券明細"
      breadcrumbs={[{ label: '對帳報表' }, { label: '折價券明細', href: '/reports/coupons' }]}
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
              <p className="text-xs text-neutral-500 mb-1">發放筆數</p>
              <p className="text-2xl font-black text-neutral-900">{fmt(rows.length)}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">已使用</p>
              <p className="text-2xl font-black text-emerald-600">{fmt(usedRows.length)}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                使用率 {rows.length ? Math.round(usedRows.length / rows.length * 100) : 0}%
              </p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">折抵金額合計</p>
              <p className="text-2xl font-black text-red-500">NT$ {fmt(totalDiscount)}</p>
              <p className="text-xs text-neutral-400 mt-0.5">固定金額型</p>
            </div>
          </div>
        )}

        {/* 資料表 */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-neutral-400">載入中…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-neutral-400">本期無折價券紀錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    {['發放時間', '到期', '使用時間', '用戶', '折價券', '折扣類型', '折扣值', '狀態'].map(h => (
                      <th key={h} className="py-2 px-3 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-2 px-3 font-mono text-xs text-neutral-500 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('zh-TW', { hour12: false })}
                      </td>
                      <td className="py-2 px-3 text-xs text-neutral-500 whitespace-nowrap">
                        {r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('zh-TW') : '無限期'}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                        {r.used_at
                          ? <span className="text-emerald-600">{new Date(r.used_at).toLocaleString('zh-TW', { hour12: false })}</span>
                          : <span className="text-neutral-400">未使用</span>}
                      </td>
                      <td className="py-2 px-3 font-medium whitespace-nowrap">{r.user_name}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-mono text-xs text-neutral-600">{r.coupon_code}</div>
                        <div className="text-xs text-neutral-400">{r.coupon_title}</div>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">
                          {DISCOUNT_TYPE_LABEL[r.discount_type] ?? r.discount_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 tabular-nums text-red-500 font-medium whitespace-nowrap">
                        {r.discount_type === 'percent' ? `${r.discount_value}%`
                          : r.discount_type === 'free_shipping' ? '免運'
                          : `NT$ ${fmt(r.discount_value)}`}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs ${r.used_at ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                          {r.used_at ? '已使用' : '未使用'}
                        </span>
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
