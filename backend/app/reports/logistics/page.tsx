'use client'

import { AdminLayout, PageCard, SearchToolbar, DateRangePicker } from '@/components'
import { useState, useEffect, useMemo } from 'react'
import { formatDateTime } from '@/utils/dateFormat'
import { CardSkeleton } from '@/components/ui/Skeleton'

interface LogisticsRecord {
  id: number
  order_number: string
  submitted_at: string
  shipped_at: string | null
  status: string
  logistics_type: string
  logistics_subtype: string | null
  tracking_number: string | null
  total_amount: number
  recipient_name: string
  recipient_phone: string
  address: string
  store_name: string | null
  user: { name: string; email: string } | null
  items: Array<{
    id: number
    product_prizes: { name: string; level: string } | null
    products: { name: string; supplier_id: number | null; suppliers: { name: string } | null } | null
  }>
}

const STATUS_TEXT: Record<string, string> = {
  submitted: '已提交',
  processing: '處理中',
  picked_up: '物流已收取',
  shipping: '配送中',
  delivered: '已送達',
  cancelled: '已取消',
}

const LOGISTICS_TYPE_TEXT: Record<string, string> = {
  HOME: '宅配',
  CVS: '超商取貨',
}

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const bom = '﻿'
  const content = bom + [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function LogisticsReportPage() {
  const [records, setRecords] = useState<LogisticsRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [filterStatus, setFilterStatus] = useState('all')

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStartDate) params.set('start', filterStartDate)
      if (filterEndDate) params.set('end', filterEndDate)
      const res = await fetch(`/api/admin/reports/logistics?${params}`)
      const data = await res.json()
      setRecords(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filterStartDate, filterEndDate])

  const filtered = useMemo(() => {
    let r = records
    if (filterStatus !== 'all') r = r.filter(x => x.status === filterStatus)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      r = r.filter(x =>
        x.order_number.toLowerCase().includes(q) ||
        x.user?.name?.toLowerCase().includes(q) ||
        x.user?.email?.toLowerCase().includes(q) ||
        (x.tracking_number || '').toLowerCase().includes(q)
      )
    }
    return r
  }, [records, filterStatus, searchQuery])

  const handleExportCSV = () => {
    exportCSV(
      `物流明細_${new Date().toISOString().split('T')[0]}.csv`,
      ['提交時間', '訂單編號', '用戶', 'Email', '物流類型', '物流單號', '運費(TWD)', '獎品數', '狀態', '出貨時間'],
      filtered.map(r => [
        formatDateTime(r.submitted_at),
        r.order_number,
        r.user?.name || '',
        r.user?.email || '',
        LOGISTICS_TYPE_TEXT[r.logistics_type] || r.logistics_type,
        r.tracking_number || '',
        r.total_amount || 0,
        r.items.length,
        STATUS_TEXT[r.status] || r.status,
        r.shipped_at ? formatDateTime(r.shipped_at) : '',
      ])
    )
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'submitted': return 'bg-yellow-50 text-yellow-700'
      case 'processing': return 'bg-primary text-primary'
      case 'picked_up': return 'bg-primary text-primary'
      case 'shipping': return 'bg-indigo-50 text-indigo-700'
      case 'delivered': return 'bg-green-50 text-green-700'
      case 'cancelled': return 'bg-neutral-100 text-neutral-500'
      default: return 'bg-neutral-100 text-neutral-600'
    }
  }

  return (
    <AdminLayout pageTitle="物流明細">
      <div className="space-y-4">
        {/* 工具列 */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <DateRangePicker
            startDate={filterStartDate}
            endDate={filterEndDate}
            onStartDateChange={setFilterStartDate}
            onEndDateChange={setFilterEndDate}
            placeholder="選擇日期範圍"
          />
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-white border-2 border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2 whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            匯出 CSV
          </button>
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">物流筆數</p>
              <p className="text-2xl font-black text-neutral-900">{filtered.length.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">運費合計</p>
              <p className="text-2xl font-black text-red-500">NT$ {filtered.reduce((s, r) => s + (r.total_amount ?? 0), 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500 mb-1">已送達</p>
              <p className="text-2xl font-black text-primary">{filtered.filter(r => r.status === 'delivered').length.toLocaleString()}</p>
              <p className="text-xs text-neutral-400 mt-0.5">筆</p>
            </div>
          </div>
        )}

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋訂單編號、用戶、物流單號..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showFilter={true}
            filterOptions={[
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                value: filterStatus,
                onChange: setFilterStatus,
                options: [
                  { value: 'all', label: '全部狀態' },
                  { value: 'submitted', label: '已提交' },
                  { value: 'processing', label: '處理中' },
                  { value: 'shipping', label: '配送中' },
                  { value: 'delivered', label: '已送達' },
                  { value: 'cancelled', label: '已取消' },
                ],
              },
            ]}
          />

          <div className="mt-4 overflow-x-auto">
            {isLoading ? (
              <CardSkeleton rows={3} />
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-neutral-400">無資料</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr className="border-b border-neutral-200 text-left">
                    {['提交時間', '訂單編號', '用戶', '物流類型', '物流單號', '運費', '獎品數', '狀態', '出貨時間'].map(h => (
                      <th key={h} className="py-2 px-3 font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="py-2 px-3 font-mono whitespace-nowrap text-neutral-500">{formatDateTime(r.submitted_at)}</td>
                      <td className="py-2 px-3 font-mono whitespace-nowrap font-medium">{r.order_number}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-medium text-neutral-900">{r.user?.name || '—'}</div>
                        <div className="text-xs text-neutral-400">{r.user?.email || ''}</div>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-neutral-600">
                        {LOGISTICS_TYPE_TEXT[r.logistics_type] || r.logistics_type}
                        {r.logistics_subtype && <span className="ml-1 text-xs text-neutral-400">({r.logistics_subtype})</span>}
                      </td>
                      <td className="py-2 px-3 font-mono whitespace-nowrap">{r.tracking_number || '—'}</td>
                      <td className="py-2 px-3 font-mono whitespace-nowrap font-medium">
                        {r.total_amount > 0 ? <span className="text-red-500">−${r.total_amount}</span> : '—'}
                      </td>
                      <td className="py-2 px-3 text-center">{r.items.length}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs ${statusColor(r.status)}`}>
                          {STATUS_TEXT[r.status] || r.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono whitespace-nowrap text-neutral-500">
                        {r.shipped_at ? formatDateTime(r.shipped_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
