'use client'

import { AdminLayout, Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import { useState, useEffect } from 'react'
import { useLog } from '@/contexts/LogContext'
import { useToast } from '@/contexts/ToastContext'

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
      // 五頁收成三頁；reports_overview / reports_behavior 兩個 key 已停用，
      // 由 migration 536 回填成 analytics_overview 再從角色身上移除
      { id: 'dashboard',          label: '營運儀表板' },
      { id: 'analytics_overview', label: '數據分析' },
      { id: 'analytics_supplier', label: '廠商儀表板' },
      { id: 'reports_feed',       label: '推薦 feed 報表' },
    ],
  },
  {
    title: '對帳報表',
    items: [
      { id: 'recharges',           label: '儲值明細' },
      { id: 'reports_logistics',   label: '物流明細' },
      { id: 'reports_products',    label: '消費明細' },
      { id: 'reports_dismantled',   label: '分解明細' },
      { id: 'reports_adjustments',  label: '手動調整明細' },
      { id: 'coupons_report',       label: '折價券明細' },
      { id: 'reports_settlement',   label: '廠商結算' },
      { id: 'settlement_snapshots', label: '廠商月結管理' },
      { id: 'reports_accounting_guide', label: '會計對接說明' },
    ],
  },
  {
    title: '抽獎管理',
    items: [
      { id: 'products',          label: '商品管理' },
      { id: 'slot',              label: '挑戰機台' },
      { id: 'slot_reports',      label: '機台報表' },
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
      { id: 'referrals',       label: '邀請報表' },
      { id: 'recharge_review', label: '待複核儲值' },
    ],
  },
  {
    title: '系統設定',
    items: [
      { id: 'suppliers',         label: '廠商管理' },
      { id: 'banners',           label: '輪播圖管理' },
      { id: 'news',              label: '文章管理' },
      { id: 'announcements',     label: '公告管理' },
      { id: 'events',            label: '活動頁管理' },
      { id: 'cs_tickets',        label: '客服工單' },
      { id: 'cs_sop',            label: '客服操作手冊' },
      { id: 'categories',        label: '分類清單' },
      { id: 'settings_promotions', label: '促銷方案' },
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
      { id: 'sell',        label: '商城商品' },
      { id: 'sell_orders', label: '商城訂單' },
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
      { id: 'ai_usage',        label: 'AI 用量' },
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
    permissions: ['dashboard', 'recharges', 'reports_logistics', 'reports_products', 'reports_dismantled', 'reports_adjustments', 'reports_settlement', 'logs'],
  },
  {
    label: '商品管理員',
    permissions: ['dashboard', 'products', 'suppliers', 'categories', 'draws', 'orders', 'settings', 'settings_modules'],
  },
  {
    label: '行銷人員',
    permissions: ['dashboard', 'analytics_overview', 'banners', 'news', 'coupons'],
  },
  {
    label: '一般管理員',
    permissions: ['dashboard', 'analytics_overview', 'recharges', 'reports_logistics', 'reports_products', 'products', 'suppliers', 'categories', 'draws', 'orders', 'users', 'banners', 'news', 'coupons', 'logs'],
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
  const { toast } = useToast()
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
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
      toast('載入角色失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // 名稱搜尋（顯示名稱或系統代號）
  const filteredRoles = roles.filter(r => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return r.display_name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
  })

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
        toast('請填寫完整資料', 'warning')
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
      toast(editingRole ? '更新成功' : '新增成功', 'success')
    } catch (error) {
      console.error('Error saving role:', error)
      await addLog(
        editingRole ? '更新角色權限失敗' : '新增角色失敗',
        '權限管理',
        String(error),
        'failed'
      )
      toast('儲存失敗', 'error')
    }
  }

  // 條列式（老闆指定）：角色一列一行，權限標籤雲在儲存格內換行
  const roleColumns: ListColumn<Role>[] = [
    {
      key: 'role', label: '角色',
      sortValue: r => r.display_name,
      render: r => (
        <div>
          <div className="font-medium text-neutral-900">{r.display_name}</div>
          <div className="mt-0.5 text-xs text-neutral-400 font-mono">{r.name}</div>
        </div>
      ),
    },
    {
      key: 'permissions', label: '可訪問頁面',
      render: r => (
        <div className="flex max-w-4xl flex-wrap gap-1.5 whitespace-normal py-0.5">
          {r.name === 'super_admin' ? (
            <span className="px-2.5 py-1 bg-blue-100 text-primary rounded-lg text-xs font-medium border border-blue-200">
              全部頁面
            </span>
          ) : (r.permissions?.length ?? 0) === 0 ? (
            <span className="text-sm text-neutral-400 italic">無權限設定</span>
          ) : (
            r.permissions.map(p => (
              <span key={p} className="px-2 py-0.5 bg-neutral-50 text-neutral-700 rounded-lg text-xs font-medium border border-neutral-200">
                {permLabel(p)}
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: r => r.name === 'super_admin'
        ? <span className="text-sm text-neutral-300">—</span>
        : <RowAction tone="primary" onClick={() => handleEdit(r)}>編輯</RowAction>,
    },
  ]

  return (
    <AdminLayout pageTitle="權限管理">
      <div className="space-y-6">
        <ListTableCard
          pageKey="permissions"
          data={filteredRoles}
          columns={roleColumns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage={roles.length === 0 ? '尚無角色資料' : '沒有找到符合條件的角色'}
          searchPlaceholder="搜尋角色名稱..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增角色"
          onAddClick={handleAdd}
        />

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingRole ? '編輯角色' : '新增角色'}
          size="lg"
        >
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">角色名稱</label>
              <input
                type="text"
                value={formData.display_name}
                onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
                placeholder="例如：營運人員"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-neutral-700">權限設定 (可訪問頁面)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400">套用預設：</span>
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
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">{group.title}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {group.items.map(perm => (
                        <label key={perm.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-neutral-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.permissions.includes(perm.id)}
                            onChange={() => handlePermissionToggle(perm.id)}
                            className="rounded text-primary focus:ring-primary"
                          />
                          <span className="text-sm text-neutral-700">{perm.label}</span>
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
                className="px-4 py-2 border rounded-lg hover:bg-neutral-50"
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
