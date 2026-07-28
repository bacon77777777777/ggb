'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal } from '@/components'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/contexts/ToastContext'

interface SlotMachine {
  id: number
  name: string
  description: string | null
  price_per_spin: number
  trigger_rate: number
  continue_rate: number
  min_rush_hits: number
  floor_spin_count: number
  is_active: boolean
  sort_order: number
  suppliers?: { name: string } | null
}

const DEFAULT_FORM = {
  name: '',
  description: '',
  image_url: '',
  price_per_spin: '100',
  trigger_rate: '0.15',
  continue_rate: '0.60',
  min_rush_hits: '3',
  floor_spin_count: '30',
}

export default function SlotPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [machines, setMachines] = useState<SlotMachine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)

  const fetchMachines = async () => {
    setIsLoading(true)
    const res = await fetch('/api/admin/slot/machines')
    const data = await res.json()
    setMachines(data.machines ?? [])
    setIsLoading(false)
  }

  useEffect(() => { fetchMachines() }, [])

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/slot/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('機台建立成功')
      setShowCreate(false)
      setForm(DEFAULT_FORM)
      fetchMachines()
    } catch (e: any) {
      toast(e.message ?? '建立失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (machine: SlotMachine) => {
    const res = await fetch(`/api/admin/slot/machines/${machine.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !machine.is_active }),
    })
    if (res.ok) { toast(machine.is_active ? '已下架' : '已上架'); fetchMachines() }
  }

  const handleDelete = async (machine: SlotMachine) => {
    if (!confirm(`確定刪除「${machine.name}」？此操作不可逆。`)) return
    const res = await fetch(`/api/admin/slot/machines/${machine.id}`, { method: 'DELETE' })
    if (res.ok) { toast('已刪除'); fetchMachines() }
  }

  return (
    <AdminLayout>
      <PageCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              ⚡ 挑戰機台管理
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">管理所有挑戰機台設定與獎池</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + 新增機台
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">載入中...</div>
        ) : machines.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            尚無機台，點擊右上角新增
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="pb-3 pr-4 font-medium">機台名稱</th>
                  <th className="pb-3 pr-4 font-medium">每次 G幣</th>
                  <th className="pb-3 pr-4 font-medium">RUSH 觸發率</th>
                  <th className="pb-3 pr-4 font-medium">保底轉數</th>
                  <th className="pb-3 pr-4 font-medium">狀態</th>
                  <th className="pb-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {machines.map(machine => (
                  <tr key={machine.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-gray-900 dark:text-white">{machine.name}</div>
                      {machine.suppliers && <div className="text-xs text-gray-400 mt-0.5">{machine.suppliers.name}</div>}
                    </td>
                    <td className="py-3 pr-4 text-amber-600 dark:text-amber-400 font-bold">{machine.price_per_spin}</td>
                    <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{(machine.trigger_rate * 100).toFixed(0)}%</td>
                    <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{machine.floor_spin_count}</td>
                    <td className="py-3 pr-4">
                      <Badge color={machine.is_active ? 'green' : 'gray'}>
                        {machine.is_active ? '上架中' : '下架'}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => router.push(`/slot/${machine.id}`)} className="text-primary text-sm font-medium whitespace-nowrap">編輯</button>
                        <button onClick={() => toggleActive(machine)} className="text-sm font-medium whitespace-nowrap text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                          {machine.is_active ? '下架' : '上架'}
                        </button>
                        <button onClick={() => handleDelete(machine)} className="text-red-500 hover:text-red-700 text-sm font-medium whitespace-nowrap">刪除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增挑戰機台">
        <div className="space-y-4">
          <Field label="機台名稱 *">
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-base" placeholder="例：超級挑戰機" />
          </Field>
          <Field label="描述">
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input-base resize-none" rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="每次消耗 G幣 *">
              <input type="number" value={form.price_per_spin} onChange={e => setForm(p => ({ ...p, price_per_spin: e.target.value }))} className="input-base" min={1} />
            </Field>
            <Field label="RUSH 觸發率 (0-1)">
              <input type="number" value={form.trigger_rate} onChange={e => setForm(p => ({ ...p, trigger_rate: e.target.value }))} className="input-base" step={0.01} min={0} max={1} />
            </Field>
            <Field label="RUSH 延續率 (0-1)">
              <input type="number" value={form.continue_rate} onChange={e => setForm(p => ({ ...p, continue_rate: e.target.value }))} className="input-base" step={0.01} min={0} max={1} />
            </Field>
            <Field label="RUSH 最少連中">
              <input type="number" value={form.min_rush_hits} onChange={e => setForm(p => ({ ...p, min_rush_hits: e.target.value }))} className="input-base" min={1} />
            </Field>
            <Field label="保底轉數">
              <input type="number" value={form.floor_spin_count} onChange={e => setForm(p => ({ ...p, floor_spin_count: e.target.value }))} className="input-base" min={1} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-ghost">取消</button>
            <button onClick={handleCreate} disabled={saving || !form.name} className="btn-primary">
              {saving ? '建立中...' : '建立機台'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
