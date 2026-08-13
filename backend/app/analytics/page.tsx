'use client'

import { AdminLayout, StatsCard, Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import Switch from '@/components/ui/Switch'
import { formatDateTime } from '@/utils/dateFormat'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/contexts/ToastContext'
import SelectField from '@/components/ui/SelectField'

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
  /** 明文密碼（欄位名是歷史遺留，實際就是登入用的字串）。編輯彈窗直接顯示 */
  password_hash?: string
  role_id: number
  supplier_id: number | null
  status: 'active' | 'inactive'
  last_login_at: string | null
  created_at: string
  role?: Role
}

export default function AdminsPage() {
  const { toast } = useToast()

  const [admins, setAdmins] = useState<Admin[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    role_id: 0,
    supplier_id: 0,
    status: 'active' as 'active' | 'inactive',
    password: ''
  })

  // 廠商角色的帳號必須綁定廠商，否則登入後每一頁都是空的（而且看不出原因）。
  // 資料層有觸發器擋，這裡是讓表單先問清楚，不要等資料庫報錯
  const selectedRoleName = roles.find(r => r.id === formData.role_id)?.name
  const needsSupplier = selectedRoleName === 'supplier'

  // 載入資料
  const fetchData = async () => {
    try {
      setIsLoading(true)

      const [rolesRes, adminsRes, suppliersRes] = await Promise.all([
        fetch('/api/admin/roles'),
        fetch('/api/admin/admins'),
        fetch('/api/admin/suppliers'),
      ])

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

      // 廠商清單只有建廠商帳號時才用得到，抓不到也不該讓整頁載入失敗
      if (suppliersRes.ok) {
        const sup = await suppliersRes.json()
        setSuppliers(Array.isArray(sup) ? sup : [])
      }

    } catch (error) {
      console.error('Error fetching data:', error)
      toast('載入資料失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

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
        toast('請填寫完整資料', 'warning')
        return
      }
      if (needsSupplier && !formData.supplier_id) {
        toast('廠商角色必須選擇所屬廠商', 'warning')
        return
      }

      const payload = {
        id: editingAdmin ? editingAdmin.id : undefined,
        username: formData.username,
        nickname: formData.nickname,
        role_id: formData.role_id,
        supplier_id: needsSupplier ? formData.supplier_id || null : null,
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

      toast(editingAdmin ? '更新成功' : '新增成功', 'success')

      setIsAddModalOpen(false)
      setIsEditModalOpen(false)
      fetchData()
    } catch (error: any) {
      console.error('Error saving admin:', error)
      toast('儲存失敗：' + (error?.message || '未知錯誤', 'error'))
    }
  }

  // 開啟編輯
  const handleEdit = (admin: Admin) => {
    setEditingAdmin(admin)
    setFormData({
      username: admin.username,
      nickname: admin.nickname || '',
      role_id: admin.role_id,
      supplier_id: admin.supplier_id ?? 0,
      status: admin.status,
      // 直接回填當前密碼（老闆指定要看得到；admins 密碼本來就是明文存）
      password: admin.password_hash || ''
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
      supplier_id: 0,
      status: 'active',
      password: ''
    })
    setIsAddModalOpen(true)
  }

  /** 狀態 Switch 直接切換：樂觀更新，失敗滾回（沿用既有更新 API，不動其他欄位） */
  const toggleStatus = async (admin: Admin, next: boolean) => {
    const nextStatus: 'active' | 'inactive' = next ? 'active' : 'inactive'
    setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, status: nextStatus } : a))
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: admin.id,
          username: admin.username,
          nickname: admin.nickname,
          role_id: admin.role_id,
          supplier_id: admin.supplier_id,
          status: nextStatus,
        }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, status: admin.status } : a))
      toast('切換失敗，請重試一次', 'error')
    }
  }

  const columns: ListColumn<Admin>[] = [
    {
      key: 'id', label: 'ID',
      sortValue: a => a.id,
      className: 'font-mono',
      render: a => <span className="text-neutral-500">MNG{a.id.toString().padStart(3, '0')}</span>,
    },
    {
      key: 'username', label: '帳號',
      sortValue: a => a.username,
      render: a => <span className="font-medium text-neutral-900">{a.username}</span>,
    },
    {
      key: 'nickname', label: '暱稱',
      sortValue: a => a.nickname || '',
      render: a => <>{a.nickname}</>,
    },
    {
      key: 'role', label: '角色',
      sortValue: a => a.role?.display_name || '',
      render: a => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
          ${a.role?.name === 'super_admin' ? 'bg-purple-50 text-purple-700 border-purple-100' :
            a.role?.name === 'admin' ? 'bg-primary text-primary border-blue-100' :
            'bg-neutral-50 text-neutral-700 border-neutral-100'
          }`}>
          {a.role?.display_name || '未知角色'}
        </span>
      ),
    },
    {
      key: 'status', label: '狀態',
      sortValue: a => (a.status === 'active' ? 1 : 0),
      render: a => (
        <Switch checked={a.status === 'active'} onCheckedChange={next => void toggleStatus(a, next)} />
      ),
    },
    {
      key: 'created_at', label: '建立時間',
      sortValue: a => new Date(a.created_at).getTime(),
      className: 'font-mono',
      render: a => <span className="text-neutral-500">{formatDateTime(a.created_at)}</span>,
    },
    {
      key: 'last_login_at', label: '最後登入',
      sortValue: a => (a.last_login_at ? new Date(a.last_login_at).getTime() : 0),
      className: 'font-mono',
      render: a => <span className="text-neutral-500">{formatDateTime(a.last_login_at)}</span>,
    },
    {
      key: 'actions', label: '操作', isActions: true,
      render: a => (
        <RowAction tone="primary" onClick={() => handleEdit(a)}>編輯</RowAction>
      ),
    },
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
        <ListTableCard
          pageKey="admins"
          data={filteredAdmins}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="無相關資料"
          defaultSortField="created_at"
          defaultSortDirection="desc"
          searchPlaceholder="搜尋帳號、暱稱..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增管理員"
          onAddClick={handleAdd}
          filters={[
            {
              key: 'role', label: '角色',
              value: selectedRole, onChange: setSelectedRole,
              options: [
                { value: 'all', label: '全部角色' },
                ...roles.map(r => ({ value: r.name, label: r.display_name })),
              ],
            },
            {
              key: 'status', label: '狀態',
              value: selectedStatus, onChange: setSelectedStatus,
              options: [
                { value: 'all', label: '全部狀態' },
                { value: 'active', label: '啟用' },
                { value: 'inactive', label: '停用' },
              ],
            },
          ]}
        />

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
      supplier_id: 0,
              status: 'active',
              password: ''
            })
          }}
          title={isEditModalOpen ? '編輯管理者' : '新增管理者'}
        >
           <div className="space-y-4">
             <div>
               <label className="block text-sm font-medium text-neutral-700 mb-1">
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
                 className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                 placeholder="請輸入帳號"
               />
             </div>
             <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                暱稱
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="請輸入暱稱"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                密碼
              </label>
               {/* 明文顯示（老闆指定）：編輯時看得到當前密碼，不做眼睛開關。
                   type=text + autoComplete=off，免得瀏覽器把它當登入密碼欄搶著填 */}
               <input
                 type="text"
                 autoComplete="off"
                 value={formData.password}
                 onChange={e => setFormData({ ...formData, password: e.target.value })}
                 className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                 placeholder="請設定密碼"
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-neutral-700 mb-1">
                 角色
               </label>
               <SelectField
                 value={formData.role_id}
                 onChange={e => setFormData({ ...formData, role_id: Number(e.target.value) })}
                 className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
               >
                 <option value={0} disabled>請選擇角色</option>
                 {roles.map(role => (
                   <option key={role.id} value={role.id}>
                     {role.display_name} ({role.name})
                   </option>
                 ))}
               </SelectField>
             </div>
             {needsSupplier && (
               <div>
                 <label className="block text-sm font-medium text-neutral-700 mb-1">
                   所屬廠商 <span className="text-red-500">*</span>
                 </label>
                 <SelectField
                   value={formData.supplier_id}
                   onChange={e => setFormData({ ...formData, supplier_id: Number(e.target.value) })}
                   className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                 >
                   <option value={0} disabled>請選擇廠商</option>
                   {suppliers.map(sup => (
                     <option key={sup.id} value={sup.id}>{sup.name}</option>
                   ))}
                 </SelectField>
                 <p className="mt-1 text-xs text-neutral-400">
                   這個帳號只會看到這家廠商的商品，而且只能編輯 —— 不能刪除、不能看公平性驗證，也看不到會員。
                 </p>
               </div>
             )}
             <div>
               <label className="block text-sm font-medium text-neutral-700 mb-1">
                 狀態
               </label>
               <SelectField
                 value={formData.status}
                 onChange={e => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                 className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
               >
                 <option value="active">啟用</option>
                 <option value="inactive">停用</option>
               </SelectField>
             </div>

             <div className="flex justify-end gap-3 pt-4 border-t mt-6">
               <button
                 onClick={() => {
                   setIsAddModalOpen(false)
                   setIsEditModalOpen(false)
                   setEditingAdmin(null)
                 }}
                 className="px-4 py-2 text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
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
