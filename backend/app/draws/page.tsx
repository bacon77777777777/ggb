'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, DataTable, FilterTags, DateRangePicker, type Column } from '@/components'
import Badge from '@/components/ui/Badge'
import { useState, useEffect, useMemo } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { formatDateTime } from '@/utils/dateFormat'

interface DrawRecord {
  id: number
  user_id: string
  product_id: number
  prize_level: string
  prize_name: string
  created_at: string
  ticket_number: number
  status: string
  user?: { name: string; email: string; id: string }
  product?: { name: string; image_url: string; price?: number; type?: string }
}

export default function DrawsPage() {
  const [records, setRecords] = useState<DrawRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('draws', 'compact', {
    created_at: true, user: true, product: true, prize_level: true, ticket_number: true, status: true
  })

  // 篩選與欄位顯示狀態
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedPrizeLevel, setSelectedPrizeLevel] = useState<string>('all')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/draw-records', { method: 'GET', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || res.statusText || '載入失敗')
      }
      const data = (await res.json()) as DrawRecord[]
      setRecords(data || [])
    } catch (error) {
      console.error('Error fetching draw records:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredRecords = useMemo(() => {
    let result = records
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r => 
        r.user?.name?.toLowerCase().includes(q) ||
        r.user?.email?.toLowerCase().includes(q) ||
        r.product?.name?.toLowerCase().includes(q) ||
        String(r.ticket_number).includes(q)
      )
    }
    
    // 狀態過濾
    if (selectedStatus !== 'all') {
      result = result.filter(r => r.status === selectedStatus)
    }

    // 賞品等級過濾
    if (selectedPrizeLevel !== 'all') {
      result = result.filter(r => r.prize_level === selectedPrizeLevel)
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
  }, [records, searchQuery, selectedStatus, selectedPrizeLevel, filterStartDate, filterEndDate])

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
        case 'product':
          aValue = a.product?.name || ''
          bValue = b.product?.name || ''
          break
        case 'prize_level':
          aValue = a.prize_level
          bValue = b.prize_level
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const formatDrawId = (id: number, dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const year = d.getFullYear().toString().slice(-2);
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      // Generate pseudo-random 4 digits from ID (stable)
      const suffix = ((id * 1367) % 10000).toString().padStart(4, '0');
      return `TX${year}${month}${day}${suffix}`;
    } catch (e) {
      return `TX${id}`;
    }
  };

  const columns: Column<DrawRecord>[] = [
    {
      key: 'id',
      label: '編號',
      render: (record) => <span className="text-xs font-mono font-bold text-neutral-600 bg-neutral-100 px-2 py-1 rounded">{formatDrawId(record.id, record.created_at)}</span>
    },
    {
      key: 'created_at',
      label: '時間',
      sortable: true,
      render: (record) => <span className="text-neutral-500 font-mono whitespace-nowrap">{formatDateTime(record.created_at)}</span>
    },
    {
      key: 'user',
      label: '用戶',
      sortable: true,
      render: (record) => (
        <div>
          <div className="font-medium text-neutral-900">{record.user?.name || '未知用戶'}</div>
          <div className="text-xs text-neutral-500">{record.user?.email}</div>
        </div>
      )
    },
    {
      key: 'product',
      label: '商品',
      sortable: true,
      render: (record) => (
        <div className="flex items-center gap-2">
          {record.product?.image_url && (
            <img src={record.product.image_url} alt="" className="w-8 h-8 rounded object-cover" />
          )}
          <span className="truncate max-w-[200px]" title={record.product?.name}>{record.product?.name || '未知商品'}</span>
        </div>
      )
    },
    {
      key: 'prize_level',
      label: '品項',
      sortable: true,
      render: (record) => {
        const hasGrade = ['ichiban', 'card', 'custom'].includes(record.product?.type || '')
        return (
          <div className="flex items-center gap-1.5">
            {hasGrade && record.prize_level && (
              <Badge variant="warning" size="sm">{record.prize_level}</Badge>
            )}
            <span className="text-sm text-neutral-700">{record.prize_name || '—'}</span>
          </div>
        )
      }
    },
    {
      key: 'ticket_number',
      label: '籤號',
      className: 'font-mono'
    },
    {
      key: 'price',
      label: '消費(G)',
      render: (record) => (
        <span className="tabular-nums text-neutral-600">
          {record.product?.price != null ? record.product.price.toLocaleString() : '—'}
        </span>
      )
    },
    {
      key: 'status',
      label: '狀態',
      render: (record) => (
        <span className={`px-2 py-1 rounded text-xs ${
          record.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-600'
        }`}>
          {record.status === 'success' ? '成功' : record.status}
        </span>
      )
    }
  ]

  const handleExportCSV = () => {
    const BOM = '﻿'
    const headers = ['時間', '用戶姓名', '用戶Email', '商品', '賞等', '品項名稱', '籤號', '消費(G)', '狀態']
    const rows = sortedRecords.map(r => [
      formatDateTime(r.created_at),
      r.user?.name || '',
      r.user?.email || '',
      r.product?.name || '',
      r.prize_level || '',
      r.prize_name || '',
      String(r.ticket_number ?? ''),
      String(r.product?.price ?? ''),
      r.status === 'success' ? '成功' : r.status,
    ])
    const csv = BOM + [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `抽獎紀錄_${new Date().toISOString().split('T')[0]}.csv`
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
    <AdminLayout pageTitle="抽獎紀錄">
      <div className="space-y-6">
        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋用戶、商品、籤號..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showExportCSV={true}
            onExportCSV={handleExportCSV}
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
                  { value: 'failed', label: '失敗' }
                ]
              },
              {
                key: 'prize_level',
                label: '賞品等級',
                type: 'select',
                value: selectedPrizeLevel,
                onChange: setSelectedPrizeLevel,
                options: [
                  { value: 'all', label: '全部等級' },
                  { value: 'A', label: 'A賞' },
                  { value: 'B', label: 'B賞' },
                  { value: 'C', label: 'C賞' },
                  { value: 'D', label: 'D賞' },
                  { value: 'E', label: 'E賞' },
                  { value: 'F', label: 'F賞' },
                  { value: 'G', label: 'G賞' },
                  { value: 'H', label: 'H賞' },
                  { value: 'LAST', label: 'Last賞' }
                ]
              },
              {
                key: 'date',
                label: '抽獎時間',
                type: 'date-range',
                startDate: filterStartDate,
                endDate: filterEndDate,
                render: () => (
                  <DateRangePicker
                    startDate={filterStartDate}
                    endDate={filterEndDate}
                    onStartDateChange={setFilterStartDate}
                    onEndDateChange={setFilterEndDate}
                    placeholder="選擇時間範圍"
                  />
                )
              }
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'created_at', label: '時間', visible: visibleColumns.created_at },
              { key: 'user', label: '用戶', visible: visibleColumns.user },
              { key: 'product', label: '商品', visible: visibleColumns.product },
              { key: 'prize_level', label: '品項', visible: visibleColumns.prize_level },
              { key: 'ticket_number', label: '籤號', visible: visibleColumns.ticket_number },
              { key: 'status', label: '狀態', visible: visibleColumns.status }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
          />

          <FilterTags
            tags={[
              ...(selectedStatus !== 'all' ? [{
                key: 'status',
                label: '狀態',
                value: selectedStatus === 'success' ? '成功' : '失敗',
                color: 'primary' as const,
                onRemove: () => setSelectedStatus('all')
              }] : []),
              ...(selectedPrizeLevel !== 'all' ? [{
                key: 'prize_level',
                label: '等級',
                value: selectedPrizeLevel + '賞',
                color: 'yellow' as const,
                onRemove: () => setSelectedPrizeLevel('all')
              }] : []),
              ...((filterStartDate || filterEndDate) ? [{
                key: 'date',
                label: '時間',
                value: `${filterStartDate || '起始'} - ${filterEndDate || '結束'}`,
                color: 'blue' as const,
                onRemove: () => { setFilterStartDate(''); setFilterEndDate('') }
              }] : [])
            ]}
            onClearAll={() => {
              setSelectedStatus('all')
              setSelectedPrizeLevel('all')
              setFilterStartDate('')
              setFilterEndDate('')
            }}
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
              isLoading={isLoading}
            />
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
