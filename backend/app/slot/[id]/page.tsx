'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal } from '@/components'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabaseClient'

interface BetTier {
  label: string
  coins: number
}

interface SlotMachine {
  id: number
  name: string
  description: string | null
  image_url: string | null
  price_per_spin: number
  trigger_rate: number
  continue_rate: number
  min_rush_hits: number
  floor_spin_count: number
  is_active: boolean
  sort_order: number
  bet_tiers: BetTier[]
}

interface PoolItem {
  id: number
  weight: number
  min_bet: number | null
  is_floor: boolean
  rush_only: boolean
  normal_only: boolean
  remaining: number | null
  product_prizes: {
    id: number
    name: string
    level: string
    image_url: string | null
    product_id: number
    products: { name: string; type: string } | null
  } | null
}

interface ProductPrize {
  id: number
  name: string
  level: string
  image_url: string | null
  product_id: number
  products: { name: string; type: string } | null
}

const EMPTY_POOL_FORM = {
  product_prize_id: '',
  weight: '100',
  min_bet: '',
  is_floor: false,
  rush_only: false,
  normal_only: false,
  remaining: '',
}

const INPUT = 'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm'
const BTN_PRIMARY = 'px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60'
const BTN_GHOST = 'px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors'

function parseTierInput(raw: string): BetTier[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => n > 0)
    .map(c => ({ label: String(c), coins: c }))
}

function tiersToInput(tiers: BetTier[]): string {
  return tiers.map(t => t.coins).join(',')
}

export default function SlotDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [machine, setMachine] = useState<SlotMachine | null>(null)
  const [pool, setPool] = useState<PoolItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddPool, setShowAddPool] = useState(false)
  const [poolForm, setPoolForm] = useState(EMPTY_POOL_FORM)
  const [savingPool, setSavingPool] = useState(false)
  const [prizes, setPrizes] = useState<ProductPrize[]>([])
  const [prizeSearch, setPrizeSearch] = useState('')
  const [selectedPrize, setSelectedPrize] = useState<ProductPrize | null>(null)
  const [machineForm, setMachineForm] = useState<Partial<SlotMachine>>({})
  const [tierInput, setTierInput] = useState('')
  const [savingMachine, setSavingMachine] = useState(false)

  const fetchData = async () => {
    setIsLoading(true)
    const res = await fetch(`/api/admin/slot/machines/${id}`)
    const data = await res.json()
    const m: SlotMachine = data.machine
    setMachine(m)
    setPool(data.pool ?? [])
    setMachineForm({ ...m })
    const existingTiers: BetTier[] = m.bet_tiers ?? []
    setTierInput(existingTiers.length > 0 ? tiersToInput(existingTiers) : String(m.price_per_spin ?? 100))
    setIsLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    if (!showAddPool) return
    supabase
      .from('product_prizes')
      .select('id, name, level, image_url, product_id, products(name, type)')
      .ilike('name', prizeSearch ? `%${prizeSearch}%` : '%')
      .limit(30)
      .then(({ data }) => setPrizes((data ?? []) as unknown as ProductPrize[]))
  }, [showAddPool, prizeSearch])

  const handleSaveMachine = async () => {
    const tiers = parseTierInput(tierInput)
    if (!tiers.length) { toast('至少需要一個檔次 G幣', 'error'); return }

    setSavingMachine(true)
    try {
      const res = await fetch(`/api/admin/slot/machines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...machineForm,
          bet_tiers: tiers,
          price_per_spin: tiers[0].coins,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('儲存成功')
      setMachine(data.machine)
    } catch (e: any) {
      toast(e.message ?? '儲存失敗', 'error')
    } finally {
      setSavingMachine(false)
    }
  }

  const handleAddPool = async () => {
    setSavingPool(true)
    try {
      const res = await fetch(`/api/admin/slot/machines/${id}/pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...poolForm,
          min_bet: poolForm.min_bet === '' ? null : parseInt(poolForm.min_bet),
          remaining: poolForm.remaining === '' ? null : poolForm.remaining,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('獎品已加入獎池')
      setShowAddPool(false)
      setPoolForm(EMPTY_POOL_FORM)
      setSelectedPrize(null)
      setPrizeSearch('')
      fetchData()
    } catch (e: any) {
      toast(e.message ?? '新增失敗', 'error')
    } finally {
      setSavingPool(false)
    }
  }

  const handleDeletePool = async (itemId: number) => {
    if (!confirm('確定移除此獎品？')) return
    const res = await fetch(`/api/admin/slot/machines/${id}/pool?item_id=${itemId}`, { method: 'DELETE' })
    if (res.ok) { toast('已移除'); fetchData() }
  }

  if (isLoading) return <AdminLayout pageTitle="挑戰機台"><div className="p-8 text-center text-neutral-400">載入中...</div></AdminLayout>
  if (!machine) return <AdminLayout pageTitle="挑戰機台"><div className="p-8 text-center text-neutral-400">機台不存在</div></AdminLayout>

  const currentTiers = parseTierInput(tierInput)

  return (
    <AdminLayout
      pageTitle={machine.name || '挑戰機台'}
      breadcrumbs={[
        { label: '挑戰機台', href: '/slot' },
        { label: machine.name || '機台設定', href: `/slot/${id}` },
      ]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-white border-2 border-neutral-200 rounded-full hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <button onClick={handleSaveMachine} disabled={savingMachine} className={BTN_PRIMARY}>
            {savingMachine ? '儲存中...' : '儲存設定'}
          </button>
        </div>

        {/* Machine settings */}
        <PageCard>
          <h3 className="text-sm font-semibold text-neutral-700 mb-4">機台設定</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="機台名稱">
              <input type="text" className={INPUT} value={machineForm.name ?? ''} onChange={e => setMachineForm(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="RUSH 觸發率 (0–1)">
              <input type="number" step="0.01" className={INPUT} value={machineForm.trigger_rate ?? ''} onChange={e => setMachineForm(p => ({ ...p, trigger_rate: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="RUSH 延續率 (0–1)">
              <input type="number" step="0.01" className={INPUT} value={machineForm.continue_rate ?? ''} onChange={e => setMachineForm(p => ({ ...p, continue_rate: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="RUSH 最少連中次數">
              <input type="number" className={INPUT} value={machineForm.min_rush_hits ?? ''} onChange={e => setMachineForm(p => ({ ...p, min_rush_hits: parseInt(e.target.value) }))} />
            </Field>
            <Field label="保底轉數">
              <input type="number" className={INPUT} value={machineForm.floor_spin_count ?? ''} onChange={e => setMachineForm(p => ({ ...p, floor_spin_count: parseInt(e.target.value) }))} />
            </Field>
            <Field label="排序順序">
              <input type="number" className={INPUT} value={machineForm.sort_order ?? ''} onChange={e => setMachineForm(p => ({ ...p, sort_order: parseInt(e.target.value) }))} />
            </Field>
            <Field label="上架狀態">
              <div className="flex items-center gap-2 mt-1">
                <Switch
                  checked={machineForm.is_active ?? false}
                  onCheckedChange={v => setMachineForm(p => ({ ...p, is_active: v }))}
                />
                <span className="text-sm text-neutral-600">{machineForm.is_active ? '上架中' : '已下架'}</span>
              </div>
            </Field>
            <div className="col-span-1 md:col-span-2">
              <Field label="檔次 G幣">
                <input
                  type="text"
                  className={INPUT}
                  placeholder="以逗號分隔，例：10,20,50,100,200,500,1000"
                  value={tierInput}
                  onChange={e => setTierInput(e.target.value)}
                />
                {currentTiers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {currentTiers.map(t => (
                      <span key={t.coins} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{t.coins} G</span>
                    ))}
                  </div>
                )}
              </Field>
            </div>
          </div>
        </PageCard>

        {/* Pool items */}
        <PageCard noPadding>
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-700">獎池管理</h3>
            <button onClick={() => setShowAddPool(true)} className={BTN_PRIMARY}>
              + 加入獎品
            </button>
          </div>

          {pool.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-400">獎池尚無品項</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    {['獎品', '等級', '權重', '最低檔次', '庫存', '屬性', ''].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pool.map(item => {
                    const tierName = item.min_bet
                      ? (currentTiers.find(t => t.coins === item.min_bet)?.label ?? `${item.min_bet}G`)
                      : null
                    const rawLevel = item.product_prizes?.level ?? '—'
                    const pType = item.product_prizes?.products?.type ?? ''
                    const displayLevel = (['gacha', 'blindbox', 'slot'].includes(pType)) ? '普通' : rawLevel
                    return (
                      <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-900 text-sm">{item.product_prizes?.name ?? '—'}</div>
                          <div className="text-xs text-neutral-400">{item.product_prizes?.products?.name ?? ''}</div>
                        </td>
                        <td className="px-4 py-3 max-w-[80px]">
                          <span className="text-xs text-neutral-500 block truncate">{displayLevel}</span>
                        </td>
                        <td className="px-4 py-3 text-neutral-700 font-bold">{item.weight}</td>
                        <td className="px-4 py-3">
                          {tierName ? <Badge color="blue">{tierName}↑</Badge> : <span className="text-xs text-green-600">全檔</span>}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">
                          {item.remaining === null ? <span className="text-green-600">∞</span> : item.remaining}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.is_floor && <Badge color="amber">保底</Badge>}
                            {item.rush_only && <Badge color="purple">Rush</Badge>}
                            {item.normal_only && <Badge color="gray">Normal</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeletePool(item.id)}
                            className="text-red-500 hover:text-red-700 text-sm font-medium"
                          >刪除</button>
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

      {/* Add pool item modal */}
      <Modal isOpen={showAddPool} onClose={() => { setShowAddPool(false); setSelectedPrize(null); setPrizeSearch('') }} title="加入獎品到獎池">
        <div className="space-y-4">
          {/* Prize search */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">搜尋獎品</label>
            <input
              type="text"
              className={INPUT}
              placeholder="輸入名稱搜尋..."
              value={prizeSearch}
              onChange={e => { setPrizeSearch(e.target.value); setSelectedPrize(null); setPoolForm(p => ({ ...p, product_prize_id: '' })) }}
            />
            {prizes.length > 0 && (
              <div className="mt-2 max-h-44 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                {prizes.map(prize => {
                  const isSelected = poolForm.product_prize_id === String(prize.id)
                  return (
                    <button
                      key={prize.id}
                      onClick={() => { setPoolForm(p => ({ ...p, product_prize_id: String(prize.id) })); setSelectedPrize(prize) }}
                      className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <img
                        src={prize.image_url || '/images/item.png'}
                        alt=""
                        className="w-10 h-10 object-cover rounded-lg shrink-0 bg-neutral-100"
                      />
                      {(() => {
                        const pType = prize.products?.type ?? ''
                        const isSimple = ['gacha', 'blindbox', 'slot'].includes(pType)
                        const displayLevel = isSimple ? '普通' : prize.level
                        return (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 shrink-0 whitespace-nowrap">
                            {displayLevel}
                          </span>
                        )
                      })()}
                      <div className="flex flex-col min-w-0">
                        <span className={`font-medium truncate ${isSelected ? 'text-primary' : 'text-neutral-800'}`}>{prize.name}</span>
                        <span className="text-xs text-neutral-400 truncate">{prize.products?.name ?? ''}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {selectedPrize && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-primary font-medium">{selectedPrize.name}</span>
                <span className="text-xs text-neutral-400 ml-auto">{selectedPrize.products?.name}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="權重">
              <input type="number" className={INPUT} value={poolForm.weight} onChange={e => setPoolForm(p => ({ ...p, weight: e.target.value }))} min={1} />
            </Field>
            <Field label="庫存（空白＝無限）">
              <input type="number" className={INPUT} value={poolForm.remaining} onChange={e => setPoolForm(p => ({ ...p, remaining: e.target.value }))} min={0} placeholder="無限" />
            </Field>
          </div>

          <Field label="最低下注檔次（空白＝全檔可抽）">
            <select
              className={INPUT}
              value={poolForm.min_bet}
              onChange={e => setPoolForm(p => ({ ...p, min_bet: e.target.value }))}
            >
              <option value="">全檔可抽</option>
              {currentTiers.map(tier => (
                <option key={tier.coins} value={String(tier.coins)}>
                  {tier.coins} G幣 以上
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-6">
            {([
              { key: 'is_floor', label: '保底品' },
              { key: 'rush_only', label: '僅 RUSH' },
              { key: 'normal_only', label: '僅正常模式' },
            ] as const).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={poolForm[key]}
                  onChange={e => setPoolForm(p => ({ ...p, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm text-neutral-700">{label}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setShowAddPool(false); setSelectedPrize(null); setPrizeSearch('') }} className={BTN_GHOST}>取消</button>
            <button onClick={handleAddPool} disabled={savingPool || !poolForm.product_prize_id} className={BTN_PRIMARY}>
              {savingPool ? '新增中...' : '加入獎池'}
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
      <label className="block text-sm font-medium text-neutral-700 mb-2">{label}</label>
      {children}
    </div>
  )
}
