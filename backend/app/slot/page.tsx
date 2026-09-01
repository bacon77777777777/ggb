'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminLayout, Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import Switch from '@/components/ui/Switch'
import { useToast } from '@/contexts/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

interface SlotTheme {
  id: number
  name: string
  machine_count: number
  bet_tiers: { coins: number }[]
  trigger_rate: number
  continue_rate: number
  floor_spin_count: number
  is_active: boolean
  sort_order: number
  image_url: string | null
  event_slug: string | null
  updated_at: string
  suppliers: { name: string } | null
  slot_machines: { id: number; machine_number: number; is_active: boolean }[]
}

const DEFAULT_FORM = {
  name: '',
  machine_count: '3',
  bet_tiers_input: '100,500,1000',
  supplier_id: '2',
}

const INPUT = 'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm'

export default function SlotThemesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()
  const [themes, setThemes] = useState<SlotTheme[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchThemes = async () => {
    setIsLoading(true)
    const res = await fetch('/api/admin/slot/themes')
    const data = await res.json()
    setThemes(data.themes ?? [])
    setIsLoading(false)
  }

  useEffect(() => { fetchThemes() }, [])

  const parseTiers = (input: string) =>
    input.split(',').map(s => s.trim()).filter(Boolean).map(Number)
      .filter(n => n > 0).map(c => ({ coins: c }))

  const handleCreate = async () => {
    const tiers = parseTiers(form.bet_tiers_input)
    if (!form.name.trim()) { toast('請填入主題名稱', 'error'); return }
    if (tiers.length === 0) { toast('請設定至少一個投注檔次', 'error'); return }
    if (tiers.length > 5)   { toast('投注檔次最多 5 個', 'error'); return }

    const count = parseInt(form.machine_count)
    if (!count || count < 1 || count > 20) { toast('機台數量需在 1~20 之間', 'error'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/slot/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          machine_count: count,
          bet_tiers: tiers,
          supplier_id: parseInt(form.supplier_id) || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast(`主題「${form.name}」建立成功，已生成 ${count} 台機器`)
      setShowCreate(false)
      setForm(DEFAULT_FORM)
      router.push(`/slot/${data.theme.id}`)
    } catch (e: any) {
      toast(e.message ?? '建立失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (theme: SlotTheme) => {
    const res = await fetch(`/api/admin/slot/themes/${theme.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !theme.is_active }),
    })
    if (res.ok) {
      setThemes(prev => prev.map(t => t.id === theme.id ? { ...t, is_active: !t.is_active } : t))
      toast(theme.is_active ? '已下架' : '已上架')
    }
  }

  const handleDelete = async (theme: SlotTheme) => {
    confirm({
      title: '確認操作',
      message: `確定刪除主題「${theme.name}」？旗下機台將被解除關聯（session 歷史保留）。`,
      onConfirm: async () => {
      const res = await fetch(`/api/admin/slot/themes/${theme.id}`, { method: 'DELETE' })
      if (res.ok) { toast('已刪除'); fetchThemes() }
      },
    })
  }

  const filtered = themes.filter(t => {
    if (statusFilter !== 'all' && (statusFilter === 'active') !== t.is_active) return false
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const currentTiers = parseTiers(form.bet_tiers_input)

  const columns: ListColumn<SlotTheme>[] = [
    {
      key: 'theme', label: '主題',
      sortValue: t => t.name,
      render: theme => (
        <div className="flex items-center gap-3">
          {theme.image_url ? (
            <img src={theme.image_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-neutral-100 flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-neutral-100 flex-shrink-0 flex items-center justify-center text-lg">🎰</div>
          )}
          <div>
            <div className="font-semibold text-neutral-900">{theme.name}</div>
            <div className="text-xs text-neutral-400">{theme.suppliers?.name ?? '—'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'machines', label: '機台',
      sortValue: t => t.slot_machines?.filter(m => m.is_active).length ?? 0,
      render: theme => {
        const activeMachines = theme.slot_machines?.filter(m => m.is_active).length ?? 0
        const totalMachines  = theme.slot_machines?.length ?? 0
        return (
          <>
            <span className="text-neutral-700 font-bold">{activeMachines}</span>
            <span className="text-neutral-400">/{totalMachines} 台上架</span>
          </>
        )
      },
    },
    {
      key: 'betTiers', label: '投注檔次',
      render: theme => (
        <div className="flex flex-wrap gap-1">
          {(theme.bet_tiers ?? []).map((t, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 font-bold rounded">
              {t.coins.toLocaleString()} G
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'rates', label: '機率設定',
      className: 'text-xs text-neutral-500',
      render: theme => (
        <>
          <div>觸發 {(theme.trigger_rate * 100).toFixed(2)}%</div>
          <div>延續 {(theme.continue_rate * 100).toFixed(0)}%</div>
          <div>保底 {theme.floor_spin_count} 轉</div>
        </>
      ),
    },
    {
      key: 'status', label: '上架',
      sortValue: t => (t.is_active ? 1 : 0),
      render: theme => (
        <Switch checked={theme.is_active} onCheckedChange={() => toggleActive(theme)} />
      ),
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: theme => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => router.push(`/slot/${theme.id}`)}>設定</RowAction>
          <RowAction tone="danger" onClick={() => handleDelete(theme)}>刪除</RowAction>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="主題管理">
      <div className="space-y-4">
        <ListTableCard
          pageKey="slot_themes"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage={searchQuery ? '找不到符合的主題' : '尚無主題，點擊「新增主題」建立'}
          searchPlaceholder="搜尋主題名稱..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增主題"
          onAddClick={() => setShowCreate(true)}
          filters={[
            {
              key: 'status', label: '上架狀態',
              value: statusFilter, onChange: setStatusFilter,
              options: [
                { value: 'all', label: '全部狀態' },
                { value: 'active', label: '上架中' },
                { value: 'inactive', label: '已下架' },
              ],
            },
          ]}
        />
      </div>

      {/* 新增主題 Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增挑戰主題">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">主題名稱 *</label>
            <input
              type="text"
              className={INPUT}
              placeholder="例：絕頂RUSH"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">機台數量</label>
              <input
                type="number"
                className={INPUT}
                min={1} max={20}
                value={form.machine_count}
                onChange={e => setForm(p => ({ ...p, machine_count: e.target.value }))}
              />
              <p className="mt-1 text-xs text-neutral-400">系統自動生成 #1~#N 機台</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">廠商 ID</label>
              <input
                type="number"
                className={INPUT}
                value={form.supplier_id}
                onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value }))}
              />
              <p className="mt-1 text-xs text-neutral-400">預設 2 = 吉吉比</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">投注檔次（逗號分隔，最多 5 個）*</label>
            <div className="relative">
              <input
                type="text"
                className={INPUT + (currentTiers.length > 5 ? ' border-red-400' : '') + ' pr-12'}
                placeholder="例：100,500,1000"
                value={form.bet_tiers_input}
                onChange={e => setForm(p => ({ ...p, bet_tiers_input: e.target.value }))}
              />
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${currentTiers.length > 5 ? 'text-red-500' : 'text-neutral-400'}`}>
                {currentTiers.length}/5
              </span>
            </div>
            {currentTiers.length > 0 && currentTiers.length <= 5 && (
              <div className="flex gap-1 mt-2">
                {currentTiers.map((t, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{t.coins} G</span>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-neutral-400 bg-neutral-50 rounded-lg px-3 py-2">
            建立後進入主題設定頁配置機率、普通旋轉返還、RUSH獎池、特效影片。
          </p>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !form.name.trim() || currentTiers.length === 0}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {saving ? '建立中...' : '建立主題'}
            </button>
          </div>
        </div>
      </Modal>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
