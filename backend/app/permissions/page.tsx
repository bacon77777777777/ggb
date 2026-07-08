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

const PERMISSION_GROUPS = [
  {
    title: '頂部導航',
    items: [
      { id: 'header_members',         label: '會員數顯示' },
      { id: 'header_settlements',     label: '廠商月結' },
      { id: 'header_refunds',         label: '待審退款' },
      { id: 'header_recharge_review', label: '待複核儲值' },
      { id: 'header_products',        label: '鈴鐺告警' },
      { id: 'header_orders',          label: '配送待辦' },
    ],
  },
  {
    title: '營運總覽',
    items: [
      { id: 'dashboard',        label: '儀表板' },
      { id: 'reports_overview', label: '轉換分析' },
      { id: 'reports_behavior', label: '點擊分析' },
    ],
  },
  {
    title: '對帳報表',
    items: [
      { id: 'recharges',           label: '儲值明細' },
      { id: 'reports_logistics',   label: '物流明細' },
      { id: 'reports_products',    label: '消費明細' },
      { id: 'reports_dismantled',   label: '分解明細' },
      { id: 'coupons_report',       label: '折價券明細' },
      { id: 'reports_settlement',   label: '廠商結算' },
      { id: 'settlement_snapshots', label: '廠商月結管理' },
    ],
  },
  {
    title: '抽獎管理',
    items: [
      { id: 'products',          label: '商品管理' },
      { id: 'draws',             label: '抽獎紀錄' },
      { id: 'orders',            label: '配送管理' },
      { id: 'coupons',           label: '折價券管理' },
      { id: 'settings_shipping', label: '運費設定' },
    ],
  },
  {
    title: '會員管理',
    items: [
      { id: 'users',           label: '會員管理' },
      { id: 'recharge_review', label: '待複核儲值' },
    ],
  },
  {
    title: '系統設定',
    items: [
      { id: 'suppliers',         label: '廠商管理' },
      { id: 'banners',           label: '輪播圖管理' },
      { id: 'news',              label: '文章管理' },
      { id: 'categories',        label: '分類清單' },
      { id: 'settings_modules',  label: '抽獎模組設定' },
      { id: 'settings_features', label: '功能開關' },
      { id: 'admins',            label: '管理員清單' },
      { id: 'permissions',       label: '權限管理' },
      { id: 'logs',              label: '操作記錄' },
      { id: 'dev_logs',          label: '開發紀錄' },
    ],
  },
  {
    title: '交易所',
    items: [
      { id: 'marketplace', label: '交易所商品管理' },
    ],
  },
  {
    title: '商品買賣',
    items: [
      { id: 'sell',        label: '販售商品管理' },
      { id: 'sell_orders', label: '販售訂單' },
    ],
  },
  {
    title: '卡牌交換',
    items: [
      { id: 'exchange',        label: '交換商品管理' },
      { id: 'exchange_orders', label: '交換紀錄' },
    ],
  },
  {
    title: '其他黑科技',
    items: [
      { id: 'agent_events',    label: '事件中心' },
      { id: 'competitor_intel',label: '競品情報' },
      { id: 'content_drafts',  label: 'AI 文案草稿' },
      { id: 'tools',           label: '工具' },
      { id: 'settings',        label: '殺率調整' },
    ],
  },
]

const AVAILABLE_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.items)

const ROLE_PRESETS: { label: string; permissions: string[] }[] = [
  {
    label: '客服人員',
    permissions: ['dashboard', 'draws', 'orders', 'users', 'logs'],
  },
  {
    label: '財務人員',
    permissions: ['dashboard', 'recharges', 'reports_logistics', 'reports_products', 'reports_dismantled', 'reports_settlement', 'logs'],
  },
  {
    label: '商品管理員',
    permissions: ['dashboard', 'products', 'suppliers', 'categories', 'draws', 'orders', 'settings', 'settings_modules'],
  },
  {
    label: '行銷人員',
    permissions: ['dashboard', 'reports_overview', 'banners', 'news', 'coupons'],
  },
  {
    label: '一般管理員',
    permissions: ['dashboard', 'reports_overview', 'recharges', 'reports_logistics', 'reports_products', 'products', 'suppliers', 'categories', 'draws', 'orders', 'users', 'banners', 'news', 'coupons', 'logs'],
  },
]

const LEGACY_PERMISSION_LABELS: Record<string, string> = {
  dashboard_view:    '儀表板',
  products_manage:   '商品管理',
  orders_manage:     '配送管理',
  users_manage:      '會員管理',
  draws_view:        '抽獎紀錄',
  recharges_view:    '儲值明細',
}

function permLabel(id: string): string {
  return AVAILABLE_PERMISSIONS.find(p => p.id === id)?.label
    ?? LEGACY_PERMISSION_LABELS[id]
    ?? id
}

const LEGACY_TO_NEW: Record<string, string> = {
  dashboard_view:  'dashboard',
  products_manage: 'products',
  orders_manage:   'orders',
  users_manage:    'users',
  draws_view:      'draws',
  recharges_view:  'recharges',
}

function normalizePermissions(perms: string[]): string[] {
  return [...new Set(perms.map(p => LEGACY_TO_NEW[p] ?? p))]
}

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
      permissions: normalizePermissions(role.permissions || [])
    })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingRole(null)
    setFormData({ name: '', display_name: '', permissions: [] })
    setIsModalOpen(true)
  }

  function autoGenerateName(displayName: string): string {
    const slug = displayName
      .toLowerCase()
      .replace(/[a-z0-9]+/g, m => m)
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
    return (slug || 'role') + '_' + Date.now().toString().slice(-6)
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
            name: editingRole.name,
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
          `角色「${formData.display_name}」權限已更新`,
          'success'
        )
      } else {
        const autoName = autoGenerateName(formData.display_name)
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: autoName,
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
    <AdminLayout pageTitle="權限管理">
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
                          {role.permissions?.map(p => (
                            <span key={p} className="px-2.5 py-1 bg-gray-50 text-gray-700 rounded-md text-xs font-medium border border-gray-200">
                              {permLabel(p)}
                            </span>
                          ))}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">角色名稱</label>
              <input
                type="text"
                value={formData.display_name}
                onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="例如：營運人員"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">權限設定 (可訪問頁面)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">套用預設：</span>
                  {ROLE_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, permissions: preset.permissions }))}
                      className="px-2 py-1 text-xs border border-neutral-200 rounded hover:bg-neutral-50 hover:border-primary/40 transition-colors text-neutral-600"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.title}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.title}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {group.items.map(perm => (
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
