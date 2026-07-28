'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal, SearchToolbar, SortableTableHeader } from '@/components'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
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
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact':     return 'py-2 px-2'
      case 'normal':      return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

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

  const filtered = machines
    .filter(m => {
      if (searchQuery && !m.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (statusFilter === 'active' && !m.is_active) return false
      if (statusFilter === 'inactive' && m.is_active) return false
      return true
    })
    .sort((a, b) => {
      let av: any, bv: any
      switch (sortField) {
        case 'name':         av = a.name ?? ''; bv = b.name ?? ''; break
        case 'price':        av = a.price_per_spin; bv = b.price_per_spin; break
        case 'trigger_rate': av = a.trigger_rate; bv = b.trigger_rate; break
        case 'floor':        av = a.floor_spin_count; bv = b.floor_spin_count; break
        default:             av = a.name ?? ''; bv = b.name ?? ''
      }
      if (typeof av === 'string') return sortDirection === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDirection === 'asc' ? av - bv : bv - av
    })

  const show = (key: string) => visibleColumns[key] !== false
  const dc = getDensityClasses()

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
                { value: 'all',      label: '全部狀態' },
                { value: 'active',   label: '上架中' },
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
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {show('name')         && <SortableTableHeader sortKey="name"         currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>機台名稱</SortableTableHeader>}
                  {show('price')        && <SortableTableHeader sortKey="price"        currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>每次 G幣</SortableTableHeader>}
                  {show('trigger_rate') && <SortableTableHeader sortKey="trigger_rate" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>RUSH 觸發率</SortableTableHeader>}
                  {show('floor')        && <SortableTableHeader sortKey="floor"        currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>保底轉數</SortableTableHeader>}
                  {show('status')       && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>上架</th>}
                  {show('operations')   && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map(machine => (
                  <tr key={machine.id} className="hover:bg-neutral-50 transition-colors">
                    {show('name')         && <td className={`${dc} text-sm font-medium text-neutral-900 whitespace-nowrap`}>{machine.name || '（未命名）'}</td>}
                    {show('price')        && <td className={`${dc} text-sm text-amber-600 font-bold whitespace-nowrap`}>{machine.price_per_spin}</td>}
                    {show('trigger_rate') && <td className={`${dc} text-sm text-neutral-600 whitespace-nowrap`}>{(machine.trigger_rate * 100).toFixed(0)}%</td>}
                    {show('floor')        && <td className={`${dc} text-sm text-neutral-600 whitespace-nowrap`}>{machine.floor_spin_count}</td>}
                    {show('status')       && <td className={`${dc} whitespace-nowrap`}><Switch checked={machine.is_active} onCheckedChange={() => toggleActive(machine)} /></td>}
                    {show('operations')   && (
                      <td className={`${dc} whitespace-nowrap`}>
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
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">機台名稱 *</label>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" placeholder="例：超級挑戰機" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">描述</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">每次消耗 G幣 *</label>
              <input type="number" value={form.price_per_spin} onChange={e => setForm(p => ({ ...p, price_per_spin: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" min={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">RUSH 觸發率 (0-1)</label>
              <input type="number" value={form.trigger_rate} onChange={e => setForm(p => ({ ...p, trigger_rate: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" step={0.01} min={0} max={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">RUSH 延續率 (0-1)</label>
              <input type="number" value={form.continue_rate} onChange={e => setForm(p => ({ ...p, continue_rate: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" step={0.01} min={0} max={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">RUSH 最少連中</label>
              <input type="number" value={form.min_rush_hits} onChange={e => setForm(p => ({ ...p, min_rush_hits: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" min={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">保底轉數</label>
              <input type="number" value={form.floor_spin_count} onChange={e => setForm(p => ({ ...p, floor_spin_count: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" min={1} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">取消</button>
            <button onClick={handleCreate} disabled={saving || !form.name} className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60">
              {saving ? '建立中...' : '建立機台'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}
