'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal } from '@/components'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabaseClient'

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative flex-shrink-0" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold cursor-help select-none leading-none">!</div>
      {show && (
        <div className="absolute right-0 top-5 w-52 bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl z-50 leading-relaxed whitespace-normal pointer-events-none">
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
    remaining: number | null
    products: { name: string; type: string } | null
  } | null
}

interface ProductPrize {
  id: number
  name: string
  level: string
  image_url: string | null
  product_id: number
  remaining: number | null
  products: { name: string; type: string } | null
}

// pool_band: tier coins as string ('100') or 'rush'
const EMPTY_POOL_FORM = {
  product_prize_id: '',
  weight: '100',
  pool_band: '',   // required
  is_floor: false,
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
  const [poolTab, setPoolTab] = useState<string>('') // initialised after machine loads

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
    // Default to first tier tab
    setPoolTab(existingTiers.length > 0 ? String(existingTiers[0].coins) : 'rush')
    setIsLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    if (!showAddPool) return
    supabase
      .from('product_prizes')
      .select('id, name, level, image_url, product_id, remaining, products(name, type)')
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

  const openAddModal = () => {
    setPoolForm({ ...EMPTY_POOL_FORM, pool_band: poolTab })
    setSelectedPrize(null)
    setPrizeSearch('')
    setShowAddPool(true)
  }

  const closeAddModal = () => {
    setShowAddPool(false)
    setSelectedPrize(null)
    setPrizeSearch('')
  }

  const handleAddPool = async () => {
    if (!poolForm.pool_band) { toast('請選擇歸屬獎池', 'error'); return }
    setSavingPool(true)
    try {
      const isRush = poolForm.pool_band === 'rush'
      const res = await fetch(`/api/admin/slot/machines/${id}/pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_prize_id: poolForm.product_prize_id,
          weight: poolForm.weight,
          min_bet: isRush ? null : parseInt(poolForm.pool_band),
          is_floor: poolForm.is_floor,
          rush_only: isRush,
          normal_only: false,
          remaining: poolForm.remaining === '' ? null : parseInt(poolForm.remaining),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('獎品已加入獎池')
      closeAddModal()
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

  // Pool tabs: each tier + RUSH
  const poolBands = [
    ...currentTiers.map(t => ({ key: String(t.coins), label: `${t.coins} G` })),
    { key: 'rush', label: '🔥 RUSH' },
  ]

  const getTabItems = (tab: string) =>
    tab === 'rush'
      ? pool.filter(p => p.rush_only)
      : pool.filter(p => !p.rush_only && (p.min_bet == null || String(p.min_bet) === tab))

  const tabItems = getTabItems(poolTab)

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
            <Field label="機台名稱" tooltip="顯示在前台挑戰頁的機台標題。">
              <input type="text" className={INPUT} value={machineForm.name ?? ''} onChange={e => setMachineForm(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="RUSH 觸發率 %" tooltip="每轉結束後觸發 RUSH 模式的機率。設 15 表示每轉有 15% 機率進入 RUSH，未觸發則累積保底計數。">
              <div className="relative">
                <input type="number" min={0} max={100} step={1} className={INPUT + ' pr-8'} value={machineForm.trigger_rate != null ? Math.round(machineForm.trigger_rate * 100) : ''} onChange={e => setMachineForm(p => ({ ...p, trigger_rate: parseFloat(e.target.value) / 100 }))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
              </div>
            </Field>
            <Field label="RUSH 延續率 %" tooltip="保底連數結束後，每轉繼續 RUSH 的機率。設 60 表示 60% 機率繼續再抽一轉 RUSH 獎池，40% 機率 RUSH 結束。">
              <div className="relative">
                <input type="number" min={0} max={100} step={1} className={INPUT + ' pr-8'} value={machineForm.continue_rate != null ? Math.round(machineForm.continue_rate * 100) : ''} onChange={e => setMachineForm(p => ({ ...p, continue_rate: parseFloat(e.target.value) / 100 }))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
              </div>
            </Field>
            <Field label="RUSH 保底連數" tooltip="觸發 RUSH 後，前 N 轉保證從 RUSH 獎池抽品項，之後才開始看延續率決定是否繼續。設 3 代表最少連中 3 次大獎。">
              <input type="number" min={1} className={INPUT} value={machineForm.min_rush_hits ?? ''} onChange={e => setMachineForm(p => ({ ...p, min_rush_hits: parseInt(e.target.value) }))} />
            </Field>
            <Field label="保底轉數" tooltip="連轉 N 次都沒觸發 RUSH，則下一轉必定觸發。防止玩家長時間抽不到 RUSH。">
              <input type="number" className={INPUT} value={machineForm.floor_spin_count ?? ''} onChange={e => setMachineForm(p => ({ ...p, floor_spin_count: parseInt(e.target.value) }))} />
            </Field>
            <Field label="排序順序" tooltip="數字越小越靠前，用於前台機台排列順序。">
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

        {/* Pool management */}
        <PageCard noPadding>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-700">獎池管理</h3>
            <button onClick={openAddModal} className={BTN_PRIMARY}>+ 加入獎品</button>
          </div>

          {/* Tier tabs */}
          {poolBands.length > 0 && (
            <div className="flex gap-0 border-b border-neutral-200 px-4 overflow-x-auto scrollbar-none">
              {poolBands.map(band => {
                const count = getTabItems(band.key).length
                const isActive = poolTab === band.key
                return (
                  <button
                    key={band.key}
                    onClick={() => setPoolTab(band.key)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {band.label}
                    <span className={`ml-1.5 text-xs ${isActive ? 'text-primary/70' : 'text-neutral-400'}`}>
                      ({count})
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Pool table */}
          {tabItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-400">此獎池尚無品項</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    {['獎品', '等級', '權重', '庫存（商品）', '屬性', ''].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {tabItems.map(item => {
                    const rawLevel = item.product_prizes?.level ?? '—'
                    const pType = item.product_prizes?.products?.type ?? ''
                    const displayLevel = (['gacha', 'blindbox', 'slot'].includes(pType)) ? '普通' : rawLevel
                    const prizeRemaining = item.product_prizes?.remaining
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
                        <td className="px-4 py-3 text-neutral-600">
                          {prizeRemaining === null || prizeRemaining === undefined
                            ? <span className="text-green-600">∞</span>
                            : prizeRemaining}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.is_floor && <Badge color="amber">保底</Badge>}
                            {item.rush_only && <Badge color="purple">Rush</Badge>}
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
      <Modal isOpen={showAddPool} onClose={closeAddModal} title="加入獎品到獎池">
        <div className="space-y-4">

          {/* Prize search */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">搜尋獎品</label>
            <input
              type="text"
              className={INPUT}
              placeholder="輸入名稱搜尋..."
              value={prizeSearch}
              onChange={e => { setPrizeSearch(e.target.value); setSelectedPrize(null); setPoolForm(p => ({ ...p, product_prize_id: '', remaining: '' })) }}
            />
            {prizes.length > 0 && (
              <div className="mt-2 max-h-44 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                {prizes.map(prize => {
                  const isSelected = poolForm.product_prize_id === String(prize.id)
                  const pType = prize.products?.type ?? ''
                  const displayLevel = ['gacha', 'blindbox', 'slot'].includes(pType) ? '普通' : prize.level
                  return (
                    <button
                      key={prize.id}
                      onClick={() => {
                        setPoolForm(p => ({
                          ...p,
                          product_prize_id: String(prize.id),
                          remaining: prize.remaining != null ? String(prize.remaining) : '',
                        }))
                        setSelectedPrize(prize)
                      }}
                      className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <img
                        src={prize.image_url || '/images/item.png'}
                        alt=""
                        className="w-10 h-10 object-cover rounded-lg shrink-0 bg-neutral-100"
                      />
                      <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 shrink-0 whitespace-nowrap">
                        {displayLevel}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className={`font-medium truncate ${isSelected ? 'text-primary' : 'text-neutral-800'}`}>{prize.name}</span>
                        <span className="text-xs text-neutral-400 truncate">{prize.products?.name ?? ''}</span>
                      </div>
                      {prize.remaining != null && (
                        <span className="ml-auto text-xs text-neutral-400 shrink-0">庫存 {prize.remaining}</span>
                      )}
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

          {/* Pool band — required */}
          <Field label="歸屬獎池 *">
            <select
              className={INPUT}
              value={poolForm.pool_band}
              onChange={e => setPoolForm(p => ({ ...p, pool_band: e.target.value }))}
            >
              <option value="">— 選擇歸屬獎池 —</option>
              {currentTiers.map(tier => (
                <option key={tier.coins} value={String(tier.coins)}>
                  {tier.coins} G 檔次（普通獎池）
                </option>
              ))}
              <option value="rush">🔥 RUSH 獎池</option>
            </select>
            <p className="mt-1 text-xs text-neutral-400">
              普通獎池：每轉都可能抽到。RUSH 獎池：僅 RUSH 連莊時出現。
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="權重">
              <input
                type="number"
                className={INPUT}
                value={poolForm.weight}
                onChange={e => setPoolForm(p => ({ ...p, weight: e.target.value }))}
                min={1}
              />
              <p className="mt-1 text-xs text-neutral-400">越高越容易抽中（相對機率）</p>
            </Field>
            <Field label="庫存（連動商品）">
              <input
                type="number"
                className={INPUT}
                value={poolForm.remaining}
                onChange={e => setPoolForm(p => ({ ...p, remaining: e.target.value }))}
                min={0}
                placeholder={selectedPrize?.remaining != null ? `商品庫存 ${selectedPrize.remaining}` : '無限'}
              />
              <p className="mt-1 text-xs text-neutral-400">選獎品後自動帶入；空白＝不設上限</p>
            </Field>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={poolForm.is_floor}
              onChange={e => setPoolForm(p => ({ ...p, is_floor: e.target.checked }))}
              className="w-4 h-4 rounded accent-primary"
            />
            <span className="text-sm text-neutral-700">保底品（超過保底轉數必中）</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={closeAddModal} className={BTN_GHOST}>取消</button>
            <button
              onClick={handleAddPool}
              disabled={savingPool || !poolForm.product_prize_id || !poolForm.pool_band}
              className={BTN_PRIMARY}
            >
              {savingPool ? '新增中...' : '加入獎池'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}

function Field({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <label className="text-sm font-medium text-neutral-700">{label}</label>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      {children}
    </div>
  )
}
