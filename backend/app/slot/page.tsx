'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal } from '@/components'
import Switch from '@/components/ui/Switch'
import { useToast } from '@/contexts/ToastContext'

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
  const [themes, setThemes] = useState<SlotTheme[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
    if (!confirm(`確定刪除主題「${theme.name}」？旗下機台將被解除關聯（session 歷史保留）。`)) return
    const res = await fetch(`/api/admin/slot/themes/${theme.id}`, { method: 'DELETE' })
    if (res.ok) { toast('已刪除'); fetchThemes() }
  }

  const filtered = themes.filter(t =>
    !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const currentTiers = parseTiers(form.bet_tiers_input)

  return (
    <AdminLayout pageTitle="挑戰機台主題">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="relative">
            <input
              type="text"
              placeholder="搜尋主題名稱..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary w-64"
            />
            <svg className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
          >
            + 新增主題
          </button>
        </div>

        <PageCard noPadding>
          {isLoading ? (
            <div className="py-16 text-center text-sm text-neutral-400">載入中...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-neutral-400">
              {searchQuery ? '找不到符合的主題' : '尚無主題，點擊右上角新增'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    {['主題', '機台', '投注檔次', '機率設定', '上架', '操作'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filtered.map(theme => {
                    const activeMachines = theme.slot_machines?.filter(m => m.is_active).length ?? 0
                    const totalMachines  = theme.slot_machines?.length ?? 0
                    return (
                      <tr key={theme.id} className="hover:bg-neutral-50 transition-colors">
                        {/* 主題 */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {theme.image_url ? (
                              <img src={theme.image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-neutral-100 flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex-shrink-0 flex items-center justify-center text-lg">🎰</div>
                            )}
                            <div>
                              <div className="font-semibold text-neutral-900">{theme.name}</div>
                              <div className="text-xs text-neutral-400">{theme.suppliers?.name ?? '—'}</div>
                            </div>
                          </div>
                        </td>
                        {/* 機台數 */}
                        <td className="px-4 py-3">
                          <span className="text-neutral-700 font-bold">{activeMachines}</span>
                          <span className="text-neutral-400">/{totalMachines} 台上架</span>
                        </td>
                        {/* 投注檔次 */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(theme.bet_tiers ?? []).map((t, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 font-bold rounded">
                                {t.coins.toLocaleString()} G
                              </span>
                            ))}
                          </div>
                        </td>
                        {/* 機率 */}
                        <td className="px-4 py-3 text-xs text-neutral-500">
                          <div>觸發 {(theme.trigger_rate * 100).toFixed(2)}%</div>
                          <div>延續 {(theme.continue_rate * 100).toFixed(0)}%</div>
                          <div>保底 {theme.floor_spin_count} 轉</div>
                        </td>
                        {/* 上架 */}
                        <td className="px-4 py-3">
                          <Switch checked={theme.is_active} onCheckedChange={() => toggleActive(theme)} />
                        </td>
                        {/* 操作 */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => router.push(`/slot/${theme.id}`)}
                              className="text-primary text-sm font-medium"
                            >
                              設定
                            </button>
                            <button
                              onClick={() => handleDelete(theme)}
                              className="text-red-500 hover:text-red-700 text-sm font-medium"
                            >
                              刪除
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>
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
    </AdminLayout>
  )
}
