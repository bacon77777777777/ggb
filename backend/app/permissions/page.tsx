'use client'

import { AdminLayout, Modal } from '@/components'
import { useState, useEffect } from 'react'
import { useLog } from '@/contexts/LogContext'

interface Role {
  id: number
  name: string
  display_name: string
  permissions: string[]
  created_at: string
}

// Define available permissions/pages
const AVAILABLE_PERMISSIONS = [
    // Standard Pages
    { id: 'dashboard', label: '儀表板' },
    { id: 'products', label: '商品管理' },
    { id: 'orders', label: '配送管理' },
    { id: 'users', label: '會員管理' },
    { id: 'draws', label: '抽獎管理' },
    { id: 'recharges', label: '儲值管理' },
    { id: 'banners', label: '輪播圖管理' },
    { id: 'news', label: '文章管理' },
    { id: 'settings', label: '殺率調整' },
    { id: 'admins', label: '管理列表' },
    { id: 'permissions', label: '權限管理' },
    { id: 'logs', label: '操作記錄' },
    
    // Legacy / Specific Actions Mappings
    { id: 'dashboard_view', label: '儀表板' },
    { id: 'products_manage', label: '商品管理' },
    { id: 'orders_manage', label: '配送管理' },
    { id: 'users_manage', label: '會員管理' },
    { id: 'draws_view', label: '抽獎管理' },
    { id: 'recharges_view', label: '儲值管理' },
  ]

export default function PermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const { addLog } = useLog()
  
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    permissions: [] as string[]
  })

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/roles')
      if (!res.ok) {
        throw new Error('Failed to load roles')
      }
      const data: Role[] = await res.json()
      setRoles(data || [])
    } catch (error) {
      console.error('Error fetching roles:', error)
      alert('載入角色失敗')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleEdit = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      display_name: role.display_name,
      permissions: role.permissions || []
    })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingRole(null)
    setFormData({
      name: '',
      display_name: '',
      permissions: []
    })
    setIsModalOpen(true)
  }

  const handlePermissionToggle = (permId: string) => {
    setFormData(prev => {
      const newPerms = prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
      return { ...prev, permissions: newPerms }
    })
  }

  const handleSubmit = async () => {
    try {
      if (!formData.name || !formData.display_name) {
        alert('請填寫完整資料')
        return
      }

      if (editingRole) {
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingRole.id,
            name: formData.name,
            display_name: formData.display_name,
            permissions: formData.permissions,
          }),
        })
        if (!res.ok) {
          throw new Error('Failed to update role')
        }
        await addLog(
          '更新角色權限',
          '權限管理',
          `角色「${formData.display_name || formData.name}」權限已更新`,
          'success'
        )
      } else {
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            display_name: formData.display_name,
            permissions: formData.permissions,
          }),
        })
        if (!res.ok) {
          throw new Error('Failed to create role')
        }
        await addLog(
          '新增角色',
          '權限管理',
          `新增角色「${formData.display_name || formData.name}」`,
          'success'
        )
      }

      setIsModalOpen(false)
      fetchData()
      alert(editingRole ? '更新成功' : '新增成功')
    } catch (error) {
      console.error('Error saving role:', error)
      await addLog(
        editingRole ? '更新角色權限失敗' : '新增角色失敗',
        '權限管理',
        String(error),
        'failed'
      )
      alert('儲存失敗')
    }
  }

  return (
    <AdminLayout pageTitle="權限管理" breadcrumbs={[{ label: '權限管理', href: '/permissions' }]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">角色與權限設定</h2>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            + 新增角色
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">載入中...</div>
        ) : roles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">尚無角色資料</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roles.map(role => {
              const isSuperAdmin = role.name === 'super_admin'
              return (
                <div 
                  key={role.id} 
                  className={`bg-white rounded-xl border p-6 shadow-sm hover:shadow-md transition-shadow ${
                    isSuperAdmin ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{role.display_name}</h3>
                      <p className="text-sm text-gray-500 font-mono mt-1">{role.name}</p>
                    </div>
                    {!isSuperAdmin && (
                      <button
                        onClick={() => handleEdit(role)}
                        className="text-gray-400 hover:text-primary transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">可訪問頁面</div>
                    <div className="flex flex-wrap gap-2">
                      {isSuperAdmin ? (
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium border border-blue-200">
                          全部頁面
                        </span>
                      ) : (
                        <>
                          {role.permissions?.map(p => {
                            const label = AVAILABLE_PERMISSIONS.find(ap => ap.id === p)?.label || p
                            return (
                              <span key={p} className="px-2.5 py-1 bg-gray-50 text-gray-700 rounded-md text-xs font-medium border border-gray-200">
                                {label}
                              </span>
                            )
                          })}
                          {(!role.permissions || role.permissions.length === 0) && (
                            <span className="text-sm text-gray-400 italic">無權限設定</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingRole ? '編輯角色' : '新增角色'}
          size="lg"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色名稱 (顯示用)</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="例如：營運人員"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色代碼 (系統用)</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="例如：operation_staff"
                  disabled={!!editingRole} // 禁止修改代碼以免破壞系統邏輯
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">權限設定 (可訪問頁面)</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {AVAILABLE_PERMISSIONS.map(perm => (
                  <label key={perm.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(perm.id)}
                      onChange={() => handlePermissionToggle(perm.id)}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
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
