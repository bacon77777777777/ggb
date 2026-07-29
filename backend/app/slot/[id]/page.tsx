'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal } from '@/components'
import Switch from '@/components/ui/Switch'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/contexts/ToastContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpinReturn { name: string; multiplier: number; weight: number }
interface BetTier { coins: number }
interface SlotTheme {
  id: number; name: string; machine_count: number
  event_slug: string | null; supplier_id: number | null; image_url: string | null
  bet_tiers: BetTier[]; spin_returns: SpinReturn[]
  trigger_rate: number; continue_rate: number; min_rush_hits: number; floor_spin_count: number
  video_rush_entry: string | null; video_rush_anticipation: string | null
  video_rush_win: string | null; video_rush_win_strong: string | null
  video_rush_win_god: string | null; video_rush_revival: string | null
  is_active: boolean; sort_order: number
  suppliers: { name: string } | null
}
interface ThemePrize {
  id: number; theme_id: number; name: string; image_url: string | null
  weight: number; video_type: string; per_machine_stock: number | null
  sort_order: number; is_active: boolean
}
interface Machine {
  id: number; machine_number: number; is_active: boolean
  slot_pool_items: { id: number; coin_return: boolean; rush_only: boolean }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT = 'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm'
const BTN_PRIMARY = 'px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60'
const BTN_GHOST   = 'px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors'

const DEFAULT_SPIN_RETURNS: SpinReturn[] = [
  { name: '強レア',    multiplier: 5,    weight: 50   },
  { name: 'チャンス目', multiplier: 3,    weight: 100  },
  { name: 'チェリー',  multiplier: 2,    weight: 200  },
  { name: 'ベル',      multiplier: 1.3,  weight: 500  },
  { name: 'ハズレ',    multiplier: 0.05, weight: 1150 },
]

const VIDEO_SLOTS = [
  { key: 'video_rush_entry',        label: '突入演出',   badge: '突入',   desc: 'RUSH 觸發進場動畫' },
  { key: 'video_rush_anticipation', label: '對決煽り',   badge: '煽り',   desc: '每連開始前緊張演出' },
  { key: 'video_rush_win',          label: '普通勝利',   badge: '連',     desc: 'RUSH 普通品項獲得' },
  { key: 'video_rush_win_strong',   label: '強勝利',     badge: '強',     desc: '中高價值品項獲得' },
  { key: 'video_rush_win_god',      label: '壓勝',       badge: '激アツ', desc: '最高價值品項獲得' },
  { key: 'video_rush_revival',      label: '逆轉復活',   badge: '次回確定', desc: 'RUSH 繼續確定演出' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function SlotThemeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [theme, setTheme] = useState<SlotTheme | null>(null)
  const [prizes, setPrizes] = useState<ThemePrize[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'settings' | 'prizes' | 'videos' | 'machines'>('settings')
  const [saving, setSaving] = useState(false)

  // Theme form state
  const [form, setForm] = useState<Partial<SlotTheme>>({})
  const [betTiersInput, setBetTiersInput] = useState('')
  const [spinReturns, setSpinReturns] = useState<SpinReturn[]>(DEFAULT_SPIN_RETURNS)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')

  // Prize modal
  const [showAddPrize, setShowAddPrize] = useState(false)
  const [editingPrize, setEditingPrize] = useState<ThemePrize | null>(null)
  const [prizeForm, setPrizeForm] = useState({ name: '', image_url: '', weight: '100', video_type: 'win', per_machine_stock: '' })
  const [prizeImageFile, setPrizeImageFile] = useState<File | null>(null)
  const [prizeImagePreview, setPrizeImagePreview] = useState('')
  const [savingPrize, setSavingPrize] = useState(false)
  const savingPrizeLock = useRef(false)

  const fetchData = async () => {
    setIsLoading(true)
    const res = await fetch(`/api/admin/slot/themes/${id}`)
    const data = await res.json()
    const t: SlotTheme = data.theme
    setTheme(t)
    setPrizes(data.prizes ?? [])
    setMachines(data.machines ?? [])
    setForm({ ...t })
    setBetTiersInput((t.bet_tiers ?? []).map((b: BetTier) => b.coins).join(','))
    setSpinReturns(t.spin_returns?.length ? t.spin_returns : DEFAULT_SPIN_RETURNS)
    setImagePreview(t.image_url ?? '')
    setIsLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  // ── Computed ───────────────────────────────────────────────────────────────

  const parsedTiers = betTiersInput
    .split(',').map(s => s.trim()).filter(Boolean).map(Number)
    .filter(n => n > 0).map(c => ({ coins: c }))

  const avgRushHits = form.min_rush_hits != null && form.continue_rate != null
    ? (form.min_rush_hits + form.continue_rate / (1 - form.continue_rate)).toFixed(1)
    : '—'

  const directAttackCosts = parsedTiers.map(t => ({
    coins: t.coins,
    cost: t.coins * (form.floor_spin_count ?? 302),
  }))

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (parsedTiers.length === 0) { toast('請設定至少一個投注檔次', 'error'); return }
    if (parsedTiers.length > 5)   { toast('投注檔次最多 5 個', 'error'); return }
    setSaving(true)
    try {
      let finalImageUrl = form.image_url ?? ''
      if (imageFile) {
        const uploadForm = new FormData()
        uploadForm.append('file', imageFile)
        uploadForm.append('bucket', 'products')
        uploadForm.append('path', `slot-theme-${id}-${Date.now()}.${(imageFile.name.split('.').pop() || 'jpg')}`)
        const uploadRes = await fetch('/api/admin/upload', { method: 'POST', body: uploadForm })
        const uploadJson = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) throw new Error(uploadJson?.error || '圖片上傳失敗')
        finalImageUrl = String(uploadJson?.publicUrl || '')
      }

      const res = await fetch(`/api/admin/slot/themes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          bet_tiers: parsedTiers,
          spin_returns: spinReturns,
          image_url: finalImageUrl || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('儲存成功')
      setTheme(data.theme)
      setImageFile(null)
    } catch (e: any) {
      toast(e.message ?? '儲存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveVideos = async (updates: Record<string, string | null>) => {
    const res = await fetch(`/api/admin/slot/themes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) { toast('影片儲存成功'); fetchData() }
    else toast('儲存失敗', 'error')
  }

  const openAddPrize = (prize?: ThemePrize) => {
    if (prize) {
      setEditingPrize(prize)
      setPrizeForm({
        name: prize.name, image_url: prize.image_url ?? '',
        weight: String(prize.weight), video_type: prize.video_type,
        per_machine_stock: prize.per_machine_stock != null ? String(prize.per_machine_stock) : '',
      })
      setPrizeImagePreview(prize.image_url ?? '')
    } else {
      setEditingPrize(null)
      setPrizeForm({ name: '', image_url: '', weight: '100', video_type: 'win', per_machine_stock: '' })
      setPrizeImagePreview('')
    }
    setPrizeImageFile(null)
    setShowAddPrize(true)
  }

  const handleSavePrize = async () => {
    if (savingPrizeLock.current) return
    if (!prizeForm.name) { toast('請填入獎品名稱', 'error'); return }
    savingPrizeLock.current = true
    setSavingPrize(true)
    try {
      let finalImageUrl = prizeForm.image_url
      if (prizeImageFile) {
        const uploadForm = new FormData()
        uploadForm.append('file', prizeImageFile)
        uploadForm.append('bucket', 'products')
        uploadForm.append('path', `slot-prize-${id}-${Date.now()}.${(prizeImageFile.name.split('.').pop() || 'jpg')}`)
        const uploadRes = await fetch('/api/admin/upload', { method: 'POST', body: uploadForm })
        const uploadJson = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) throw new Error(uploadJson?.error || '圖片上傳失敗')
        finalImageUrl = String(uploadJson?.publicUrl || '')
      }

      const payload = {
        name: prizeForm.name,
        image_url: finalImageUrl || null,
        weight: parseInt(prizeForm.weight) || 100,
        video_type: prizeForm.video_type,
        per_machine_stock: prizeForm.per_machine_stock === '' ? null : parseInt(prizeForm.per_machine_stock),
      }

      if (editingPrize) {
        const res = await fetch(`/api/admin/slot/themes/${id}/prizes/${editingPrize.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error || '更新失敗')
      } else {
        const res = await fetch(`/api/admin/slot/themes/${id}/prizes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error || '新增失敗')
      }
      toast(editingPrize ? '已更新' : '獎品已加入')
      setShowAddPrize(false)
      fetchData()
    } catch (e: any) {
      toast(e.message ?? '儲存失敗', 'error')
    } finally {
      savingPrizeLock.current = false
      setSavingPrize(false)
    }
  }

  const handleDeletePrize = async (prizeId: number) => {
    if (!confirm('確定移除此獎品？')) return
    const res = await fetch(`/api/admin/slot/themes/${id}/prizes/${prizeId}`, { method: 'DELETE' })
    if (res.ok) { toast('已移除'); fetchData() }
    else toast('移除失敗', 'error')
  }

  const handleAddMachine = async () => {
    const res = await fetch(`/api/admin/slot/themes/${id}/machines`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) { toast(`#${data.machine.machine_number} 已加入`); fetchData() }
    else toast(data.error ?? '新增失敗', 'error')
  }

  const handleRemoveMachine = async (machineId: number) => {
    if (!confirm('確定移除此機台？機台將下架並解除關聯，歷史 session 保留。')) return
    const res = await fetch(`/api/admin/slot/themes/${id}/machines?machine_id=${machineId}`, { method: 'DELETE' })
    if (res.ok) { toast('已移除'); fetchData() }
    else toast('移除失敗', 'error')
  }

  const handleToggleMachine = async (machine: Machine) => {
    const res = await fetch(`/api/admin/slot/machines/${machine.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !machine.is_active }),
    })
    if (res.ok) {
      setMachines(prev => prev.map(m => m.id === machine.id ? { ...m, is_active: !m.is_active } : m))
      toast(machine.is_active ? '已下架' : '已上架')
    }
  }

  if (isLoading) return <AdminLayout pageTitle="主題設定"><div className="p-8 text-center text-neutral-400">載入中...</div></AdminLayout>
  if (!theme) return <AdminLayout pageTitle="主題設定"><div className="p-8 text-center text-neutral-400">找不到主題</div></AdminLayout>

  const TABS = [
    { key: 'settings', label: '主題設定' },
    { key: 'prizes',   label: `RUSH獎池 (${prizes.length})` },
    { key: 'videos',   label: '特效影片' },
    { key: 'machines', label: `機台管理 (${machines.length})` },
  ] as const

  return (
    <AdminLayout
      pageTitle={theme.name}
      breadcrumbs={[
        { label: '挑戰機台主題', href: '/slot' },
        { label: theme.name, href: `/slot/${id}` },
      ]}
    >
      <div className="space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          {activeTab === 'settings' && (
            <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
              {saving ? '儲存中...' : '儲存設定'}
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div className="border-b border-neutral-200 flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ Tab: 主題設定 ═══════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            {/* 基本資訊 */}
            <PageCard>
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">基本資訊</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="主題名稱 *">
                  <input type="text" className={INPUT} value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </Field>
                <Field label="活動頁連結（event_slug）">
                  <input type="text" className={INPUT} placeholder="例：1（對應 /events/1）" value={form.event_slug ?? ''} onChange={e => setForm(p => ({ ...p, event_slug: e.target.value || null }))} />
                </Field>
                <Field label="廠商 ID">
                  <input type="number" className={INPUT} value={form.supplier_id ?? ''} onChange={e => setForm(p => ({ ...p, supplier_id: parseInt(e.target.value) || null }))} />
                </Field>
                <Field label="排序">
                  <input type="number" className={INPUT} value={form.sort_order ?? 0} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) }))} />
                </Field>
                <Field label="上架狀態">
                  <div className="flex items-center gap-2 mt-1">
                    <Switch checked={form.is_active ?? false} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                    <span className="text-sm text-neutral-600">{form.is_active ? '上架中' : '已下架'}</span>
                  </div>
                </Field>
                <Field label="主題圖片（選填）">
                  <input type="file" accept="image/*" onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) }
                  }} className="w-full text-sm text-neutral-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200" />
                  {imagePreview && (
                    <div className="mt-2 relative w-32 h-20 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
                      <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                </Field>
              </div>
            </PageCard>

            {/* 投注檔次 */}
            <PageCard>
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">投注檔次（最多 5 個）</h3>
              <div className="relative">
                <input
                  type="text"
                  className={INPUT + (parsedTiers.length > 5 ? ' border-red-400' : '') + ' pr-12'}
                  placeholder="以逗號分隔，例：100,500,1000"
                  value={betTiersInput}
                  onChange={e => setBetTiersInput(e.target.value)}
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${parsedTiers.length > 5 ? 'text-red-500' : 'text-neutral-400'}`}>
                  {parsedTiers.length}/5
                </span>
              </div>
              {parsedTiers.length > 0 && parsedTiers.length <= 5 && (
                <div className="flex gap-1.5 mt-2">
                  {parsedTiers.map((t, i) => (
                    <span key={i} className="text-sm px-3 py-1 bg-amber-50 text-amber-700 font-bold rounded-full">
                      {t.coins.toLocaleString()} G
                    </span>
                  ))}
                </div>
              )}
            </PageCard>

            {/* 機率設定 */}
            <PageCard>
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">機率設定</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="RUSH 觸發率 %">
                  <div className="relative">
                    <input type="number" className={INPUT + ' pr-8'} step={0.01} min={0} max={100}
                      value={form.trigger_rate != null ? (form.trigger_rate * 100).toFixed(2) : ''}
                      onChange={e => setForm(p => ({ ...p, trigger_rate: parseFloat(e.target.value) / 100 }))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
                  </div>
                </Field>
                <Field label="RUSH 延續率 %">
                  <div className="relative">
                    <input type="number" className={INPUT + ' pr-8'} step={1} min={0} max={99}
                      value={form.continue_rate != null ? Math.round(form.continue_rate * 100) : ''}
                      onChange={e => setForm(p => ({ ...p, continue_rate: parseFloat(e.target.value) / 100 }))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
                  </div>
                </Field>
                <Field label="RUSH 最少連數">
                  <input type="number" className={INPUT} min={1}
                    value={form.min_rush_hits ?? ''}
                    onChange={e => setForm(p => ({ ...p, min_rush_hits: parseInt(e.target.value) }))}
                  />
                </Field>
                <Field label="保底轉數">
                  <input type="number" className={INPUT} min={1}
                    value={form.floor_spin_count ?? ''}
                    onChange={e => setForm(p => ({ ...p, floor_spin_count: parseInt(e.target.value) }))}
                  />
                </Field>
              </div>
              {/* 計算結果 */}
              <div className="mt-4 p-3 bg-neutral-50 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-neutral-500">平均 RUSH 連數</div>
                  <div className="font-bold text-neutral-800 text-base">{avgRushHits} 連</div>
                </div>
                {directAttackCosts.slice(0, 3).map(({ coins, cost }) => (
                  <div key={coins}>
                    <div className="text-neutral-500">直頂費用 ({coins.toLocaleString()}G)</div>
                    <div className="font-bold text-neutral-800 text-base">{cost.toLocaleString()} G</div>
                  </div>
                ))}
              </div>
            </PageCard>

            {/* 普通旋轉返還 */}
            <PageCard>
              <h3 className="text-sm font-semibold text-neutral-700 mb-1">普通旋轉返還（5 種符號）</h3>
              <p className="text-xs text-neutral-400 mb-4">不在 RUSH 中時，按照權重抽到對應符號，返還 投注 × 倍率 G 幣。</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      {['符號名稱', '倍率（× 投注）', '權重', `100G 投注返還`, `500G 投注返還`].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {spinReturns.map((sr, i) => (
                      <tr key={i} className="hover:bg-neutral-50">
                        <td className="px-3 py-2">
                          <input type="text" className="w-full px-2 py-1 border border-neutral-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            value={sr.name}
                            onChange={e => setSpinReturns(prev => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative w-24">
                            <input type="number" step={0.01} min={0}
                              className="w-full px-2 py-1 pr-4 border border-neutral-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                              value={sr.multiplier}
                              onChange={e => setSpinReturns(prev => prev.map((r, j) => j === i ? { ...r, multiplier: parseFloat(e.target.value) } : r))}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">×</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={1}
                            className="w-20 px-2 py-1 border border-neutral-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            value={sr.weight}
                            onChange={e => setSpinReturns(prev => prev.map((r, j) => j === i ? { ...r, weight: parseInt(e.target.value) } : r))}
                          />
                        </td>
                        <td className="px-3 py-2 text-neutral-700 font-bold tabular-nums">
                          {Math.floor(100 * sr.multiplier).toLocaleString()} G
                        </td>
                        <td className="px-3 py-2 text-neutral-700 font-bold tabular-nums">
                          {Math.floor(500 * sr.multiplier).toLocaleString()} G
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                總權重：{spinReturns.reduce((s, r) => s + r.weight, 0).toLocaleString()}
                　加權平均倍率：{(spinReturns.reduce((s, r) => s + r.multiplier * r.weight, 0) / spinReturns.reduce((s, r) => s + r.weight, 0)).toFixed(3)}×
              </p>
            </PageCard>
          </div>
        )}

        {/* ═══ Tab: RUSH獎池 ══════════════════════════════════════════════════ */}
        {activeTab === 'prizes' && (
          <div className="space-y-4">
            <PageCard noPadding>
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-700">RUSH 獎池模板</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">每次新增機台時，此模板的品項會自動複製一份到該機台</p>
                </div>
                <button onClick={() => openAddPrize()} className={BTN_PRIMARY}>+ 加入獎品</button>
              </div>

              {prizes.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-400">尚無 RUSH 獎品，點擊右上角新增</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 border-b border-neutral-200">
                      <tr>
                        {['圖片', '名稱', '權重', '演出類型', '每台庫存', '操作'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {prizes.map(prize => (
                        <tr key={prize.id} className="hover:bg-neutral-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200">
                              <img src={prize.image_url || '/images/item.png'} alt="" className="w-full h-full object-cover" />
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-neutral-900">{prize.name}</td>
                          <td className="px-4 py-3 font-bold text-neutral-700">{prize.weight}</td>
                          <td className="px-4 py-3">
                            <Badge color={prize.video_type === 'win_god' ? 'red' : prize.video_type === 'win_strong' ? 'amber' : 'blue'}>
                              {prize.video_type === 'win_god' ? '激アツ（壓勝）' : prize.video_type === 'win_strong' ? '強勝利' : '普通勝利'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-neutral-600">
                            {prize.per_machine_stock ?? <span className="text-green-600">∞</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <button onClick={() => openAddPrize(prize)} className="text-primary text-sm font-medium">編輯</button>
                              <button onClick={() => handleDeletePrize(prize.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PageCard>
          </div>
        )}

        {/* ═══ Tab: 特效影片 ══════════════════════════════════════════════════ */}
        {activeTab === 'videos' && (
          <VideoTab theme={theme} onSave={handleSaveVideos} />
        )}

        {/* ═══ Tab: 機台管理 ══════════════════════════════════════════════════ */}
        {activeTab === 'machines' && (
          <div className="space-y-4">
            <PageCard noPadding>
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-700">機台列表</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">各台機器的 RUSH 獎池庫存獨立計算</p>
                </div>
                <button onClick={handleAddMachine} className={BTN_PRIMARY}>+ 增加機台</button>
              </div>

              {machines.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-400">尚無機台</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 border-b border-neutral-200">
                      <tr>
                        {['編號', 'RUSH獎池品項', '普通返還品項', '上架', '前台連結', '操作'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {machines.map(machine => {
                        const rushCount   = machine.slot_pool_items?.filter(p => p.rush_only && !p.coin_return).length ?? 0
                        const returnCount = machine.slot_pool_items?.filter(p => p.coin_return).length ?? 0
                        return (
                          <tr key={machine.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-lg font-black text-neutral-700">#{machine.machine_number}</span>
                              <span className="ml-2 text-xs text-neutral-400">ID: {machine.id}</span>
                            </td>
                            <td className="px-4 py-3">
                              {rushCount > 0
                                ? <Badge color="purple">{rushCount} 件</Badge>
                                : <span className="text-xs text-neutral-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {returnCount > 0
                                ? <Badge color="blue">{returnCount} 種</Badge>
                                : <span className="text-xs text-neutral-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <Switch checked={machine.is_active} onCheckedChange={() => handleToggleMachine(machine)} />
                            </td>
                            <td className="px-4 py-3">
                              <a href={`/challenge?machine=${machine.id}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline">
                                前台預覽 ↗
                              </a>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => handleRemoveMachine(machine.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">移除</button>
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
        )}
      </div>

      {/* ─── 加入獎品 Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={showAddPrize} onClose={() => setShowAddPrize(false)} title={editingPrize ? '編輯獎品' : '加入 RUSH 獎品'}>
        <div className="space-y-4">
          <Field label="獎品名稱 *">
            <input type="text" className={INPUT} value={prizeForm.name} onChange={e => setPrizeForm(p => ({ ...p, name: e.target.value }))} placeholder="例：ピカチュウex SAR" />
          </Field>
          <Field label="獎品圖片">
            <input type="file" accept="image/*" onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setPrizeImageFile(f); setPrizeImagePreview(URL.createObjectURL(f)) }
            }} className="w-full text-sm text-neutral-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200" />
            {prizeImagePreview && (
              <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
                <img src={prizeImagePreview} alt="" className="w-full h-full object-cover" />
              </div>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="權重">
              <input type="number" className={INPUT} min={1} value={prizeForm.weight} onChange={e => setPrizeForm(p => ({ ...p, weight: e.target.value }))} />
              <p className="mt-1 text-xs text-neutral-400">越高越容易被抽到</p>
            </Field>
            <Field label="每台庫存">
              <input type="number" className={INPUT} min={0} value={prizeForm.per_machine_stock} onChange={e => setPrizeForm(p => ({ ...p, per_machine_stock: e.target.value }))} placeholder="空白 = 不限" />
              <p className="mt-1 text-xs text-neutral-400">每台機器各自的庫存量</p>
            </Field>
          </div>
          <Field label="獲得演出">
            <select className={INPUT} value={prizeForm.video_type} onChange={e => setPrizeForm(p => ({ ...p, video_type: e.target.value }))}>
              <option value="win">普通勝利（連）</option>
              <option value="win_strong">強勝利（強）</option>
              <option value="win_god">壓勝（激アツ）</option>
            </select>
          </Field>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowAddPrize(false)} className={BTN_GHOST}>取消</button>
            <button onClick={handleSavePrize} disabled={savingPrize || !prizeForm.name} className={BTN_PRIMARY}>
              {savingPrize ? '儲存中...' : editingPrize ? '更新' : '加入'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function VideoTab({ theme, onSave }: { theme: SlotTheme; onSave: (updates: Record<string, string | null>) => void }) {
  const { toast } = useToast()
  const [videos, setVideos] = useState<Record<string, string | null>>({
    video_rush_entry:        theme.video_rush_entry,
    video_rush_anticipation: theme.video_rush_anticipation,
    video_rush_win:          theme.video_rush_win,
    video_rush_win_strong:   theme.video_rush_win_strong,
    video_rush_win_god:      theme.video_rush_win_god,
    video_rush_revival:      theme.video_rush_revival,
  })
  const [uploading, setUploading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleVideoUpload = async (key: string, file: File) => {
    setUploading(key)
    try {
      const ext = file.name.split('.').pop() || 'mp4'
      const uploadForm = new FormData()
      uploadForm.append('file', file)
      uploadForm.append('bucket', 'lp-assets')
      uploadForm.append('path', `slot-theme-${theme.id}/${key}-${Date.now()}.${ext}`)
      const res = await fetch('/api/admin/upload', { method: 'POST', body: uploadForm })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '上傳失敗')
      setVideos(prev => ({ ...prev, [key]: String(json?.publicUrl || '') }))
      toast(`${key} 上傳成功`)
    } catch (e: any) {
      toast(e.message ?? '上傳失敗', 'error')
    } finally {
      setUploading(null)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(videos)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {VIDEO_SLOTS.map(slot => {
          const url = videos[slot.key]
          const isUploading = uploading === slot.key
          return (
            <PageCard key={slot.key}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  slot.key.includes('entry') ? 'bg-purple-100 text-purple-700' :
                  slot.key.includes('anticipation') ? 'bg-neutral-100 text-neutral-700' :
                  slot.key.includes('god') ? 'bg-red-100 text-red-700' :
                  slot.key.includes('strong') ? 'bg-amber-100 text-amber-700' :
                  slot.key.includes('revival') ? 'bg-green-100 text-green-700' :
                  'bg-blue-100 text-blue-700'
                }`}>{slot.badge}</span>
                <span className="text-sm font-semibold text-neutral-700">{slot.label}</span>
              </div>
              <p className="text-xs text-neutral-400 mb-3">{slot.desc}</p>

              {url ? (
                <div className="mb-3">
                  <video src={url} className="w-full rounded-lg bg-black aspect-video object-contain" controls muted playsInline />
                  <button onClick={() => setVideos(prev => ({ ...prev, [slot.key]: null }))}
                    className="mt-1 text-xs text-red-500 hover:text-red-700">
                    移除影片
                  </button>
                </div>
              ) : (
                <div className="aspect-video bg-neutral-100 rounded-lg flex items-center justify-center mb-3 border-2 border-dashed border-neutral-200">
                  <span className="text-xs text-neutral-400">{isUploading ? '上傳中...' : '尚未設定'}</span>
                </div>
              )}

              <label className="block w-full">
                <span className="block w-full text-center px-3 py-2 text-xs text-primary border border-primary rounded-lg hover:bg-primary/5 cursor-pointer transition-colors">
                  {isUploading ? '上傳中...' : url ? '重新上傳' : '上傳影片'}
                </span>
                <input type="file" accept="video/*" className="hidden" disabled={!!uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(slot.key, f) }}
                />
              </label>
            </PageCard>
          )
        })}
      </div>
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60">
          {saving ? '儲存中...' : '儲存影片設定'}
        </button>
      </div>
    </div>
  )
}
