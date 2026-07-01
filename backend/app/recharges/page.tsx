'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, DataTable, DateRangePicker, type Column } from '@/components'
import { useState, useEffect, useMemo } from 'react'
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
  status: string
  created_at: string
  user?: { id: string; name: string; email: string }
}

export default function RechargesPage() {
  const [records, setRecords] = useState<RechargeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact')

  // 篩選與欄位顯示狀態
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  
  const [visibleColumns, setVisibleColumns] = useState<{[key: string]: boolean}>({
    created_at: true,
    order_number: true,
    trade_no: false,
    user: true,
    amount: true,
    bonus: true,
    payment_method: true,
    status: true
  })

  const fetchData = async () => {
    try {
      setIsLoading(true)

      const response = await fetch('/api/admin/recharges')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.error || '載入儲值紀錄失敗')
      }

      setRecords((result as RechargeRecord[]) || [])
    } catch (error) {
      console.error('Error fetching recharge records:', error)
      alert('載入儲值紀錄失敗')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredRecords = useMemo(() => {
    let result = records
    
    // 搜尋過濾
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r => 
        r.user?.name?.toLowerCase().includes(q) ||
        r.user?.email?.toLowerCase().includes(q) ||
        r.order_number?.toLowerCase().includes(q)
      )
    }
    
    // 狀態過濾
    if (selectedStatus !== 'all') {
      result = result.filter(r => r.status === selectedStatus)
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
  }, [records, searchQuery, selectedStatus, filterStartDate, filterEndDate])

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
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
        case 'amount':
          aValue = a.amount
          bValue = b.amount
          break
        case 'bonus':
          aValue = a.bonus
          bValue = b.bonus
          break
        case 'payment_method':
          aValue = a.payment_method || ''
          bValue = b.payment_method || ''
          break
        case 'status':
          aValue = a.status
          bValue = b.status
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
  }, [filteredRecords, sortField, sortDirection])

  const getPaymentMethodLabel = (method?: string | null) => {
    switch (method) {
      case 'credit_card':
        return '信用卡 / 金融卡'
      case 'webatm':
        return 'WebATM'
      case 'vacc':
      case 'bank_transfer':
        return 'ATM 轉帳'
      case 'cvs':
        return '超商代碼繳費'
      case 'barcode':
        return '超商條碼繳費'
      case 'line_pay':
        return 'LINE Pay'
      default:
        return method || '-'
    }
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const columns: Column<RechargeRecord>[] = [
    {
      key: 'created_at',
      label: '時間',
      sortable: true,
      render: (record) => <span className="text-gray-500">{formatDateTime(record.created_at)}</span>
    },
    {
      key: 'order_number',
      label: '訂單編號',
      className: 'font-mono text-gray-600'
    },
    {
      key: 'trade_no',
      label: '藍新序號',
      render: (record) => (
        <span className="font-mono text-xs text-gray-500">{record.trade_no || '—'}</span>
      )
    },
    {
      key: 'user',
      label: '用戶',
      sortable: true,
      render: (record) => (
        <div>
          <div className="font-medium text-gray-900">{record.user?.name || '未知用戶'}</div>
          <div className="text-xs text-gray-500">{record.user?.email}</div>
        </div>
      )
    },
    {
      key: 'amount',
      label: '儲值金額(TWD)',
      sortable: true,
      render: (record) => (
        <span className="font-medium text-gray-900">
          {record.amount.toLocaleString()}
        </span>
      )
    },
    {
      key: 'bonus',
      label: '贈送代幣(G)',
      sortable: true,
      render: (record) => (
        <span className="text-gray-500">
          {record.bonus.toLocaleString()}
        </span>
      )
    },
    {
      key: 'payment_method',
      label: '付款方式',
      sortable: true,
      render: (record) => (
        <span className="text-gray-600">
          {getPaymentMethodLabel(record.payment_method)}
        </span>
      )
    },
    {
      key: 'status',
      label: '狀態',
      sortable: true,
      render: (record) => (
        <span className={`px-2 py-1 rounded text-xs ${
          record.status === 'success' ? 'bg-green-50 text-green-700' : 
          record.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
          'bg-red-50 text-red-700'
        }`}>
          {record.status === 'success' ? '成功' : 
           record.status === 'pending' ? '處理中' : '失敗'}
        </span>
      )
    }
  ]

  const handleExportCSV = () => {
    const BOM = '﻿'
    const headers = ['時間', '訂單編號(MerchantOrderNo)', '藍新序號(TradeNo)', '用戶姓名', '用戶Email', '儲值金額(TWD)', '贈送代幣(G)', '付款方式', '狀態']
    const rows = sortedRecords.map(r => [
      formatDateTime(r.created_at),
      r.order_number || '',
      r.trade_no || '',
      r.user?.name || '',
      r.user?.email || '',
      r.amount,
      r.bonus,
      getPaymentMethodLabel(r.payment_method),
      r.status === 'success' ? '成功' : r.status === 'pending' ? '處理中' : '失敗',
    ])
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
    setTimeout(() => {
      setDisplayCount(prev => prev + 20)
      setIsLoadingMore(false)
    }, 500)
  }

  return (
    <AdminLayout pageTitle="儲值明細" breadcrumbs={[{ label: '儲值明細', href: '/recharges' }]}>
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
                  { value: 'all', label: '全部狀態' },
                  { value: 'success', label: '成功' },
                  { value: 'pending', label: '處理中' },
                  { value: 'failed', label: '失敗' },
                ]
              }
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'created_at', label: '時間', visible: visibleColumns.created_at },
              { key: 'order_number', label: '訂單編號', visible: visibleColumns.order_number },
              { key: 'trade_no', label: '藍新序號', visible: visibleColumns.trade_no },
              { key: 'user', label: '用戶', visible: visibleColumns.user },
              { key: 'amount', label: '儲值金額(TWD)', visible: visibleColumns.amount },
              { key: 'bonus', label: '贈送代幣(G)', visible: visibleColumns.bonus },
              { key: 'payment_method', label: '付款方式', visible: visibleColumns.payment_method },
              { key: 'status', label: '狀態', visible: visibleColumns.status }
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
