'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal, SearchToolbar, SortableTableHeader } from '@/components'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import { useToast } from '@/contexts/ToastContext'

function InfoTooltip({ text, side = 'right' }: { text: string; side?: 'left' | 'right' }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative flex-shrink-0" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold cursor-help select-none leading-none">!</div>
      {show && (
        <div className={`absolute ${side === 'left' ? 'right-0' : 'left-0'} top-5 w-52 bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl z-50 leading-relaxed whitespace-normal pointer-events-none`}>
          {text}
        </div>
      )}
    </div>
  )
}

interface BetTier {
  label: string
  coins: number
}

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
  bet_tiers: BetTier[]
}

const DEFAULT_FORM = {
  name: '',
  description: '',
  image_url: '',
  price_per_spin: '100',
  trigger_rate: '',
  continue_rate: '',
  min_rush_hits: '',
  floor_spin_count: '',
  guaranteed_prize: true,
}

const COLUMNS = [
  { key: 'name',         label: '機台名稱' },
  { key: 'price',        label: '檔次 G幣' },
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
        body: JSON.stringify({
          ...form,
          trigger_rate: parseFloat(form.trigger_rate) / 100,
          continue_rate: parseFloat(form.continue_rate) / 100,
          guaranteed_prize: form.guaranteed_prize,
        }),
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
                  {show('price')        && <SortableTableHeader sortKey="price"        currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>檔次 G幣</SortableTableHeader>}
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
                    {show('price') && (
                      <td className={`${dc} whitespace-nowrap`}>
                        <div className="flex flex-wrap gap-1">
                          {(machine.bet_tiers?.length ? machine.bet_tiers : [{ coins: machine.price_per_spin }]).map((t, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 font-bold rounded">{t.coins} G</span>
                          ))}
                        </div>
                      </td>
                    )}
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
            <div className="flex items-center gap-1 mb-2">
              <label className="text-sm font-medium text-neutral-700">機台名稱 *</label>
              <InfoTooltip text="顯示在前台挑戰頁的機台標題。" />
            </div>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" placeholder="例：超級挑戰機" />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-2">
              <label className="text-sm font-medium text-neutral-700">檔次 G幣 *</label>
              <InfoTooltip text="可設多個檔次，以逗號分隔（如 100,500,1000）。玩家選擇檔次後每轉消耗對應 G 幣，不同檔次對應各自的普通獎池。" />
            </div>
            <input type="text" value={form.price_per_spin} onChange={e => setForm(p => ({ ...p, price_per_spin: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" placeholder="以逗號分隔，例：100,500,1000" />
            {(() => {
              const tiers = form.price_per_spin.split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(n => n > 0)
              return tiers.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tiers.map((c, i) => <span key={`${i}-${c}`} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{c} G</span>)}
                </div>
              ) : null
            })()}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1 mb-2">
                <label className="text-sm font-medium text-neutral-700">RUSH 觸發率 %</label>
                <InfoTooltip text="每轉結束後觸發 RUSH 模式的機率。設 15 表示每轉有 15% 機率進入 RUSH，未觸發則累積保底計數。" />
              </div>
              <div className="relative">
                <input type="number" value={form.trigger_rate} onChange={e => setForm(p => ({ ...p, trigger_rate: e.target.value }))} className="w-full px-3 py-2 pr-8 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" step={1} min={0} max={100} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-2">
                <label className="text-sm font-medium text-neutral-700">RUSH 延續率 %</label>
                <InfoTooltip text="保底連數結束後，每轉繼續 RUSH 的機率。設 60 表示 60% 機率繼續再抽一轉 RUSH 獎池，40% 機率 RUSH 結束。" side="left" />
              </div>
              <div className="relative">
                <input type="number" value={form.continue_rate} onChange={e => setForm(p => ({ ...p, continue_rate: e.target.value }))} className="w-full px-3 py-2 pr-8 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" step={1} min={0} max={100} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-2">
                <label className="text-sm font-medium text-neutral-700">RUSH 保底連數</label>
                <InfoTooltip text="觸發 RUSH 後，前 N 轉保證從 RUSH 獎池抽品項，之後才開始看延續率決定是否繼續。設 3 代表最少連中 3 次大獎。" />
              </div>
              <input type="number" value={form.min_rush_hits} onChange={e => setForm(p => ({ ...p, min_rush_hits: e.target.value }))} className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" min={1} />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-2">
                <label className="text-sm font-medium text-neutral-700">保底轉數</label>
                <InfoTooltip text="連轉 N 次都沒觸發 RUSH，則下一轉必定觸發。防止玩家長時間抽不到 RUSH。" side="left" />
              </div>
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
