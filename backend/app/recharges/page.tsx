'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, DataTable, DateRangePicker, type Column } from '@/components'
import { useState, useEffect, useMemo } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'

interface RechargeRecord {
  id: number
  order_number: string
  trade_no?: string | null
  user_id: string
  amount: number
  bonus: number
  payment_method?: string | null
  payment_fee?: number | null
  status: string
  created_at: string
  user?: { id: string; name: string; email: string }
}

// ─── 綠界 ───────────────────────────────────────────────
const ECPAY_METHOD_KEYS = ['credit_card', 'webatm', 'vacc', 'cvs', 'barcode', 'twqr', 'other'] as const

// ─── 手動真實收款 ────────────────────────────────────────
const MANUAL_REAL_KEYS = ['manual_transfer', 'cash', 'line_pay'] as const

// ─── 行銷費用（不計入收入）───────────────────────────────
const MARKETING_KEYS = ['promotion', 'compensation', 'test'] as const

type ChannelFilter = 'all' | 'ecpay' | 'manual'

const PAYMENT_METHOD_INFO: Record<string, { name: string; formula: string; channel: 'ecpay' | 'manual' }> = {
  // 綠界
  credit_card:     { name: '信用卡 / 簽帳金融卡', formula: '2.75%+NT$1',    channel: 'ecpay' },
  webatm:          { name: '網路 ATM',            formula: '1% max NT$15',   channel: 'ecpay' },
  vacc:            { name: 'ATM 虛擬帳號',         formula: '1% max NT$15',   channel: 'ecpay' },
  cvs:             { name: '超商代碼',             formula: 'NT$31/筆',        channel: 'ecpay' },
  barcode:         { name: '超商條碼',             formula: 'NT$16/筆',        channel: 'ecpay' },
  twqr:            { name: '台灣 Pay QR',          formula: '1%',             channel: 'ecpay' },
  other:           { name: '其他（綠界）',          formula: '—',              channel: 'ecpay' },
  // 手動
  manual_transfer: { name: '銀行轉帳',             formula: '—',              channel: 'manual' },
  cash:            { name: '現金',                 formula: '—',              channel: 'manual' },
  line_pay:        { name: 'LINE Pay（手動）',      formula: '—',              channel: 'manual' },
  promotion:       { name: '行銷贈點',             formula: '行銷費用',         channel: 'manual' },
  compensation:    { name: '補償',                 formula: '行銷費用',         channel: 'manual' },
  test:            { name: '測試',                 formula: '行銷費用',         channel: 'manual' },
}

// 所有可選的儲值方式選項（用於篩選下拉）
const ALL_METHOD_OPTIONS = [
  { value: 'all',             label: '全部方式' },
  { value: 'credit_card',     label: '信用卡 / 簽帳金融卡' },
  { value: 'webatm',          label: '網路 ATM' },
  { value: 'vacc',            label: 'ATM 虛擬帳號' },
  { value: 'cvs',             label: '超商代碼' },
  { value: 'barcode',         label: '超商條碼' },
  { value: 'twqr',            label: '台灣 Pay QR' },
  { value: 'manual_transfer', label: '銀行轉帳' },
  { value: 'cash',            label: '現金' },
  { value: 'line_pay',        label: 'LINE Pay（手動）' },
  { value: 'promotion',       label: '行銷贈點' },
  { value: 'compensation',    label: '補償' },
  { value: 'test',            label: '測試' },
  { value: 'other',           label: '其他' },
]

function normalizePaymentMethod(method: string): string {
  if (method.startsWith('Credit'))  return 'credit_card'
  if (method.startsWith('WebATM'))  return 'webatm'
  if (method.startsWith('ATM'))     return 'vacc'
  if (method.startsWith('CVS'))     return 'cvs'
  if (method.startsWith('BARCODE')) return 'barcode'
  if (method.startsWith('TWQR'))    return 'twqr'
  // 手動方式或 'other' 直接原值回傳
  if (PAYMENT_METHOD_INFO[method])  return method
  return 'other'
}

function getMethodChannel(normalized: string): 'ecpay' | 'manual' {
  return PAYMENT_METHOD_INFO[normalized]?.channel ?? 'ecpay'
}

export default function RechargesPage() {
  const [records, setRecords] = useState<RechargeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [methodDetailOpen, setMethodDetailOpen] = useState(true)
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('recharges', 'compact', {
    created_at: true, order_number: true, trade_no: false, user: true, amount: true, bonus: true, payment_method: true, status: true
  })

  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [filterChannel, setFilterChannel] = useState<ChannelFilter>('all')
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('all')
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/recharges')
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || '載入儲值紀錄失敗')
      setRecords((result as RechargeRecord[]) || [])
    } catch (error) {
      console.error('Error fetching recharge records:', error)
      alert('載入儲值紀錄失敗')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filteredRecords = useMemo(() => {
    let result = records

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        r.user?.name?.toLowerCase().includes(q) ||
        r.user?.email?.toLowerCase().includes(q) ||
        r.order_number?.toLowerCase().includes(q)
      )
    }

    if (selectedStatus !== 'all') {
      result = result.filter(r => r.status === selectedStatus)
    }

    // 金流篩選
    if (filterChannel !== 'all') {
      result = result.filter(r => {
        const normalized = normalizePaymentMethod(r.payment_method || 'other')
        return getMethodChannel(normalized) === filterChannel
      })
    }

    // 儲值方式篩選
    if (filterPaymentMethod !== 'all') {
      result = result.filter(r => {
        const normalized = normalizePaymentMethod(r.payment_method || 'other')
        return normalized === filterPaymentMethod
      })
    }

    if (filterStartDate) {
      result = result.filter(r => r.created_at >= filterStartDate)
    }
    if (filterEndDate) {
      const endDate = new Date(filterEndDate)
      endDate.setDate(endDate.getDate() + 1)
      result = result.filter(r => new Date(r.created_at) < endDate)
    }

    return result
  }, [records, searchQuery, selectedStatus, filterChannel, filterPaymentMethod, filterStartDate, filterEndDate])

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      let aValue: any
      let bValue: any
      switch (sortField) {
        case 'created_at':    aValue = new Date(a.created_at).getTime(); bValue = new Date(b.created_at).getTime(); break
        case 'user':          aValue = a.user?.name || ''; bValue = b.user?.name || ''; break
        case 'amount':        aValue = a.amount; bValue = b.amount; break
        case 'bonus':         aValue = a.bonus; bValue = b.bonus; break
        case 'payment_method': aValue = a.payment_method || ''; bValue = b.payment_method || ''; break
        case 'status':        aValue = a.status; bValue = b.status; break
        default:              aValue = a.id; bValue = b.id
      }
      if (typeof aValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
  }, [filteredRecords, sortField, sortDirection])

  const getPaymentMethodLabel = (method?: string | null) => {
    if (!method) return '-'
    const normalized = normalizePaymentMethod(method)
    return PAYMENT_METHOD_INFO[normalized]?.name ?? method
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // 金流篩選變動時重置儲值方式
  const handleChannelChange = (val: string) => {
    setFilterChannel(val as ChannelFilter)
    setFilterPaymentMethod('all')
  }

  // 儲值方式選項依金流動態過濾
  const methodOptions = useMemo(() => {
    if (filterChannel === 'ecpay') {
      return ALL_METHOD_OPTIONS.filter(o => o.value === 'all' || (PAYMENT_METHOD_INFO[o.value]?.channel === 'ecpay'))
    }
    if (filterChannel === 'manual') {
      return ALL_METHOD_OPTIONS.filter(o => o.value === 'all' || (PAYMENT_METHOD_INFO[o.value]?.channel === 'manual'))
    }
    return ALL_METHOD_OPTIONS
  }, [filterChannel])

  const columns: Column<RechargeRecord>[] = [
    {
      key: 'created_at', label: '時間', sortable: true,
      render: (record) => <span className="text-neutral-500">{formatDateTime(record.created_at)}</span>
    },
    { key: 'order_number', label: '訂單編號', className: 'font-mono text-neutral-600' },
    {
      key: 'trade_no', label: '金流序號',
      render: (record) => <span className="font-mono text-xs text-neutral-500">{record.trade_no || '—'}</span>
    },
    {
      key: 'user', label: '用戶', sortable: true,
      render: (record) => (
        <div>
          <div className="font-medium text-neutral-900">{record.user?.name || '未知用戶'}</div>
          <div className="text-xs text-neutral-500">{record.user?.email}</div>
        </div>
      )
    },
    {
      key: 'amount', label: '儲值金額(TWD)', sortable: true,
      render: (record) => <span className="font-medium text-neutral-900">{record.amount.toLocaleString()}</span>
    },
    {
      key: 'bonus', label: '贈送代幣(G)', sortable: true,
      render: (record) => <span className="text-neutral-500">{record.bonus.toLocaleString()}</span>
    },
    {
      key: 'payment_method', label: '付款方式', sortable: true,
      render: (record) => {
        const normalized = normalizePaymentMethod(record.payment_method || 'other')
        const isManual = getMethodChannel(normalized) === 'manual'
        const isMarketing = (MARKETING_KEYS as readonly string[]).includes(normalized)
        return (
          <span className={`text-sm ${isMarketing ? 'text-amber-600' : isManual ? 'text-teal-700' : 'text-neutral-600'}`}>
            {getPaymentMethodLabel(record.payment_method)}
          </span>
        )
      }
    },
    {
      key: 'status', label: '狀態', sortable: true,
      render: (record) => (
        <span className={`px-2 py-1 rounded text-xs ${
          record.status === 'success' ? 'bg-green-50 text-green-700' :
          record.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
          'bg-red-50 text-red-700'
        }`}>
          {record.status === 'success' ? '成功' : record.status === 'pending' ? '處理中' : '失敗'}
        </span>
      )
    }
  ]

  const handleExportCSV = () => {
    const BOM = '﻿'
    const headers = ['時間', '訂單編號', '金流序號', '用戶姓名', '用戶Email', '儲值金額(TWD)', '贈送代幣(G)', '付款方式', '金流', '狀態']
    const rows = sortedRecords.map(r => {
      const normalized = normalizePaymentMethod(r.payment_method || 'other')
      const channel = getMethodChannel(normalized)
      return [
        formatDateTime(r.created_at),
        r.order_number || '',
        r.trade_no || '',
        r.user?.name || '',
        r.user?.email || '',
        r.amount,
        r.bonus,
        getPaymentMethodLabel(r.payment_method),
        channel === 'manual' ? '手動' : '綠界',
        r.status === 'success' ? '成功' : r.status === 'pending' ? '處理中' : '失敗',
      ]
    })
    const csv = BOM + [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `儲值明細_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoadMore = () => {
    setIsLoadingMore(true)
    setTimeout(() => { setDisplayCount(prev => prev + 20); setIsLoadingMore(false) }, 500)
  }

  return (
    <AdminLayout pageTitle="儲值明細">
      <div className="space-y-4">
        {/* 工具列 */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {/* 近三個月快選 */}
          {(() => {
            const now = new Date()
            return [0, 1, 2].map(offset => {
              const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
              const y = d.getFullYear()
              const m = d.getMonth() + 1
              const last = new Date(y, m, 0).getDate()
              const start = `${y}-${String(m).padStart(2, '0')}-01`
              const end   = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
              const label = `${y}年${String(m).padStart(2, '0')}月`
              const active = filterStartDate === start && filterEndDate === end
              return (
                <button
                  key={label}
                  onClick={() => { setFilterStartDate(start); setFilterEndDate(end) }}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  {label}
                </button>
              )
            })
          })()}
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

        {!isLoading && (() => {
          const successRecs = sortedRecords.filter(r => r.status === 'success')

          // 各方式統計
          const methodMap: Record<string, { count: number; amount: number; fee: number; bonus: number }> = {}
          for (const r of successRecs) {
            const m = normalizePaymentMethod(r.payment_method || 'other')
            if (!methodMap[m]) methodMap[m] = { count: 0, amount: 0, fee: 0, bonus: 0 }
            methodMap[m].count++
            methodMap[m].amount += r.amount ?? 0
            methodMap[m].fee += r.payment_fee ?? 0
            methodMap[m].bonus += r.bonus ?? 0
          }

          const totalAmount  = successRecs.reduce((s, r) => s + (r.amount ?? 0), 0)
          const totalFee     = successRecs.reduce((s, r) => s + (r.payment_fee ?? 0), 0)
          const totalBonus   = sortedRecords.reduce((s, r) => s + (r.bonus ?? 0), 0)

          // 手動真實收款（銀行轉帳/現金/LINE Pay）
          const manualRealAmount = (MANUAL_REAL_KEYS as readonly string[]).reduce(
            (s, k) => s + (methodMap[k]?.amount ?? 0), 0
          )
          const manualRealCount = (MANUAL_REAL_KEYS as readonly string[]).reduce(
            (s, k) => s + (methodMap[k]?.count ?? 0), 0
          )

          const totalNet = totalAmount - totalFee

          return (
            <div className="space-y-3">
              {/* ── 總覽小卡 ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs text-neutral-500 mb-1">儲值筆數</p>
                  <p className="text-2xl font-black text-neutral-900">{sortedRecords.length.toLocaleString()}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{successRecs.length} 筆成功</p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs text-neutral-500 mb-1">儲值金額</p>
                  <p className="text-2xl font-black text-green-600">NT$ {totalAmount.toLocaleString()}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">含贈送 {totalBonus.toLocaleString()} G</p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs text-neutral-500 mb-1">手動儲值</p>
                  <p className="text-2xl font-black text-teal-600">NT$ {manualRealAmount.toLocaleString()}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{manualRealCount} 筆（轉帳/現金/LINE Pay）</p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs text-neutral-500 mb-1">手續費</p>
                  <p className="text-2xl font-black text-red-500">NT$ {totalFee.toLocaleString()}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">綠界實際扣除</p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs text-neutral-500 mb-1">實拿金額</p>
                  <p className="text-2xl font-black text-primary">NT$ {totalNet.toLocaleString()}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">扣除手續費</p>
                </div>
              </div>

              {/* ── 各支付方式明細 ── */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <button
                  onClick={() => setMethodDetailOpen(v => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors"
                >
                  <p className="text-sm font-semibold text-neutral-700">各支付方式明細</p>
                  <svg
                    className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${methodDetailOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {methodDetailOpen && <table className="w-full text-sm border-t border-neutral-100">
                  <thead className="bg-neutral-50">
                    <tr>
                      {['支付方式', '費率定義', '筆數', '儲值金額', '手續費', '實拿金額'].map(h => (
                        <th key={h} className="py-2 px-3 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {/* 綠界金流 section header */}
                    <tr className="bg-neutral-50/80">
                      <td colSpan={6} className="py-1.5 px-3 text-xs font-bold text-neutral-400 uppercase tracking-wide">
                        綠界金流
                      </td>
                    </tr>
                    {ECPAY_METHOD_KEYS.map(method => {
                      const info = PAYMENT_METHOD_INFO[method]
                      const stat = methodMap[method] ?? { count: 0, amount: 0, fee: 0 }
                      const net = stat.amount - stat.fee
                      return (
                        <tr key={method} className={`hover:bg-neutral-50 ${stat.count === 0 ? 'opacity-40' : ''}`}>
                          <td className="py-2 px-3 font-medium whitespace-nowrap pl-6">{info.name}</td>
                          <td className="py-2 px-3 text-neutral-500 whitespace-nowrap font-mono text-xs">{info.formula}</td>
                          <td className="py-2 px-3 tabular-nums">{stat.count.toLocaleString()}</td>
                          <td className="py-2 px-3 tabular-nums text-green-600">NT$ {stat.amount.toLocaleString()}</td>
                          <td className="py-2 px-3 tabular-nums text-red-500">NT$ {stat.fee.toLocaleString()}</td>
                          <td className="py-2 px-3 tabular-nums text-primary font-semibold">NT$ {net.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                    {/* 手動儲值 section header */}
                    <tr className="bg-neutral-50/80">
                      <td colSpan={6} className="py-1.5 px-3 text-xs font-bold text-neutral-400 uppercase tracking-wide">
                        手動儲值
                      </td>
                    </tr>
                    {([...MANUAL_REAL_KEYS, ...MARKETING_KEYS] as string[]).map(method => {
                      const info = PAYMENT_METHOD_INFO[method]
                      const stat = methodMap[method] ?? { count: 0, amount: 0, fee: 0, bonus: 0 }
                      const net = stat.amount - stat.fee
                      const isMarketing = (MARKETING_KEYS as readonly string[]).includes(method)
                      return (
                        <tr key={method} className={`hover:bg-neutral-50 ${stat.count === 0 ? 'opacity-40' : ''}`}>
                          <td className="py-2 px-3 font-medium whitespace-nowrap pl-6">
                            <span className={isMarketing ? 'text-amber-600' : 'text-teal-700'}>{info.name}</span>
                          </td>
                          <td className="py-2 px-3 text-neutral-500 whitespace-nowrap font-mono text-xs">{info.formula}</td>
                          <td className="py-2 px-3 tabular-nums">{stat.count.toLocaleString()}</td>
                          <td className={`py-2 px-3 tabular-nums ${isMarketing ? 'text-neutral-400' : 'text-green-600'}`}>
                            {isMarketing ? '—' : `NT$ ${stat.amount.toLocaleString()}`}
                          </td>
                          <td className="py-2 px-3 tabular-nums text-neutral-400">—</td>
                          <td className={`py-2 px-3 tabular-nums font-semibold ${isMarketing ? 'text-neutral-400' : 'text-teal-600'}`}>
                            {isMarketing ? 'NT$ 0' : `NT$ ${net.toLocaleString()}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>}
              </div>
            </div>
          )
        })()}

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋用戶、訂單編號..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
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
                options: [
                  { value: 'all',     label: '全部狀態' },
                  { value: 'success', label: '成功' },
                  { value: 'pending', label: '處理中' },
                  { value: 'failed',  label: '失敗' },
                ]
              },
              {
                key: 'channel',
                label: '金流',
                type: 'select',
                value: filterChannel,
                onChange: handleChannelChange,
                options: [
                  { value: 'all',    label: '全部金流' },
                  { value: 'ecpay',  label: '綠界' },
                  { value: 'manual', label: '手動儲值' },
                ]
              },
              {
                key: 'paymentMethod',
                label: '儲值方式',
                type: 'select',
                value: filterPaymentMethod,
                onChange: setFilterPaymentMethod,
                options: methodOptions,
              },
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'created_at',     label: '時間',         visible: visibleColumns.created_at },
              { key: 'order_number',   label: '訂單編號',      visible: visibleColumns.order_number },
              { key: 'trade_no',       label: '金流序號',      visible: visibleColumns.trade_no },
              { key: 'user',           label: '用戶',          visible: visibleColumns.user },
              { key: 'amount',         label: '儲值金額(TWD)', visible: visibleColumns.amount },
              { key: 'bonus',          label: '贈送代幣(G)',   visible: visibleColumns.bonus },
              { key: 'payment_method', label: '付款方式',      visible: visibleColumns.payment_method },
              { key: 'status',         label: '狀態',          visible: visibleColumns.status }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
          />

          <div className="mt-4">
            <DataTable
              data={sortedRecords}
              columns={columns}
              keyField="id"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              density={tableDensity}
              displayCount={displayCount}
              onLoadMore={handleLoadMore}
              enableInfiniteScroll={true}
              isLoadingMore={isLoadingMore}
              totalCount={sortedRecords.length}
              visibleColumns={visibleColumns}
              emptyMessage="無相關紀錄"
            />
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
