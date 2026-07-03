'use client'

import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Supplier { id: number; name: string }
interface DismantleRow {
  id: number
  created_at: string
  prize_name: string
  prize_level: string
  recycle_value: number
  user_id: string
  userName: string
  product_id: number
  productName: string
  supplierName: string
}

function fmt(n: number) {
  return n.toLocaleString()
}

export default function DismantledReportPage() {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [rows, setRows] = useState<DismantleRow[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then(r => r.json())
      .then(json => {
        const list: Supplier[] = Array.isArray(json) ? json : (json.data ?? [])
        setSuppliers(list)
      })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab: 'dismantled', start: startDate, end: endDate })
      if (selectedSupplierId) params.set('supplierId', selectedSupplierId)
      const res = await fetch(`/api/admin/reports?${params}`)
      const json = await res.json()
      setRows(json.data ?? [])
      setTotalTokens(json.totalTokens ?? 0)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, selectedSupplierId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExport = () => {
    if (!rows.length) return
    const BOM = '﻿'
    const header = ['時間', '用戶', '商品', '賞項', '等級', '分解代幣', '廠商']
    const body = rows.map(r => [
      new Date(r.created_at).toLocaleString('zh-TW', { hour12: false }),
      r.userName,
      r.productName,
      r.prize_name,
      r.prize_level,
      String(r.recycle_value),
      r.supplierName,
    ])
    const csv = BOM + [header, ...body].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `分解明細_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout
      pageTitle="分解明細"
      breadcrumbs={[{ label: '金流報表' }, { label: '分解明細', href: '/reports/dismantled' }]}
    >
      <div className="space-y-4">

        {/* 工具列 */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <select
            value={selectedSupplierId}
            onChange={e => setSelectedSupplierId(e.target.value)}
            className="border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">所有廠商</option>
            {suppliers.map(s => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            placeholder="選擇日期範圍"
          />
          {rows.length > 0 && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-white border-2 border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              匯出 CSV
            </button>
          )}
        </div>

        {/* 摘要 KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <p className="text-xs text-neutral-500 mb-1">分解筆數</p>
            <p className="text-2xl font-black text-neutral-900">{loading ? '—' : fmt(rows.length)}</p>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <p className="text-xs text-neutral-500 mb-1">退出代幣合計</p>
            <p className="text-2xl font-black text-red-500">{loading ? '—' : fmt(totalTokens)}</p>
            <p className="text-xs text-neutral-400 mt-0.5">G 幣</p>
          </div>
          {rows.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">每筆平均</p>
              <p className="text-2xl font-black text-neutral-900">{loading ? '—' : fmt(Math.round(totalTokens / rows.length))}</p>
              <p className="text-xs text-neutral-400 mt-0.5">G 幣 / 筆</p>
            </div>
          )}
        </div>

        {/* 明細表 */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500">時間</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500">用戶</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500">商品</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500">賞項</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500">等級</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500">退代幣</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500">廠商</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-neutral-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                        載入中…
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-neutral-400 text-sm">
                      此區間無分解紀錄
                    </td>
                  </tr>
                ) : rows.map(row => (
                  <tr key={row.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-neutral-500 font-mono whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/users/${row.user_id}`} className="text-blue-600 hover:underline font-medium text-xs">
                        {row.userName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${row.product_id}`} className="text-neutral-700 hover:text-primary hover:underline text-xs">
                        {row.productName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-neutral-600">{row.prize_name}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700">
                        {row.prize_level}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm font-bold text-red-500">−{row.recycle_value}</span>
                      <span className="text-xs text-neutral-400 ml-1">G</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{row.supplierName}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && !loading && (
                <tfoot>
                  <tr className="bg-neutral-50 border-t-2 border-neutral-200">
                    <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-neutral-700">
                      合計 {fmt(rows.length)} 筆
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-black text-red-500">
                      −{fmt(totalTokens)} G
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}
