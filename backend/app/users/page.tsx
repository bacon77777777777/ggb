'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatDateTime } from '@/utils/dateFormat'
import { 
  AdminLayout, 
  StatsCard, 
  SearchToolbar, 
  DataTable, 
  PageCard,
  FilterTags,
  Modal,
  type Column,
  CopyableID
} from '@/components'
import DateRangePicker from '@/components/DateRangePicker'
import { supabase } from '@/lib/supabaseClient'

interface User {
  id: string
  userId: string
  inviteCode: string | null
  name: string
  email: string
  phone: string
  tokens: number
  points: number
  registerDate: string
  lastLoginDate: string
  lastLoginIp: string
  status: 'active' | 'inactive'
  isBot: boolean
  totalOrders: number
  totalSpent: number
  totalDraws: number
  address?: string
}

interface CreateUserForm {
  name: string
  email: string
  password: string
  phone: string
  tokens: string
  status: 'active' | 'inactive'
  address: string
}

const EMPTY_CREATE_USER_FORM: CreateUserForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  tokens: '0',
  status: 'active',
  address: ''
}

export default function UsersPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [sortField, setSortField] = useState<string>('userId')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact')
  const [selectedUsers, setSelectedUsers] = useState<Set<number | string>>(new Set())
  const [visibleColumns, setVisibleColumns] = useState({
    userId: true,
    inviteCode: true,
    name: true,
    email: true,
    phone: true,
    tokens: true,
    points: true,
    totalDraws: true,
    totalSpent: true,
    status: true,
    registerDate: true,
    lastLoginDate: true,
    lastLoginIp: true,
    isBot: true,
    operations: true
  })

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // 使用集中的使用者資料
  const [users, setUsers] = useState<User[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createUserForm, setCreateUserForm] = useState<CreateUserForm>(EMPTY_CREATE_USER_FORM)
  const [createUserError, setCreateUserError] = useState('')
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  
  // 使用者狀態管理（用於開關切換）
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: 'active' | 'inactive' }>({})
  const [userBotFlags, setUserBotFlags] = useState<{ [key: string]: boolean }>({})

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        console.error('Error fetching users:', await res.text())
        return
      }

      const data: User[] = await res.json()
      if (Array.isArray(data)) {
        setUsers(data)
        const statuses: { [key: string]: 'active' | 'inactive' } = {}
        const bots: { [key: string]: boolean } = {}
        data.forEach(user => {
          statuses[user.id] = user.status
          bots[user.id] = user.isBot
        })
        setUserStatuses(statuses)
        setUserBotFlags(bots)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const handleCreateUser = async () => {
    setCreateUserError('')
    setIsCreatingUser(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createUserForm.name,
          email: createUserForm.email,
          password: createUserForm.password,
          phone: createUserForm.phone,
          tokens: createUserForm.tokens,
          status: createUserForm.status,
          address: createUserForm.address,
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateUserError(data?.error || '新增會員失敗')
        return
      }

      setIsCreateModalOpen(false)
      setCreateUserForm(EMPTY_CREATE_USER_FORM)
      await fetchUsers()
    } catch (err) {
      console.error('Failed to create user:', err)
      setCreateUserError('新增會員失敗')
    } finally {
      setIsCreatingUser(false)
    }
  }

  // 篩選處理
  const filteredUsers = useMemo(() => {
    let result = users

    // 狀態篩選（使用實際的狀態）
    if (selectedStatus !== 'all') {
      result = result.filter(u => userStatuses[u.id] === selectedStatus)
    }

    // 搜尋篩選
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(u =>
        u.userId.includes(query) ||
        (u.inviteCode && u.inviteCode.toLowerCase().includes(query)) ||
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.phone.includes(query)
      )
    }

    // 註冊日期範圍篩選
    if (filterStartDate) {
      result = result.filter(u => {
        const registerDate = u.registerDate.split(' ')[0] // 取得日期部分 YYYY-MM-DD
        return registerDate >= filterStartDate
      })
    }
    if (filterEndDate) {
      result = result.filter(u => {
        const registerDate = u.registerDate.split(' ')[0]
        return registerDate <= filterEndDate
      })
    }

    return result
  }, [users, selectedStatus, searchQuery, filterStartDate, filterEndDate])

  // 排序處理
  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'userId': aValue = a.userId; bValue = b.userId; break
        case 'name': aValue = a.name; bValue = b.name; break
        case 'email': aValue = a.email; bValue = b.email; break
        case 'phone': aValue = a.phone; bValue = b.phone; break
        case 'tokens': aValue = a.tokens; bValue = b.tokens; break
        case 'totalOrders': aValue = a.totalOrders; bValue = b.totalOrders; break
        case 'totalSpent': aValue = a.totalSpent; bValue = b.totalSpent; break
        case 'status': aValue = userStatuses[a.id] === 'active' ? 1 : 0; bValue = userStatuses[b.id] === 'active' ? 1 : 0; break
        case 'registerDate': aValue = new Date(a.registerDate).getTime(); bValue = new Date(b.registerDate).getTime(); break
        case 'lastLoginDate': aValue = new Date(a.lastLoginDate).getTime(); bValue = new Date(b.lastLoginDate).getTime(); break
        case 'lastLoginIp': aValue = a.lastLoginIp || ''; bValue = b.lastLoginIp || ''; break
        default: aValue = a.userId; bValue = b.userId
      }

      if (typeof aValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      } else {
        return sortDirection === 'asc' 
          ? aValue - bValue
          : bValue - aValue
      }
    })
  }, [filteredUsers, sortField, sortDirection, userStatuses])

  // 無限滾動處理
  const handleLoadMore = () => {
    if (isLoadingMore || displayCount >= sortedUsers.length) return
    setIsLoadingMore(true)
    setTimeout(() => {
      setDisplayCount(prev => Math.min(prev + 10, sortedUsers.length))
      setIsLoadingMore(false)
    }, 300)
  }

  // 當篩選條件改變時，重置顯示數量
  useEffect(() => {
    setDisplayCount(20)
  }, [sortField, sortDirection, searchQuery, selectedStatus, filterStartDate, filterEndDate])

  // 匯出CSV功能
  const handleExportCSV = () => {
    // 獲取所有可見欄位的標題
    const visibleColumnsList = columns.filter(col => col.visible)
    const headers = visibleColumnsList.map(col => col.label)
    
    // 獲取所有資料（使用篩選後的資料）
    const csvData = sortedUsers.map(user => {
      return visibleColumnsList.map(col => {
        const value = user[col.key as keyof User]
        if (col.render) {
          // 如果有自定義渲染，需要提取實際值
          if (col.key === 'tokens') return user.tokens.toLocaleString()
          if (col.key === 'totalSpent') return user.totalSpent.toLocaleString()
          if (col.key === 'totalOrders') return user.totalOrders.toString()
          if (col.key === 'status') return userStatuses[user.id] === 'active' ? '啟用' : '停用'
          if (col.key === 'registerDate') return formatDateTime(user.registerDate)
          if (col.key === 'lastLoginDate') return formatDateTime(user.lastLoginDate)
          if (col.key === 'lastLoginIp') return user.lastLoginIp || ''
          return String(value || '')
        }
        if (col.key === 'status') {
          return userStatuses[user.id] === 'active' ? '啟用' : '停用'
        }
        if (col.key === 'registerDate') return formatDateTime(user.registerDate)
        if (col.key === 'lastLoginDate') return formatDateTime(user.lastLoginDate)
        if (col.key === 'lastLoginIp') return user.lastLoginIp || ''
        return String(value || '')
      })
    })
    
    // 組合CSV內容
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    // 添加BOM以支持中文
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `會員管理_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 確認 Modal 狀態
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    variant: 'primary' | 'danger'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'primary'
  })

  // 統計資料（使用實際的狀態）
  const totalUsers = users.length
  const activeUsers = users.filter(u => userStatuses[u.id] === 'active').length
  const inactiveUsers = users.filter(u => userStatuses[u.id] === 'inactive').length
  const totalTokens = users.reduce((sum, u) => sum + u.tokens, 0)
  const totalSpent = users.reduce((sum, u) => sum + u.totalSpent, 0)

  // 表格欄位定義
  const columns: Column<User>[] = [
    {
      key: 'inviteCode',
      label: '邀請碼',
      sortable: true,
      visible: visibleColumns.inviteCode,
      render: (user) => <span className="font-mono font-bold text-primary">{user.inviteCode || '-'}</span>
    },
    {
      key: 'name',
      label: '暱稱',
      sortable: true,
      visible: visibleColumns.name
    },
    {
      key: 'email',
      label: '電子郵件',
      sortable: true,
      visible: visibleColumns.email
    },
    {
      key: 'phone',
      label: '電話',
      sortable: true,
      visible: visibleColumns.phone,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.phone}</span>
    },
    {
      key: 'tokens',
      label: '代幣餘額(G)',
      sortable: true,
      visible: visibleColumns.tokens,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.tokens.toLocaleString()}</span>
    },
    {
      key: 'points',
      label: '積分餘額(P)',
      sortable: true,
      visible: visibleColumns.points,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.points?.toLocaleString() || '0'}</span>
    },
    {
      key: 'totalDraws',
      label: '抽獎數',
      sortable: true,
      visible: visibleColumns.totalDraws,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.totalDraws}</span>
    },
    {
      key: 'totalSpent',
      label: '總消費(TWD)',
      sortable: true,
      visible: visibleColumns.totalSpent,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.totalSpent.toLocaleString()}</span>
    },
    {
      key: 'status',
      label: '狀態',
      sortable: true,
      visible: visibleColumns.status,
      render: (user) => (
        <button
          onClick={async (e) => {
            e.stopPropagation()
            const newStatus = userStatuses[user.id] === 'active' ? 'inactive' : 'active'
            // Optimistic update
            setUserStatuses(prev => ({ ...prev, [user.id]: newStatus }))
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u))
            
            // Update Supabase
            try {
              const { error } = await supabase
                .from('users')
                .update({ status: newStatus })
                .eq('id', user.id)
                
              if (error) {
                console.error('Error updating status:', error)
                // Revert
                const oldStatus = newStatus === 'active' ? 'inactive' : 'active'
                setUserStatuses(prev => ({ ...prev, [user.id]: oldStatus }))
                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: oldStatus } : u))
              }
            } catch (err) {
              console.error('Unexpected error updating status:', err)
            }
          }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all flex-shrink-0 ${
            userStatuses[user.id] === 'active' ? 'bg-green-500' : 'bg-neutral-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            userStatuses[user.id] === 'active' ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      )
    },
    {
      key: 'isBot',
      label: '機器人',
      sortable: false,
      visible: visibleColumns.isBot,
      render: (user) => (
        <button
          onClick={async (e) => {
            e.stopPropagation()
            const newIsBot = !userBotFlags[user.id]
            setUserBotFlags(prev => ({ ...prev, [user.id]: newIsBot }))
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isBot: newIsBot } : u))
            try {
              const { error } = await supabase
                .from('users')
                .update({ is_bot: newIsBot })
                .eq('id', user.id)
              if (error) {
                console.error('Error updating is_bot:', error)
                setUserBotFlags(prev => ({ ...prev, [user.id]: !newIsBot }))
                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isBot: !newIsBot } : u))
              }
            } catch (err) {
              console.error('Unexpected error updating is_bot:', err)
            }
          }}
          title={userBotFlags[user.id] ? '已標記為機器人（點擊取消）' : '標記為機器人（排除排行榜）'}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all flex-shrink-0 ${
            userBotFlags[user.id] ? 'bg-orange-400' : 'bg-neutral-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            userBotFlags[user.id] ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      )
    },
    {
      key: 'registerDate',
      label: '註冊時間',
      sortable: true,
      visible: visibleColumns.registerDate,
      render: (user) => <span className="font-mono whitespace-nowrap">{formatDateTime(user.registerDate)}</span>
    },
    {
      key: 'lastLoginDate',
      label: '最後登入',
      sortable: true,
      visible: visibleColumns.lastLoginDate,
      render: (user) => <span className="font-mono whitespace-nowrap">{formatDateTime(user.lastLoginDate)}</span>
    },
    {
      key: 'lastLoginIp',
      label: '最後IP',
      sortable: true,
      visible: visibleColumns.lastLoginIp,
      render: (user) => <span className="font-mono whitespace-nowrap">{user.lastLoginIp || '-'}</span>
    },
    {
      key: 'userId',
      label: '使用者ID',
      sortable: true,
      visible: visibleColumns.userId,
      render: (user) => <CopyableID id={user.userId} />
    },
    {
      key: 'operations',
      label: '操作',
      visible: visibleColumns.operations,
      sticky: true,
      render: (user) => (
        <button 
          onClick={() => router.push(`/users/${user.id}`)}
          className="text-blue-500 hover:text-blue-700 text-sm font-medium whitespace-nowrap"
        >
          查看詳情
        </button>
      )
    }
  ]

  // 篩選標籤
  const filterTags = []
  if (selectedStatus !== 'all') {
    filterTags.push({
      key: 'status',
      label: '狀態',
      value: selectedStatus === 'active' ? '啟用' : '停用',
      color: 'primary' as const,
      onRemove: () => setSelectedStatus('all')
    })
  }

  return (
    <AdminLayout pageTitle="會員管理" breadcrumbs={[{ label: '會員管理', href: '/users' }]}>
      <div className="space-y-6">
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard
            title="總會員數"
            value={totalUsers}
            onClick={() => setSelectedStatus('all')}
          />
          <StatsCard
            title="啟用會員"
            value={activeUsers}
            onClick={() => setSelectedStatus('active')}
            isActive={selectedStatus === 'active'}
            activeColor="primary"
          />
          <StatsCard
            title="停用會員"
            value={inactiveUsers}
            onClick={() => setSelectedStatus('inactive')}
            isActive={selectedStatus === 'inactive'}
            activeColor="primary"
          />
          <StatsCard
            title="總代幣餘額"
            value={totalTokens}
            unit="G"
          />
          <StatsCard
            title="總消費金額"
            value={totalSpent}
            unit="TWD"
          />
        </div>

        {/* 表格區域 */}
        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋ID、推薦碼、名稱、電子郵件..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showAddButton={true}
            addButtonText="+ 新增會員"
            onAddClick={() => {
              setCreateUserError('')
              setCreateUserForm(EMPTY_CREATE_USER_FORM)
              setIsCreateModalOpen(true)
            }}
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
                  { value: 'active', label: '啟用' },
                  { value: 'inactive', label: '停用' }
                ]
              },
              {
                key: 'registerDate',
                label: '註冊時間',
                type: 'date-range',
                startDate: filterStartDate,
                endDate: filterEndDate,
                render: () => (
                  <DateRangePicker
                    startDate={filterStartDate}
                    endDate={filterEndDate}
                    onStartDateChange={setFilterStartDate}
                    onEndDateChange={setFilterEndDate}
                    placeholder="選擇註冊時間範圍"
                  />
                )
              }
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'inviteCode', label: '邀請碼', visible: visibleColumns.inviteCode },
              { key: 'name', label: '暱稱', visible: visibleColumns.name },
              { key: 'email', label: '電子郵件', visible: visibleColumns.email },
              { key: 'phone', label: '電話', visible: visibleColumns.phone },
              { key: 'tokens', label: '代幣餘額(G)', visible: visibleColumns.tokens },
              { key: 'points', label: '積分餘額(P)', visible: visibleColumns.points },
              { key: 'totalDraws', label: '抽獎數', visible: visibleColumns.totalDraws },
              { key: 'totalSpent', label: '總消費(TWD)', visible: visibleColumns.totalSpent },
              { key: 'status', label: '狀態', visible: visibleColumns.status },
              { key: 'isBot', label: '機器人', visible: visibleColumns.isBot },
              { key: 'registerDate', label: '註冊時間', visible: visibleColumns.registerDate },
              { key: 'lastLoginDate', label: '最後登入', visible: visibleColumns.lastLoginDate },
              { key: 'lastLoginIp', label: '最後IP', visible: visibleColumns.lastLoginIp },
              { key: 'userId', label: '使用者ID', visible: visibleColumns.userId },
              { key: 'operations', label: '操作', visible: visibleColumns.operations }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
            selectedCount={selectedUsers.size}
            batchActions={[
              { 
                label: '批量啟用', 
                onClick: () => {
                  if (selectedUsers.size === 0) return
                  setConfirmModal({
                    isOpen: true,
                    title: '批量啟用',
                    message: `確定要啟用選中的 ${selectedUsers.size} 個用戶嗎？`,
                    variant: 'primary',
                    onConfirm: async () => {
                      const selectedIds = Array.from(selectedUsers)
                      const newStatuses = { ...userStatuses }
                      const newUsers = users.map(user => {
                        if (selectedUsers.has(user.id)) {
                          newStatuses[user.id] = 'active'
                          return { ...user, status: 'active' as const }
                        }
                        return user
                      })
                      setUserStatuses(newStatuses)
                      setUsers(newUsers)
                      setSelectedUsers(new Set())
                      setConfirmModal(prev => ({ ...prev, isOpen: false }))
                      
                      try {
                        const { error } = await supabase
                          .from('users')
                          .update({ status: 'active' })
                          .in('id', selectedIds)
                        if (error) console.error('Error batch updating:', error)
                      } catch (err) {
                        console.error('Error:', err)
                      }
                    }
                  })
                }, 
                variant: 'primary', 
                count: selectedUsers.size 
              },
              { 
                label: '批量停用', 
                onClick: () => {
                  if (selectedUsers.size === 0) return
                  setConfirmModal({
                    isOpen: true,
                    title: '批量停用',
                    message: `確定要停用選中的 ${selectedUsers.size} 個用戶嗎？`,
                    variant: 'danger',
                    onConfirm: async () => {
                      const selectedIds = Array.from(selectedUsers)
                      const newStatuses = { ...userStatuses }
                      const newUsers = users.map(user => {
                        if (selectedUsers.has(user.id)) {
                          newStatuses[user.id] = 'inactive'
                          return { ...user, status: 'inactive' as const }
                        }
                        return user
                      })
                      setUserStatuses(newStatuses)
                      setUsers(newUsers)
                      setSelectedUsers(new Set())
                      setConfirmModal(prev => ({ ...prev, isOpen: false }))
                      
                      try {
                        const { error } = await supabase
                          .from('users')
                          .update({ status: 'inactive' })
                          .in('id', selectedIds)
                        if (error) console.error('Error batch updating:', error)
                      } catch (err) {
                        console.error('Error:', err)
                      }
                    }
                  })
                }, 
                variant: 'danger', 
                count: selectedUsers.size 
              }
            ]}
            onClearSelection={() => setSelectedUsers(new Set())}
          />

          <FilterTags
            tags={filterTags}
            onClearAll={() => setSelectedStatus('all')}
          />

          <DataTable
            data={sortedUsers}
            columns={columns}
            keyField="id"
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectable={true}
            selectedIds={selectedUsers}
            onSelectChange={setSelectedUsers}
            density={tableDensity}
            enableInfiniteScroll={true}
            displayCount={displayCount}
            onLoadMore={handleLoadMore}
            isLoadingMore={isLoadingMore}
            totalCount={sortedUsers.length}
            visibleColumns={visibleColumns}
            emptyMessage="沒有找到符合條件的用戶"
          />
        </PageCard>
      </div>

      {/* 確認 Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
      >
        <p className="text-neutral-700 mb-6">{confirmModal.message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={confirmModal.onConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors ${
              confirmModal.variant === 'danger'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-primary hover:bg-primary-dark'
            }`}
          >
            確定
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          if (isCreatingUser) return
          setIsCreateModalOpen(false)
        }}
        title="新增會員"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">會員名稱</label>
            <input
              type="text"
              value={createUserForm.name}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="請輸入會員名稱"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">電子郵件</label>
            <input
              type="email"
              value={createUserForm.email}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="member@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">登入密碼</label>
            <input
              type="text"
              value={createUserForm.password}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="至少 6 碼"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">電話</label>
              <input
                type="text"
                value={createUserForm.phone}
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="09xxxxxxxx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">初始代幣</label>
              <input
                type="number"
                min="0"
                value={createUserForm.tokens}
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, tokens: e.target.value }))}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">地址</label>
            <input
              type="text"
              value={createUserForm.address}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, address: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="選填"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">狀態</label>
            <select
              value={createUserForm.status}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          {createUserError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {createUserError}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              disabled={isCreatingUser}
            >
              取消
            </button>
            <button
              onClick={handleCreateUser}
              disabled={isCreatingUser}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {isCreatingUser ? '新增中...' : '建立會員'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}
