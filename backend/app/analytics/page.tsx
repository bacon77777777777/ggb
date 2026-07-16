'use client'

import { AdminLayout, StatsCard, SearchToolbar, PageCard, Modal, DataTable, type Column } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { useState, useEffect, useMemo } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'

interface Role {
  id: number
  name: string
  display_name: string
  permissions: string[]
}

interface Admin {
  id: number
  username: string
  nickname: string
  role_id: number
  status: 'active' | 'inactive'
  last_login_at: string | null
  created_at: string
  role?: Role
}

export default function AdminsPage() {
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  
  const [admins, setAdmins] = useState<Admin[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('analytics', 'compact', {
    id: true, username: true, nickname: true, role: true, status: true, created_at: true, last_login_at: true, actions: true
  })
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    role_id: 0,
    status: 'active' as 'active' | 'inactive',
    password: ''
  })

  // 載入資料
  const fetchData = async () => {
    try {
      setIsLoading(true)
      
      const [rolesRes, adminsRes] = await Promise.all([fetch('/api/admin/roles'), fetch('/api/admin/admins')])

      if (!rolesRes.ok) {
        throw new Error(await rolesRes.text())
      }
      if (!adminsRes.ok) {
        throw new Error(await adminsRes.text())
      }

      const rolesData: Role[] = await rolesRes.json()
      const adminsData: Admin[] = await adminsRes.json()

      setRoles(Array.isArray(rolesData) ? rolesData : [])
      setAdmins(Array.isArray(adminsData) ? adminsData : [])

    } catch (error) {
      console.error('Error fetching data:', error)
      alert('載入資料失敗')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // 篩選處理
  const filteredAdmins = useMemo(() => {
    let result = admins

    // 角色篩選
    if (selectedRole !== 'all') {
      result = result.filter(a => a.role?.name === selectedRole)
    }

    // 狀態篩選
    if (selectedStatus !== 'all') {
      result = result.filter(a => a.status === selectedStatus)
    }

    // 搜尋篩選
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(a =>
        a.username.toLowerCase().includes(query) ||
        (a.nickname && a.nickname.toLowerCase().includes(query))
      )
    }

    return result
  }, [admins, selectedRole, selectedStatus, searchQuery])

  // 排序處理
  const sortedAdmins = useMemo(() => {
    return [...filteredAdmins].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'username':
          aValue = a.username
          bValue = b.username
          break
        case 'nickname':
          aValue = a.nickname || ''
          bValue = b.nickname || ''
          break
        case 'role':
          aValue = a.role?.display_name || ''
          bValue = b.role?.display_name || ''
          break
        case 'status':
          aValue = a.status
          bValue = b.status
          break
        case 'last_login_at':
          aValue = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
          bValue = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
          break
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        case 'id':
          aValue = a.id
          bValue = b.id
          break
        default:
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
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
  }, [filteredAdmins, sortField, sortDirection])

  // 統計數據
  const stats = useMemo(() => {
    const totalAdmins = filteredAdmins.length
    const activeAdmins = filteredAdmins.filter(a => a.status === 'active').length
    return {
      totalAdmins,
      activeAdmins,
    }
  }, [filteredAdmins])

  // 處理表單提交
  const handleSubmit = async () => {
    try {
      if (!formData.username || !formData.role_id) {
        alert('請填寫完整資料')
        return
      }

      const payload = {
        id: editingAdmin ? editingAdmin.id : undefined,
        username: formData.username,
        nickname: formData.nickname,
        role_id: formData.role_id,
        status: formData.status,
        password: formData.password || undefined,
      } as const

      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        let errMsg = '儲存失敗'
        try {
          const json = await res.json()
          errMsg = json.error || errMsg
        } catch {
          errMsg = await res.text() || errMsg
        }
        throw new Error(errMsg)
      }

      alert(editingAdmin ? '更新成功' : '新增成功')

      setIsAddModalOpen(false)
      setIsEditModalOpen(false)
      fetchData()
    } catch (error: any) {
      console.error('Error saving admin:', error)
      alert('儲存失敗：' + (error?.message || '未知錯誤'))
    }
  }

  // 開啟編輯
  const handleEdit = (admin: Admin) => {
    setEditingAdmin(admin)
    setFormData({
      username: admin.username,
      nickname: admin.nickname || '',
      role_id: admin.role_id,
      status: admin.status,
      password: '' // 不回填密碼
    })
    setIsEditModalOpen(true)
  }

  // 開啟新增
  const handleAdd = () => {
    setEditingAdmin(null)
    setFormData({
      username: '',
      nickname: '',
      role_id: roles[0]?.id || 0,
      status: 'active',
      password: ''
    })
    setIsAddModalOpen(true)
  }

  const handleLoadMore = () => {
    setIsLoadingMore(true)
    setTimeout(() => {
      setDisplayCount(prev => prev + 20)
      setIsLoadingMore(false)
    }, 500)
  }

  const columns: Column<Admin>[] = [
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      render: (admin) => <span className="text-neutral-500 font-mono">MNG{admin.id.toString().padStart(3, '0')}</span>
    },
    {
      key: 'username',
      label: '帳號',
      sortable: true,
      className: 'font-medium text-gray-900'
    },
    {
      key: 'nickname',
      label: '暱稱',
      sortable: true,
      className: 'text-gray-700'
    },
    {
      key: 'role',
      label: '角色',
      sortable: true,
      render: (admin) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
          ${admin.role?.name === 'super_admin' ? 'bg-purple-50 text-purple-700 border-purple-100' :
            admin.role?.name === 'admin' ? 'bg-blue-50 text-blue-700 border-blue-100' :
            'bg-gray-50 text-gray-700 border-gray-100'
          }`}>
          {admin.role?.display_name || '未知角色'}
        </span>
      )
    },
    {
      key: 'status',
      label: '狀態',
      sortable: true,
      render: (admin) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
          ${admin.status === 'active' 
            ? 'bg-green-50 text-green-700 border-green-100' 
            : 'bg-red-50 text-red-700 border-red-100'
          }`}>
          {admin.status === 'active' ? '啟用' : '停用'}
        </span>
      )
    },
    {
      key: 'created_at',
      label: '建立時間',
      sortable: true,
      render: (admin) => <span className="text-neutral-500 font-mono whitespace-nowrap">{formatDateTime(admin.created_at)}</span>
    },
    {
      key: 'last_login_at',
      label: '最後登入',
      sortable: true,
      render: (admin) => <span className="text-neutral-500 font-mono whitespace-nowrap">{formatDateTime(admin.last_login_at)}</span>
    },
    {
      key: 'actions',
      label: '操作',
      render: (admin) => (
        <button
          onClick={() => handleEdit(admin)}
          className="text-blue-500 hover:text-blue-700 font-medium text-sm"
        >
          編輯
        </button>
      )
    }
  ]

  return (
    <AdminLayout pageTitle="管理員清單">
      <div className="space-y-6">
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="總管理員數"
            value={stats.totalAdmins}
            onClick={() => setSelectedStatus('all')}
          />
          <StatsCard
            title="啟用中"
            value={stats.activeAdmins}
            onClick={() => setSelectedStatus('active')}
            isActive={selectedStatus === 'active'}
            activeColor="primary"
          />
        </div>

        {/* 表格區域 */}
        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋帳號、暱稱..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showFilter={true}
            filterOptions={[
              {
                key: 'role',
                label: '角色',
                type: 'select',
                options: [
                  { value: 'all', label: '全部角色' },
                  ...roles.map(r => ({ value: r.name, label: r.display_name }))
                ],
                value: selectedRole,
                onChange: (value) => setSelectedRole(value)
              },
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                options: [
                  { value: 'all', label: '全部狀態' },
                  { value: 'active', label: '啟用' },
                  { value: 'inactive', label: '停用' }
                ],
                value: selectedStatus,
                onChange: (value) => setSelectedStatus(value)
              }
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'id', label: 'ID', visible: visibleColumns.id },
              { key: 'username', label: '帳號', visible: visibleColumns.username },
              { key: 'nickname', label: '暱稱', visible: visibleColumns.nickname },
              { key: 'role', label: '角色', visible: visibleColumns.role },
              { key: 'status', label: '狀態', visible: visibleColumns.status },
              { key: 'created_at', label: '建立時間', visible: visibleColumns.created_at },
              { key: 'last_login_at', label: '最後登入', visible: visibleColumns.last_login_at },
              { key: 'actions', label: '操作', visible: visibleColumns.actions }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
            showAddButton={true}
            addButtonText="+ 新增管理員"
            onAddClick={handleAdd}
          />

          <div className="mt-4">
            <DataTable
              data={sortedAdmins}
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
              totalCount={sortedAdmins.length}
              visibleColumns={visibleColumns}
              emptyMessage="無相關資料"
            />
          </div>
        </PageCard>

        {/* Modal */}
        <Modal
          isOpen={isAddModalOpen || isEditModalOpen}
          onClose={() => {
            setIsAddModalOpen(false)
            setIsEditModalOpen(false)
            setEditingAdmin(null)
            setFormData({
              username: '',
              nickname: '',
              role_id: 0,
              status: 'active',
              password: ''
            })
          }}
          title={isEditModalOpen ? '編輯管理者' : '新增管理者'}
        >
           <div className="space-y-4">
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">
                 帳號 <span className="text-xs text-neutral-500">(僅限英文數字)</span>
               </label>
               <input
                 type="text"
                 value={formData.username}
                 onChange={e => {
                   const value = e.target.value
                   if (/^[a-zA-Z0-9]*$/.test(value)) {
                     setFormData({ ...formData, username: value })
                   }
                 }}
                 className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                 placeholder="請輸入帳號"
               />
             </div>
             <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                暱稱
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="請輸入暱稱"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密碼
              </label>
               <input
                 type="password"
                 value={formData.password}
                 onChange={e => setFormData({ ...formData, password: e.target.value })}
                 className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                 placeholder={isEditModalOpen ? "不修改請留空" : "請設定密碼"}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">
                 角色
               </label>
               <select
                 value={formData.role_id}
                 onChange={e => setFormData({ ...formData, role_id: Number(e.target.value) })}
                 className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
               >
                 <option value={0} disabled>請選擇角色</option>
                 {roles.map(role => (
                   <option key={role.id} value={role.id}>
                     {role.display_name} ({role.name})
                   </option>
                 ))}
               </select>
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">
                 狀態
               </label>
               <select
                 value={formData.status}
                 onChange={e => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                 className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
               >
                 <option value="active">啟用</option>
                 <option value="inactive">停用</option>
               </select>
             </div>
 
             <div className="flex justify-end gap-3 pt-4 border-t mt-6">
               <button
                 onClick={() => {
                   setIsAddModalOpen(false)
                   setIsEditModalOpen(false)
                   setEditingAdmin(null)
                 }}
                 className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
               >
                 取消
               </button>
               <button
                 onClick={handleSubmit}
                 className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
               >
                 儲存
               </button>
             </div>
           </div>
        </Modal>
      </div>
    </AdminLayout>
  )
}
