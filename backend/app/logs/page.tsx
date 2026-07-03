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

interface UserEventEntry {
  id: number
  userId: string
  userName: string
  eventType: string
  detail: Record<string, any> | null
  ip: string
  createdAt: string
}

const EVENT_LABEL: Record<string, string> = {
  login: '登入',
  draw: '抽獎',
  topup: '儲值',
}

const EVENT_COLOR: Record<string, string> = {
  login: 'bg-blue-100 text-blue-700',
  draw: 'bg-purple-100 text-purple-700',
  topup: 'bg-green-100 text-green-700',
}

function getEventDetail(event: UserEventEntry): string {
  const d = event.detail
  if (!d) return '-'
  if (event.eventType === 'draw') {
    return `${d.product_name || ''} x${d.count || 1}（${d.use_points ? '積分' : `NT$${d.total_cost ?? ''}`}）`
  }
  if (event.eventType === 'topup') {
    return `NT$${d.amount ?? ''} ${d.payment_type ?? ''}`
  }
  return '-'
}

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState<'admin' | 'user'>('admin')

  // --- Admin logs state ---
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
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact')
  const [visibleColumns, setVisibleColumns] = useState({
    timestamp: true, user: true, role: true, action: true,
    target: true, details: true, ip: true, status: true
  })

  // --- User events state ---
  const [userEvents, setUserEvents] = useState<UserEventEntry[]>([])
  const [userEventsLoading, setUserEventsLoading] = useState(false)
  const [ueSearch, setUeSearch] = useState('')
  const [ueEventType, setUeEventType] = useState('all')
  const [ueDisplayCount, setUeDisplayCount] = useState(50)
  const ueObserverTarget = useRef<HTMLDivElement>(null)
  const [ueLoadingMore, setUeLoadingMore] = useState(false)

  // --- Anomaly detection: IPs with ≥10 draw events in any 5-min window ---
  const suspiciousIps = useMemo(() => {
    const drawEvents = userEvents.filter(e => e.eventType === 'draw' && e.ip && e.ip !== 'unknown')
    const ipTimes: Record<string, number[]> = {}
    for (const e of drawEvents) {
      if (!ipTimes[e.ip]) ipTimes[e.ip] = []
      ipTimes[e.ip].push(new Date(e.createdAt).getTime())
    }
    const suspicious = new Set<string>()
    for (const [ip, times] of Object.entries(ipTimes)) {
      const sorted = times.sort((a, b) => a - b)
      for (let i = 0; i < sorted.length; i++) {
        const windowEnd = sorted[i] + 5 * 60 * 1000
        let count = 0
        for (let j = i; j < sorted.length && sorted[j] <= windowEnd; j++) count++
        if (count >= 10) { suspicious.add(ip); break }
      }
    }
    return suspicious
  }, [userEvents])

  const filteredUserEvents = useMemo(() => {
    return userEvents.filter(e => {
      const matchSearch = !ueSearch ||
        e.userName.toLowerCase().includes(ueSearch.toLowerCase()) ||
        e.ip.includes(ueSearch) ||
        (e.detail && JSON.stringify(e.detail).toLowerCase().includes(ueSearch.toLowerCase()))
      const matchType = ueEventType === 'all' || e.eventType === ueEventType
      return matchSearch && matchType
    })
  }, [userEvents, ueSearch, ueEventType])

  // Admin logs helpers
  const handleSort = (field: string) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDirection('asc') }
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
        default: aValue = a.timestamp; bValue = b.timestamp
      }
      if (typeof aValue === 'string') return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
  }, [filteredLogs, sortField, sortDirection, isMounted])

  // Infinite scroll - admin
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isLoadingMore && displayCount < sortedLogs.length) {
        setIsLoadingMore(true)
        setTimeout(() => { setDisplayCount(prev => Math.min(prev + 20, sortedLogs.length)); setIsLoadingMore(false) }, 300)
      }
    }, { threshold: 0.1 })
    if (observerTarget.current) observer.observe(observerTarget.current)
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current) }
  }, [displayCount, sortedLogs.length, isLoadingMore])

  // Infinite scroll - user events
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !ueLoadingMore && ueDisplayCount < filteredUserEvents.length) {
        setUeLoadingMore(true)
        setTimeout(() => { setUeDisplayCount(prev => Math.min(prev + 20, filteredUserEvents.length)); setUeLoadingMore(false) }, 300)
      }
    }, { threshold: 0.1 })
    if (ueObserverTarget.current) observer.observe(ueObserverTarget.current)
    return () => { if (ueObserverTarget.current) observer.unobserve(ueObserverTarget.current) }
  }, [ueDisplayCount, filteredUserEvents.length, ueLoadingMore])

  useEffect(() => { setIsMounted(true); fetchLogs() }, [])

  useEffect(() => {
    if (activeTab === 'user' && userEvents.length === 0) fetchUserEvents()
  }, [activeTab])

  useEffect(() => { setDisplayCount(50) }, [searchQuery, selectedUser, selectedAction, selectedStatus, sortField, sortDirection])
  useEffect(() => { setUeDisplayCount(50) }, [ueSearch, ueEventType])

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('action_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      if (data) {
        setLogs(data.map(log => ({
          id: log.id,
          timestamp: log.created_at,
          user: log.username,
          role: log.role || 'Unknown',
          action: log.action,
          target: log.target || '',
          details: log.details || '',
          ip: log.ip || '',
          status: (log.status as 'success' | 'failed') || 'success'
        })))
      }
    } catch (error) { console.error('Error fetching logs:', error) }
  }

  const fetchUserEvents = async () => {
    setUserEventsLoading(true)
    try {
      const res = await fetch('/api/admin/user-events')
      if (res.ok) setUserEvents(await res.json())
    } catch (e) { console.error(e) }
    finally { setUserEventsLoading(false) }
  }

  const totalLogs = useMemo(() => isMounted ? logs.length : 0, [logs, isMounted])
  const successLogs = useMemo(() => isMounted ? logs.filter(l => l.status === 'success').length : 0, [logs, isMounted])
  const failedLogs = useMemo(() => isMounted ? logs.filter(l => l.status === 'failed').length : 0, [logs, isMounted])
  const uniqueUsers = useMemo(() => isMounted ? new Set(logs.map(l => l.user)).size : 0, [logs, isMounted])
  const allUsers = useMemo(() => { if (!isMounted) return []; return Array.from(new Set(logs.map(l => l.user))).sort() }, [logs, isMounted])
  const allActions = useMemo(() => { if (!isMounted) return []; return Array.from(new Set(logs.map(l => l.action))).sort() }, [logs, isMounted])

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
        {/* Tab 切換 */}
        <div className="flex gap-1 border-b border-neutral-200">
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'admin'
                ? 'border-primary text-primary'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            後台操作
          </button>
          <button
            onClick={() => setActiveTab('user')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'user'
                ? 'border-primary text-primary'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            前台事件
            {suspiciousIps.size > 0 && (
              <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">
                {suspiciousIps.size} 異常
              </span>
            )}
          </button>
        </div>

        {/* ===== 後台操作 Tab ===== */}
        {activeTab === 'admin' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard title="總記錄數" value={totalLogs} onClick={() => { setSelectedStatus('all'); setSelectedUser('all'); setSelectedAction('all'); setSearchQuery('') }} />
              <StatsCard title="成功操作" value={successLogs} onClick={() => { setSelectedStatus('success'); setSelectedUser('all'); setSelectedAction('all'); setSearchQuery('') }} isActive={selectedStatus === 'success'} activeColor="green" />
              <StatsCard title="失敗操作" value={failedLogs} onClick={() => { setSelectedStatus('failed'); setSelectedUser('all'); setSelectedAction('all'); setSearchQuery('') }} isActive={selectedStatus === 'failed'} activeColor="red" />
              <StatsCard title="活躍管理員" value={uniqueUsers} onClick={() => { setSelectedStatus('all'); setSelectedUser('all'); setSelectedAction('all'); setSearchQuery('') }} activeColor="primary" />
            </div>

            <PageCard>
              <SearchToolbar
                searchPlaceholder="搜尋用戶、操作、目標、IP..."
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                showExportCSV={false}
                showDensity={true}
                density={tableDensity}
                onDensityChange={setTableDensity}
                showFilter={true}
                filterOptions={[
                  { key: 'user', label: '用戶', type: 'select', value: selectedUser, onChange: setSelectedUser, options: [{ value: 'all', label: '全部用戶' }, ...allUsers.map(u => ({ value: u, label: u }))] },
                  { key: 'action', label: '操作類型', type: 'select', value: selectedAction, onChange: setSelectedAction, options: [{ value: 'all', label: '全部操作' }, ...allActions.map(a => ({ value: a, label: a }))] },
                  { key: 'status', label: '狀態', type: 'select', value: selectedStatus, onChange: setSelectedStatus, options: [{ value: 'all', label: '全部狀態' }, { value: 'success', label: '成功' }, { value: 'failed', label: '失敗' }] }
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
              <FilterTags
                tags={[
                  ...(selectedUser !== 'all' ? [{ key: 'user', label: '用戶', value: selectedUser, color: 'primary' as const, onRemove: () => setSelectedUser('all') }] : []),
                  ...(selectedAction !== 'all' ? [{ key: 'action', label: '操作類型', value: selectedAction, color: 'primary' as const, onRemove: () => setSelectedAction('all') }] : []),
                  ...(selectedStatus !== 'all' ? [{ key: 'status', label: '狀態', value: selectedStatus === 'success' ? '成功' : '失敗', color: selectedStatus === 'success' ? 'green' as const : 'red' as const, onRemove: () => setSelectedStatus('all') }] : [])
                ]}
                onClearAll={() => { setSelectedStatus('all'); setSelectedUser('all'); setSelectedAction('all') }}
              />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-200">
                      {visibleColumns.timestamp && <SortableTableHeader sortKey="timestamp" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>時間</SortableTableHeader>}
                      {visibleColumns.user && <SortableTableHeader sortKey="user" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>用戶</SortableTableHeader>}
                      {visibleColumns.role && <SortableTableHeader sortKey="role" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>角色</SortableTableHeader>}
                      {visibleColumns.action && <SortableTableHeader sortKey="action" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>操作</SortableTableHeader>}
                      {visibleColumns.target && <SortableTableHeader sortKey="target" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>目標</SortableTableHeader>}
                      {visibleColumns.details && <th className={`${getDensityClasses()} text-left text-sm font-semibold text-neutral-700`}>詳情</th>}
                      {visibleColumns.ip && <SortableTableHeader sortKey="ip" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>IP</SortableTableHeader>}
                      {visibleColumns.status && <SortableTableHeader sortKey="status" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>狀態</SortableTableHeader>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLogs.slice(0, displayCount).map((log) => (
                      <tr key={log.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                        {visibleColumns.timestamp && <td className={`${getDensityClasses()} text-sm text-neutral-700 font-mono whitespace-nowrap`}>{formatDateTime(log.timestamp)}</td>}
                        {visibleColumns.user && <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>{log.user}</td>}
                        {visibleColumns.role && <td className={`${getDensityClasses()} text-sm text-neutral-600 whitespace-nowrap`}>{log.role}</td>}
                        {visibleColumns.action && <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>{log.action}</td>}
                        {visibleColumns.target && <td className={`${getDensityClasses()} text-sm text-neutral-600 whitespace-nowrap`}>{log.target}</td>}
                        {visibleColumns.details && <td className={`${getDensityClasses()} text-sm text-neutral-600 whitespace-nowrap`}>{log.details}</td>}
                        {visibleColumns.ip && <td className={`${getDensityClasses()} text-sm text-neutral-500 font-mono whitespace-nowrap`}>{log.ip}</td>}
                        {visibleColumns.status && (
                          <td className={`${getDensityClasses()} whitespace-nowrap`}>
                            <span className={`px-2 py-1 text-xs rounded-full ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
                    {isLoadingMore && <div className="flex items-center justify-center gap-2 text-neutral-500"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div><span className="text-sm">載入中...</span></div>}
                  </div>
                )}
              </div>
            </PageCard>
          </>
        )}

        {/* ===== 前台事件 Tab ===== */}
        {activeTab === 'user' && (
          <>
            {suspiciousIps.size > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
                <span className="text-red-500 text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-medium text-red-700">偵測到可疑 IP（5 分鐘內抽獎 ≥10 次）</p>
                  <p className="text-xs text-red-600 mt-0.5 font-mono">{[...suspiciousIps].join('、')}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatsCard title="總事件數" value={userEvents.length} />
              <StatsCard title="登入次數" value={userEvents.filter(e => e.eventType === 'login').length} activeColor="primary" />
              <StatsCard title="抽獎次數" value={userEvents.filter(e => e.eventType === 'draw').length} activeColor="green" />
            </div>

            <PageCard>
              <div className="flex flex-wrap gap-3 items-center mb-4">
                <input
                  type="text"
                  placeholder="搜尋用戶名稱、IP..."
                  value={ueSearch}
                  onChange={e => setUeSearch(e.target.value)}
                  className="border border-neutral-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <select
                  value={ueEventType}
                  onChange={e => setUeEventType(e.target.value)}
                  className="border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="all">全部事件</option>
                  <option value="login">登入</option>
                  <option value="draw">抽獎</option>
                  <option value="topup">儲值</option>
                </select>
                <span className="text-sm text-neutral-500">{filteredUserEvents.length} 筆</span>
              </div>

              {userEventsLoading ? (
                <div className="py-12 text-center text-neutral-400 text-sm">載入中...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="py-2 px-2 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">時間</th>
                        <th className="py-2 px-2 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">事件</th>
                        <th className="py-2 px-2 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">用戶</th>
                        <th className="py-2 px-2 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">詳情</th>
                        <th className="py-2 px-2 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUserEvents.slice(0, ueDisplayCount).map((event) => {
                        const isSuspicious = suspiciousIps.has(event.ip)
                        return (
                          <tr key={event.id} className={`border-b border-neutral-100 ${isSuspicious ? 'bg-red-50' : 'hover:bg-neutral-50'}`}>
                            <td className="py-2 px-2 text-sm text-neutral-700 font-mono whitespace-nowrap">
                              {formatDateTime(event.createdAt)}
                            </td>
                            <td className="py-2 px-2 whitespace-nowrap">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${EVENT_COLOR[event.eventType] || 'bg-neutral-100 text-neutral-600'}`}>
                                {EVENT_LABEL[event.eventType] || event.eventType}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-sm text-neutral-700 whitespace-nowrap">
                              {event.userId ? (
                                <a href={`/users/${event.userId}`} className="text-primary hover:underline">
                                  {event.userName}
                                </a>
                              ) : event.userName}
                            </td>
                            <td className="py-2 px-2 text-sm text-neutral-600 whitespace-nowrap">
                              {getEventDetail(event)}
                            </td>
                            <td className={`py-2 px-2 text-sm font-mono whitespace-nowrap ${isSuspicious ? 'text-red-600 font-semibold' : 'text-neutral-500'}`}>
                              {event.ip || '-'}
                              {isSuspicious && <span className="ml-1 text-xs">⚠️</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {ueDisplayCount < filteredUserEvents.length && (
                    <div ref={ueObserverTarget} className="py-8 text-center">
                      {ueLoadingMore && <div className="flex items-center justify-center gap-2 text-neutral-500"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div><span className="text-sm">載入中...</span></div>}
                    </div>
                  )}
                  {filteredUserEvents.length === 0 && !userEventsLoading && (
                    <div className="py-12 text-center text-neutral-400 text-sm">
                      {userEvents.length === 0 ? '尚無前台事件記錄' : '沒有符合條件的記錄'}
                    </div>
                  )}
                </div>
              )}
            </PageCard>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
