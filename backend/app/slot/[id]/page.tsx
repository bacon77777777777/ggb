'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal } from '@/components'
import Badge from '@/components/ui/Badge'
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
    products: { name: string } | null
  } | null
}

interface ProductPrize {
  id: number
  name: string
  level: string
  product_id: number
  products: { name: string } | null
}

const DEFAULT_BET_TIERS: BetTier[] = [
  { label: '小注', coins: 100 },
  { label: '中注', coins: 500 },
  { label: '大注', coins: 1000 },
]

const EMPTY_POOL_FORM = {
  product_prize_id: '',
  weight: '100',
  min_bet: '',
  is_floor: false,
  rush_only: false,
  normal_only: false,
  remaining: '',
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
  const [machineForm, setMachineForm] = useState<Partial<SlotMachine> & { bet_tiers_json?: string }>({})
  const [savingMachine, setSavingMachine] = useState(false)
  const [betTiersJsonError, setBetTiersJsonError] = useState<string | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    const res = await fetch(`/api/admin/slot/machines/${id}`)
    const data = await res.json()
    setMachine(data.machine)
    setPool(data.pool ?? [])
    setMachineForm({
      ...data.machine,
      bet_tiers_json: JSON.stringify(data.machine?.bet_tiers ?? DEFAULT_BET_TIERS, null, 2),
    })
    setIsLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    if (!showAddPool) return
    supabase
      .from('product_prizes')
      .select('id, name, level, product_id, products(name)')
      .ilike('name', prizeSearch ? `%${prizeSearch}%` : '%')
      .limit(30)
      .then(({ data }) => setPrizes((data ?? []) as unknown as ProductPrize[]))
  }, [showAddPool, prizeSearch])

  const handleSaveMachine = async () => {
    // Validate + parse bet_tiers JSON
    let parsedTiers: BetTier[] = DEFAULT_BET_TIERS
    try {
      parsedTiers = JSON.parse(machineForm.bet_tiers_json ?? '[]')
      if (!Array.isArray(parsedTiers) || parsedTiers.length === 0) throw new Error('至少需要一個檔次')
      for (const t of parsedTiers) {
        if (!t.label || typeof t.coins !== 'number') throw new Error('每個檔次需有 label 和 coins')
      }
      setBetTiersJsonError(null)
    } catch (e: any) {
      setBetTiersJsonError(e.message)
      return
    }

    setSavingMachine(true)
    try {
      const payload = { ...machineForm, bet_tiers: parsedTiers }
      delete (payload as any).bet_tiers_json
      const res = await fetch(`/api/admin/slot/machines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  if (isLoading) return <AdminLayout><div className="p-8 text-center text-gray-400">載入中...</div></AdminLayout>
  if (!machine) return <AdminLayout><div className="p-8 text-center text-gray-400">機台不存在</div></AdminLayout>

  const machineTiers: BetTier[] = machine.bet_tiers ?? DEFAULT_BET_TIERS

  return (
    <AdminLayout>
      <div className="space-y-6">
        <button onClick={() => router.push('/slot')} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          ← 返回機台列表
        </button>

        {/* Machine settings */}
        <PageCard>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">⚡ {machine.name} — 機台設定</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="機台名稱">
              <input type="text" className="input-base" value={machineForm.name ?? ''} onChange={e => setMachineForm(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="每次 G幣（相容舊版，建議改用下注檔次）">
              <input type="number" className="input-base" value={machineForm.price_per_spin ?? ''} onChange={e => setMachineForm(p => ({ ...p, price_per_spin: parseInt(e.target.value) }))} />
            </Field>
            <Field label="RUSH 觸發率 (0–1)">
              <input type="number" step="0.01" className="input-base" value={machineForm.trigger_rate ?? ''} onChange={e => setMachineForm(p => ({ ...p, trigger_rate: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="RUSH 延續率 (0–1)">
              <input type="number" step="0.01" className="input-base" value={machineForm.continue_rate ?? ''} onChange={e => setMachineForm(p => ({ ...p, continue_rate: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="RUSH 最少連中次數">
              <input type="number" className="input-base" value={machineForm.min_rush_hits ?? ''} onChange={e => setMachineForm(p => ({ ...p, min_rush_hits: parseInt(e.target.value) }))} />
            </Field>
            <Field label="保底轉數">
              <input type="number" className="input-base" value={machineForm.floor_spin_count ?? ''} onChange={e => setMachineForm(p => ({ ...p, floor_spin_count: parseInt(e.target.value) }))} />
            </Field>
            <Field label="排序順序">
              <input type="number" className="input-base" value={machineForm.sort_order ?? ''} onChange={e => setMachineForm(p => ({ ...p, sort_order: parseInt(e.target.value) }))} />
            </Field>
            <Field label="狀態">
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input type="checkbox" checked={machineForm.is_active ?? false} onChange={e => setMachineForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4" />
                <span className="text-sm">上架中</span>
              </label>
            </Field>
          </div>

          {/* Bet tiers editor */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              下注檔次（JSON 陣列）
              <span className="ml-2 text-gray-400 font-normal">格式：{`[{"label":"小注","coins":100}, ...]`}</span>
            </label>
            <textarea
              className={`input-base font-mono text-xs h-28 resize-none ${betTiersJsonError ? 'border-red-400' : ''}`}
              value={machineForm.bet_tiers_json ?? ''}
              onChange={e => {
                setMachineForm(p => ({ ...p, bet_tiers_json: e.target.value }))
                setBetTiersJsonError(null)
              }}
            />
            {betTiersJsonError && (
              <p className="text-xs text-red-400 mt-1">{betTiersJsonError}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              目前：{machineTiers.map(t => `${t.label}(${t.coins}G)`).join(' · ')}
            </p>
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={handleSaveMachine} disabled={savingMachine} className="btn-primary">
              {savingMachine ? '儲存中...' : '儲存設定'}
            </button>
          </div>
        </PageCard>

        {/* Pool items */}
        <PageCard>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">獎池管理</h2>
            <button onClick={() => setShowAddPool(true)} className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors">
              + 加入獎品
            </button>
          </div>

          {pool.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">獎池尚無品項</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="pb-2 pr-3 font-medium">獎品</th>
                  <th className="pb-2 pr-3 font-medium">等級</th>
                  <th className="pb-2 pr-3 font-medium">權重</th>
                  <th className="pb-2 pr-3 font-medium">最低檔次</th>
                  <th className="pb-2 pr-3 font-medium">庫存</th>
                  <th className="pb-2 pr-3 font-medium">屬性</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pool.map(item => {
                  const tierName = item.min_bet
                    ? (machineTiers.find(t => t.coins === item.min_bet)?.label ?? `${item.min_bet}G`)
                    : null
                  return (
                    <tr key={item.id}>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900 dark:text-white text-xs">{item.product_prizes?.name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{item.product_prizes?.products?.name ?? ''}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{item.product_prizes?.level ?? '—'}</span>
                      </td>
                      <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 font-bold">{item.weight}</td>
                      <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 text-xs">
                        {tierName ? <Badge color="blue">{tierName}↑</Badge> : <span className="text-green-500">全檔</span>}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">
                        {item.remaining === null ? <span className="text-green-500">∞</span> : item.remaining}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {item.is_floor && <Badge color="amber">保底</Badge>}
                          {item.rush_only && <Badge color="purple">Rush</Badge>}
                          {item.normal_only && <Badge color="gray">Normal</Badge>}
                        </div>
                      </td>
                      <td className="py-2">
                        <button onClick={() => handleDeletePool(item.id)} className="text-xs text-red-400 hover:text-red-600">刪除</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </PageCard>
      </div>

      {/* Add pool item modal */}
      <Modal isOpen={showAddPool} onClose={() => setShowAddPool(false)} title="加入獎品到獎池">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">搜尋獎品</label>
            <input
              type="text"
              className="input-base"
              placeholder="輸入名稱搜尋..."
              value={prizeSearch}
              onChange={e => setPrizeSearch(e.target.value)}
            />
            {prizes.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                {prizes.map(prize => (
                  <button
                    key={prize.id}
                    onClick={() => setPoolForm(p => ({ ...p, product_prize_id: String(prize.id) }))}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${poolForm.product_prize_id === String(prize.id) ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <span className="font-medium">{prize.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{prize.level} · {prize.products?.name ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
            {poolForm.product_prize_id && (
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">已選擇 ID: {poolForm.product_prize_id}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="權重">
              <input type="number" className="input-base" value={poolForm.weight} onChange={e => setPoolForm(p => ({ ...p, weight: e.target.value }))} min={1} />
            </Field>
            <Field label="庫存（空白=無限）">
              <input type="number" className="input-base" value={poolForm.remaining} onChange={e => setPoolForm(p => ({ ...p, remaining: e.target.value }))} min={0} placeholder="無限" />
            </Field>
          </div>

          <Field label="最低下注檔次（空白＝全檔可抽）">
            <select
              className="input-base"
              value={poolForm.min_bet}
              onChange={e => setPoolForm(p => ({ ...p, min_bet: e.target.value }))}
            >
              <option value="">全檔可抽</option>
              {machineTiers.map(tier => (
                <option key={tier.coins} value={String(tier.coins)}>
                  {tier.label}（{tier.coins} G幣）以上
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={poolForm.is_floor} onChange={e => setPoolForm(p => ({ ...p, is_floor: e.target.checked }))} />
              <span className="text-sm">保底品</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={poolForm.rush_only} onChange={e => setPoolForm(p => ({ ...p, rush_only: e.target.checked }))} />
              <span className="text-sm">僅 RUSH</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={poolForm.normal_only} onChange={e => setPoolForm(p => ({ ...p, normal_only: e.target.checked }))} />
              <span className="text-sm">僅正常模式</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAddPool(false)} className="btn-ghost">取消</button>
            <button onClick={handleAddPool} disabled={savingPool || !poolForm.product_prize_id} className="btn-primary">
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
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}
