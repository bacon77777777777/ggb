'use client'

import { AdminLayout, StatsCard, PageCard, SearchToolbar, FilterTags, SortableTableHeader } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface LogEntry {
  id: number
  timestamp: string
  user: string
  role: string
  action: string
  target: string
  details: string
  ip: string
  status: 'success' | 'failed'
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isMounted, setIsMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState('all')
  const [selectedAction, setSelectedAction] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [sortField, setSortField] = useState<string>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [displayCount, setDisplayCount] = useState(50)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const observerTarget = useRef<HTMLDivElement>(null)
  
  // 密度控制
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact')
  const [visibleColumns, setVisibleColumns] = useState({
    timestamp: true,
    user: true,
    role: true,
    action: true,
    target: true,
    details: true,
    ip: true,
    status: true
  })


  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredLogs = useMemo(() => {
    if (!isMounted) return []
    return logs.filter(log => {
      const matchSearch = !searchQuery || 
        log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.ip.includes(searchQuery)
      const matchUser = selectedUser === 'all' || log.user === selectedUser
      const matchAction = selectedAction === 'all' || log.action === selectedAction
      const matchStatus = selectedStatus === 'all' || log.status === selectedStatus
      return matchSearch && matchUser && matchAction && matchStatus
    })
  }, [logs, searchQuery, selectedUser, selectedAction, selectedStatus, isMounted])

  const sortedLogs = useMemo(() => {
    if (!isMounted) return []
    return [...filteredLogs].sort((a, b) => {
    let aValue: any, bValue: any
    switch (sortField) {
      case 'timestamp': aValue = a.timestamp; bValue = b.timestamp; break
      case 'user': aValue = a.user; bValue = b.user; break
      case 'role': aValue = a.role; bValue = b.role; break
      case 'action': aValue = a.action; bValue = b.action; break
      case 'target': aValue = a.target; bValue = b.target; break
      case 'details': aValue = a.details; bValue = b.details; break
      case 'ip': aValue = a.ip; bValue = b.ip; break
      case 'status': aValue = a.status; bValue = b.status; break
      default: aValue = a.timestamp; bValue = b.timestamp
    }
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }
    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
  }, [filteredLogs, sortField, sortDirection, isMounted])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && displayCount < sortedLogs.length) {
          setIsLoadingMore(true)
          setTimeout(() => {
            setDisplayCount(prev => Math.min(prev + 20, sortedLogs.length))
            setIsLoadingMore(false)
          }, 300)
        }
      },
      { threshold: 0.1 }
    )
    if (observerTarget.current) observer.observe(observerTarget.current)
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current) }
  }, [displayCount, sortedLogs.length, isLoadingMore])

  useEffect(() => {
    setIsMounted(true)
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('action_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000)
      
      if (error) throw error

      if (data) {
        const mappedLogs: LogEntry[] = data.map(log => ({
          id: log.id,
          timestamp: log.created_at,
          user: log.username,
          role: log.role || 'Unknown',
          action: log.action,
          target: log.target || '',
          details: log.details || '',
          ip: log.ip || '',
          status: (log.status as 'success' | 'failed') || 'success'
        }))
        setLogs(mappedLogs)
      }
    } catch (error) {
      console.error('Error fetching logs:', error)
    }
  }

  useEffect(() => {
    setDisplayCount(50)
  }, [searchQuery, selectedUser, selectedAction, selectedStatus, sortField, sortDirection])

  // 匯出CSV功能
  const handleExportCSV = () => {
    const visibleColumnsList = [
      { key: 'timestamp', label: '時間' },
      { key: 'user', label: '用戶' },
      { key: 'role', label: '角色' },
      { key: 'action', label: '操作' },
      { key: 'target', label: '目標' },
      { key: 'details', label: '詳情' },
      { key: 'ip', label: 'IP' },
      { key: 'status', label: '狀態' }
    ].filter(col => visibleColumns[col.key as keyof typeof visibleColumns])
    
    const headers = visibleColumnsList.map(col => col.label)
    
    const csvData = sortedLogs.map(log => {
      return visibleColumnsList.map(col => {
        switch (col.key) {
          case 'timestamp': return formatDateTime(log.timestamp)
          case 'user': return log.user
          case 'role': return log.role
          case 'action': return log.action
          case 'target': return log.target
          case 'details': return log.details
          case 'ip': return log.ip
          case 'status': return log.status === 'success' ? '成功' : '失敗'
          default: return ''
        }
      })
    })
    
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `操作記錄_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 統計數據（只在客戶端計算）
  const totalLogs = useMemo(() => isMounted ? logs.length : 0, [logs, isMounted])
  const successLogs = useMemo(() => isMounted ? logs.filter(l => l.status === 'success').length : 0, [logs, isMounted])
  const failedLogs = useMemo(() => isMounted ? logs.filter(l => l.status === 'failed').length : 0, [logs, isMounted])
  const uniqueUsers = useMemo(() => isMounted ? new Set(logs.map(l => l.user)).size : 0, [logs, isMounted])

  // 獲取所有用戶和操作類型（只在客戶端計算）
  const allUsers = useMemo(() => {
    if (!isMounted) return []
    return Array.from(new Set(logs.map(l => l.user))).sort()
  }, [logs, isMounted])
  
  const allActions = useMemo(() => {
    if (!isMounted) return []
    return Array.from(new Set(logs.map(l => l.action))).sort()
  }, [logs, isMounted])

  // 密度樣式
  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  return (
    <AdminLayout pageTitle="操作記錄" breadcrumbs={[{ label: '操作記錄', href: '/logs' }]}>
      <div className="space-y-6">
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="總記錄數"
            value={totalLogs}
            onClick={() => { setSelectedStatus('all'); setSelectedUser('all'); setSelectedAction('all'); setSearchQuery('') }}
          />
          <StatsCard
            title="成功操作"
            value={successLogs}
            onClick={() => { setSelectedStatus('success'); setSelectedUser('all'); setSelectedAction('all'); setSearchQuery('') }}
            isActive={selectedStatus === 'success'}
            activeColor="green"
          />
          <StatsCard
            title="失敗操作"
            value={failedLogs}
            onClick={() => { setSelectedStatus('failed'); setSelectedUser('all'); setSelectedAction('all'); setSearchQuery('') }}
            isActive={selectedStatus === 'failed'}
            activeColor="red"
          />
          <StatsCard
            title="活躍用戶"
            value={uniqueUsers}
            onClick={() => { setSelectedStatus('all'); setSelectedUser('all'); setSelectedAction('all'); setSearchQuery('') }}
            activeColor="primary"
          />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋用戶、操作、目標、IP..."
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
                key: 'user',
                label: '用戶',
                type: 'select',
                value: selectedUser,
                onChange: setSelectedUser,
                options: [
                  { value: 'all', label: '全部用戶' },
                  ...allUsers.map(u => ({ value: u, label: u }))
                ]
              },
              {
                key: 'action',
                label: '操作類型',
                type: 'select',
                value: selectedAction,
                onChange: setSelectedAction,
                options: [
                  { value: 'all', label: '全部操作' },
                  ...allActions.map(a => ({ value: a, label: a }))
                ]
              },
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
              }
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'timestamp', label: '時間', visible: visibleColumns.timestamp },
              { key: 'user', label: '用戶', visible: visibleColumns.user },
              { key: 'role', label: '角色', visible: visibleColumns.role },
              { key: 'action', label: '操作', visible: visibleColumns.action },
              { key: 'target', label: '目標', visible: visibleColumns.target },
              { key: 'details', label: '詳情', visible: visibleColumns.details },
              { key: 'ip', label: 'IP', visible: visibleColumns.ip },
              { key: 'status', label: '狀態', visible: visibleColumns.status }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
          />

          {/* 篩選條件 Tags */}
          <FilterTags
            tags={[
              ...(selectedUser !== 'all' ? [{
                key: 'user',
                label: '用戶',
                value: selectedUser,
                color: 'primary' as const,
                onRemove: () => setSelectedUser('all')
              }] : []),
              ...(selectedAction !== 'all' ? [{
                key: 'action',
                label: '操作類型',
                value: selectedAction,
                color: 'primary' as const,
                onRemove: () => setSelectedAction('all')
              }] : []),
              ...(selectedStatus !== 'all' ? [{
                key: 'status',
                label: '狀態',
                value: selectedStatus === 'success' ? '成功' : '失敗',
                color: selectedStatus === 'success' ? 'green' as const : 'red' as const,
                onRemove: () => setSelectedStatus('all')
              }] : [])
            ]}
            onClearAll={() => { setSelectedStatus('all'); setSelectedUser('all'); setSelectedAction('all') }}
          />

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  {visibleColumns.timestamp && (
                    <SortableTableHeader sortKey="timestamp" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      時間
                    </SortableTableHeader>
                  )}
                  {visibleColumns.user && (
                    <SortableTableHeader sortKey="user" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      用戶
                    </SortableTableHeader>
                  )}
                  {visibleColumns.role && (
                    <SortableTableHeader sortKey="role" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      角色
                    </SortableTableHeader>
                  )}
                  {visibleColumns.action && (
                    <SortableTableHeader sortKey="action" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      操作
                    </SortableTableHeader>
                  )}
                  {visibleColumns.target && (
                    <SortableTableHeader sortKey="target" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      目標
                    </SortableTableHeader>
                  )}
                  {visibleColumns.details && (
                    <th className={`${getDensityClasses()} text-left text-sm font-semibold text-neutral-700`}>詳情</th>
                  )}
                  {visibleColumns.ip && (
                    <SortableTableHeader sortKey="ip" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      IP
                    </SortableTableHeader>
                  )}
                  {visibleColumns.status && (
                    <SortableTableHeader sortKey="status" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      狀態
                    </SortableTableHeader>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedLogs.slice(0, displayCount).map((log) => (
                  <tr 
                    key={log.id} 
                    className="border-b border-neutral-100 hover:bg-neutral-50"
                  >
                    {visibleColumns.timestamp && (
                      <td className={`${getDensityClasses()} text-sm text-neutral-700 font-mono whitespace-nowrap`}><span className="whitespace-nowrap">{formatDateTime(log.timestamp)}</span></td>
                    )}
                    {visibleColumns.user && (
                      <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}><span className="whitespace-nowrap">{log.user}</span></td>
                    )}
                    {visibleColumns.role && (
                      <td className={`${getDensityClasses()} text-sm text-neutral-600 whitespace-nowrap`}><span className="whitespace-nowrap">{log.role}</span></td>
                    )}
                    {visibleColumns.action && (
                      <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}><span className="whitespace-nowrap">{log.action}</span></td>
                    )}
                    {visibleColumns.target && (
                      <td className={`${getDensityClasses()} text-sm text-neutral-600 whitespace-nowrap`}><span className="whitespace-nowrap">{log.target}</span></td>
                    )}
                    {visibleColumns.details && (
                      <td className={`${getDensityClasses()} text-sm text-neutral-600 whitespace-nowrap`}><span className="whitespace-nowrap">{log.details}</span></td>
                    )}
                    {visibleColumns.ip && (
                      <td className={`${getDensityClasses()} text-sm text-neutral-500 font-mono whitespace-nowrap`}><span className="whitespace-nowrap">{log.ip}</span></td>
                    )}
                    {visibleColumns.status && (
                      <td className={`${getDensityClasses()} whitespace-nowrap`}>
                        <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                          log.status === 'success' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {log.status === 'success' ? '成功' : '失敗'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {displayCount < sortedLogs.length && (
              <div ref={observerTarget} className="py-8 text-center">
                {isLoadingMore ? (
                  <div className="flex items-center justify-center gap-2 text-neutral-500">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    <span className="text-sm">載入中...</span>
                  </div>
                ) : <div className="h-4"></div>}
              </div>
            )}
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
