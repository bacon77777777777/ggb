'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import PageCard from '@/components/PageCard'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import Modal from '@/components/Modal'
import SearchToolbar from '@/components/SearchToolbar'
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

const COLUMNS = [
  { key: 'name',         label: '機台名稱' },
  { key: 'price',        label: '每次 G幣' },
  { key: 'trigger_rate', label: 'RUSH 觸發率' },
  { key: 'floor',        label: '保底轉數' },
  { key: 'status',       label: '上架' },
  { key: 'operations',   label: '操作' },
]

export default function SlotPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [machines, setMachines] = useState<SlotMachine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact')
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    Object.fromEntries(COLUMNS.map(c => [c.key, true]))
  )

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
    if (res.ok) {
      toast(machine.is_active ? '已下架' : '已上架')
      setMachines(prev => prev.map(m => m.id === machine.id ? { ...m, is_active: !m.is_active } : m))
    }
  }

  const handleDelete = async (machine: SlotMachine) => {
    if (!confirm(`確定刪除「${machine.name}」？此操作不可逆。`)) return
    const res = await fetch(`/api/admin/slot/machines/${machine.id}`, { method: 'DELETE' })
    if (res.ok) { toast('已刪除'); fetchMachines() }
  }

  const filtered = machines.filter(m => {
    if (searchQuery && !m.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (statusFilter === 'active' && !m.is_active) return false
    if (statusFilter === 'inactive' && m.is_active) return false
    return true
  })

  const tdPy = tableDensity === 'compact' ? 'py-2' : tableDensity === 'normal' ? 'py-3' : 'py-4'
  const show = (key: string) => visibleColumns[key] !== false

  return (
    <AdminLayout pageTitle="挑戰機台">
      <PageCard>
        <SearchToolbar
          searchPlaceholder="搜尋機台名稱..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showAddButton={true}
          addButtonText="+ 新增機台"
          onAddClick={() => setShowCreate(true)}
          showDensity={true}
          density={tableDensity}
          onDensityChange={setTableDensity}
          showFilter={true}
          filterOptions={[
            {
              key: 'status',
              label: '上架狀態',
              type: 'select',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'all', label: '全部狀態' },
                { value: 'active', label: '上架中' },
                { value: 'inactive', label: '已下架' },
              ],
            },
          ]}
          showColumnToggle={true}
          columns={COLUMNS.map(c => ({ key: c.key, label: c.label, visible: visibleColumns[c.key] }))}
          onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
        />

        {isLoading ? (
          <div className="py-12 text-center text-sm text-neutral-400">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-400">
            {searchQuery || statusFilter !== 'all' ? '找不到符合的機台' : '尚無機台，點擊右上角新增'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200">
                <tr className="text-left text-xs text-neutral-500">
                  {show('name')         && <th className="pb-3 pr-4 font-medium">機台名稱</th>}
                  {show('price')        && <th className="pb-3 pr-4 font-medium">每次 G幣</th>}
                  {show('trigger_rate') && <th className="pb-3 pr-4 font-medium">RUSH 觸發率</th>}
                  {show('floor')        && <th className="pb-3 pr-4 font-medium">保底轉數</th>}
                  {show('status')       && <th className="pb-3 pr-4 font-medium">上架</th>}
                  {show('operations')   && <th className="pb-3 font-medium">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map(machine => (
                  <tr key={machine.id} className="hover:bg-neutral-50 transition-colors">
                    {show('name')         && <td className={`${tdPy} pr-4 font-medium text-neutral-900`}>{machine.name || '（未命名）'}</td>}
                    {show('price')        && <td className={`${tdPy} pr-4 text-amber-600 font-bold`}>{machine.price_per_spin}</td>}
                    {show('trigger_rate') && <td className={`${tdPy} pr-4 text-neutral-600`}>{(machine.trigger_rate * 100).toFixed(0)}%</td>}
                    {show('floor')        && <td className={`${tdPy} pr-4 text-neutral-600`}>{machine.floor_spin_count}</td>}
                    {show('status')       && (
                      <td className={`${tdPy} pr-4`}>
                        <Switch
                          checked={machine.is_active}
                          onCheckedChange={() => toggleActive(machine)}
                        />
                      </td>
                    )}
                    {show('operations')   && (
                      <td className={`${tdPy}`}>
                        <div className="flex items-center gap-3">
                          <button onClick={() => router.push(`/slot/${machine.id}`)} className="text-primary text-sm font-medium">編輯</button>
                          <button onClick={() => handleDelete(machine)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                        </div>
                      </td>
                    )}
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
