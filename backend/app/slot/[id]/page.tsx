'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminLayout, PageCard, Modal, SortableTableHeader } from '@/components'
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
  continue_rate_decay: number
  video_rush_entry: string | null; video_rush_anticipation: string | null
  video_rush_win: string | null; video_rush_win_strong: string | null
  video_rush_win_god: string | null; video_rush_revival: string | null
  is_active: boolean; sort_order: number
  machine_type: 'video' | 'classic'
  machine_sprite_url: string | null
  machine_layout: Record<string, unknown> | null
  suppliers: { name: string } | null
}
interface ThemePrize {
  id: number; theme_id: number; name: string; image_url: string | null
  weight: number; video_type: string; per_machine_stock: number | null
  min_bet: number | null; sort_order: number; is_active: boolean
}
interface PoolItem {
  id: number
  min_bet: number | null
  remaining: number | null
  display_name: string | null
  slot_prizes: { id: number; name: string; image_url: string | null; level: string; recycle_value: number } | null
}
interface SlotPrize {
  id: number; name: string; image_url: string | null; level: string
}
interface Machine {
  id: number; machine_number: number; is_active: boolean
  slot_pool_items: { id: number; coin_return: boolean; rush_only: boolean }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT = 'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm'
const BTN_PRIMARY = 'px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60'
const BTN_GHOST   = 'px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors'

// 固定 4 種幣值返還（不需管理員設定）
const FIXED_COIN_RETURNS = [
  { name: '神域共鳴', multiplier: 2.4,  weight: 50  },
  { name: '命運之瞳', multiplier: 1.5,  weight: 100 },
  { name: '緋色幸運', multiplier: 0.8,  weight: 200 },
  { name: '黃金序章', multiplier: 0.25, weight: 520 },
]
const FIXED_TOTAL_W  = FIXED_COIN_RETURNS.reduce((s, r) => s + r.weight, 0)
const FIXED_AVG_MULT = FIXED_COIN_RETURNS.reduce((s, r) => s + r.multiplier * r.weight, 0) / FIXED_TOTAL_W

const VIDEO_SLOTS = [
  { key: 'video_rush_entry',        label: '突入演出',   badge: '突入',     desc: 'RUSH 觸發進場動畫' },
  { key: 'video_rush_anticipation', label: '對決煽り',   badge: '煽り',     desc: '每連開始前緊張演出' },
  { key: 'video_rush_win',          label: '普通勝利',   badge: '連',       desc: '三等獎品項獲得' },
  { key: 'video_rush_win_strong',   label: '強勝利',     badge: '強',       desc: '二等獎品項獲得' },
  { key: 'video_rush_win_god',      label: '壓勝',       badge: '激アツ',   desc: '一等獎品項獲得' },
  { key: 'video_rush_revival',      label: '逆轉復活',   badge: '次回確定', desc: 'RUSH 繼續確定演出' },
]

// ─── RTP 計算（幣值部分） ─────────────────────────────────────────────────────

function calcStats(p: number, N: number, minHits: number, continueRate: number) {
  if (p <= 0 || minHits <= 0) return null
  const cr = Math.min(continueRate, 0.999)
  // E[spins until RUSH trigger] with ceiling N
  const eSpins = N > 0 ? (1 - Math.pow(1 - p, N)) / p : 1 / p
  // E[RUSH hits] = minHits + cr/(1-cr)
  const eHits  = minHits + cr / (1 - cr)
  // 普通旋轉幣值回報率（RUSH 觸發時的那轉不計 coin return）
  const coinRtp = isFinite(eSpins) ? ((eSpins - eHits) * FIXED_AVG_MULT) / eSpins : FIXED_AVG_MULT * (1 - p)
  return { eSpins, eHits, coinRtp }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SlotThemeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [theme, setTheme]       = useState<SlotTheme | null>(null)
  const [prizes, setPrizes]     = useState<ThemePrize[]>([])
  const [poolItems, setPoolItems] = useState<PoolItem[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'settings' | 'prizes' | 'videos' | 'machines'>('settings')
  const [saving, setSaving] = useState(false)

  const [form, setForm]                   = useState<Partial<SlotTheme>>({})
  const [triggerRateStr, setTriggerRateStr]   = useState('')
  const [continueRateStr, setContinueRateStr] = useState('')
  const [decayStr, setDecayStr]               = useState('')
  const [betTiersInput, setBetTiersInput] = useState('')
  const [machineImageFile, setMachineImageFile]       = useState<File | null>(null)
  const [machineImagePreview, setMachineImagePreview] = useState('')
  const [spriteFile, setSpriteFile]                   = useState<File | null>(null)
  const [spritePreview, setSpritePreview]             = useState('')
  const [layoutStr, setLayoutStr]                     = useState('')

  // RUSH 獎池 modal
  const [tierFilter, setTierFilter]       = useState<number | null>(null)
  const [poolSortField, setPoolSortField] = useState('recycle')
  const [poolSortDir, setPoolSortDir]     = useState<'asc' | 'desc'>('asc')
  const [showAddPrize, setShowAddPrize]   = useState(false)
  const [availablePrizes, setAvailablePrizes] = useState<SlotPrize[]>([])
  const [prizeSearch, setPrizeSearch]     = useState('')
  const [selectedPrize, setSelectedPrize] = useState<SlotPrize | null>(null)
  const [addForm, setAddForm]             = useState({ min_bet: '', remaining: '' })
  const [savingPrize, setSavingPrize]     = useState(false)
  const savingPrizeLock = useRef(false)
  const [editingRecycle, setEditingRecycle] = useState<{ name: string; value: string } | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    const [themeRes, poolRes] = await Promise.all([
      fetch(`/api/admin/slot/themes/${id}`),
      fetch(`/api/admin/slot/themes/${id}/pool`),
    ])
    const data     = await themeRes.json()
    const poolData = await poolRes.json()
    const t: SlotTheme = data.theme
    setTheme(t)
    setPrizes(data.prizes ?? [])
    setMachines(data.machines ?? [])
    setPoolItems(poolData.items ?? [])
    setForm({ ...t })
    setTriggerRateStr((t.trigger_rate  ?? 0) > 0 ? ((t.trigger_rate  ?? 0) * 100).toFixed(2) : '')
    setContinueRateStr((t.continue_rate ?? 0) > 0 ? ((t.continue_rate ?? 0) * 100).toFixed(2) : '')
    setDecayStr(((t.continue_rate_decay ?? 0.5) * 100).toFixed(0))
    setBetTiersInput((t.bet_tiers ?? []).map((b: BetTier) => b.coins).join(','))
    setMachineImagePreview(t.image_url ?? '')
    setSpritePreview(t.machine_sprite_url ?? '')
    setLayoutStr(t.machine_layout ? JSON.stringify(t.machine_layout, null, 2) : '')
    setIsLoading(false)
  }

  const fetchPoolItems = async () => {
    const res  = await fetch(`/api/admin/slot/themes/${id}/pool`)
    const data = await res.json()
    setPoolItems(data.items ?? [])
  }

  useEffect(() => { fetchData() }, [id])

  // ── Computed ───────────────────────────────────────────────────────────────

  const parsedTiers = betTiersInput
    .split(',').map(s => s.trim()).filter(Boolean).map(Number)
    .filter(n => n > 0).map(c => ({ coins: c }))

  const p         = form.trigger_rate     ?? 0
  const N         = form.floor_spin_count ?? 70
  const minHits   = form.min_rush_hits    ?? 1
  const continueR = form.continue_rate    ?? 0

  const stats = calcStats(p, N, minHits, continueR)
  const rtpColor = !stats ? '' : stats.coinRtp > 0.7 ? 'text-red-600' : stats.coinRtp > 0.5 ? 'text-amber-600' : 'text-green-600'

  // 各檔次完整 RTP（含 RUSH 實體獎品回收幣值）
  const tierRtpList = stats ? parsedTiers.map(t => {
    const eligible  = poolItems.filter(p => p.min_bet == null || p.min_bet <= t.coins)
    const totalRecycle = eligible.reduce((s, p) => s + (p.slot_prizes?.recycle_value ?? 0), 0)
    const avgRecycle   = eligible.length > 0 ? totalRecycle / eligible.length : 0
    const prizeRtp     = avgRecycle > 0 ? (stats.eHits / stats.eSpins) * (avgRecycle / t.coins) : null
    const totalRtp     = stats.coinRtp + (prizeRtp ?? 0)
    return { tier: t.coins, prizeRtp, totalRtp, avgRecycle, prizeCount: eligible.length }
  }) : []
  const hasRecycleData = poolItems.some(p => (p.slot_prizes?.recycle_value ?? 0) > 0)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (parsedTiers.length === 0) { toast('請設定至少一個投注檔次', 'error'); return }
    if (parsedTiers.length > 5)   { toast('投注檔次最多 5 個', 'error'); return }
    let parsedLayout: Record<string, unknown> | null = null
    if (layoutStr.trim()) {
      try { parsedLayout = JSON.parse(layoutStr) } catch { toast('機台版位 JSON 格式錯誤', 'error'); return }
    }
    setSaving(true)
    try {
      let finalImageUrl = form.image_url ?? null
      if (machineImageFile) {
        const uploadForm = new FormData()
        uploadForm.append('file', machineImageFile)
        uploadForm.append('bucket', 'products')
        uploadForm.append('path', `slot-machine-${id}-${Date.now()}.${machineImageFile.name.split('.').pop() || 'jpg'}`)
        const uploadRes  = await fetch('/api/admin/upload', { method: 'POST', body: uploadForm })
        const uploadJson = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) throw new Error(uploadJson?.error || '圖片上傳失敗')
        finalImageUrl = String(uploadJson?.publicUrl || '')
      }
      let finalSpriteUrl = form.machine_sprite_url ?? null
      if (spriteFile) {
        const uploadForm = new FormData()
        uploadForm.append('file', spriteFile)
        uploadForm.append('bucket', 'products')
        uploadForm.append('raw', '1')   // sprite 不壓縮，原圖直傳
        uploadForm.append('path', `slot-sprite-${id}-${Date.now()}.png`)
        const uploadRes  = await fetch('/api/admin/upload', { method: 'POST', body: uploadForm })
        const uploadJson = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) throw new Error(uploadJson?.error || '組圖上傳失敗')
        finalSpriteUrl = String(uploadJson?.publicUrl || '')
      }
      const res = await fetch(`/api/admin/slot/themes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bet_tiers: parsedTiers, spin_returns: FIXED_COIN_RETURNS, image_url: finalImageUrl, machine_sprite_url: finalSpriteUrl, machine_layout: parsedLayout }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('儲存成功')
      setTheme(data.theme)
      setMachineImageFile(null)
      setSpriteFile(null)
    } catch (e: any) {
      toast(e.message ?? '儲存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveVideos = async (updates: Record<string, string | null>) => {
    const res = await fetch(`/api/admin/slot/themes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    })
    if (res.ok) { toast('影片儲存成功'); fetchData() }
    else toast('儲存失敗', 'error')
  }

  const openAddPrize = () => {
    setSelectedPrize(null)
    setPrizeSearch('')
    setAddForm({ min_bet: tierFilter != null ? String(tierFilter) : '', remaining: '' })
    // 載入品項清單
    if (availablePrizes.length === 0) {
      fetch('/api/admin/slot/prizes')
        .then(r => r.json())
        .then(d => {
          // 去重（同名只取一筆）
          const seen = new Set<string>()
          const unique = (d.prizes ?? []).filter((p: SlotPrize) => {
            if (seen.has(p.name)) return false
            seen.add(p.name); return true
          })
          setAvailablePrizes(unique)
        })
    }
    setShowAddPrize(true)
  }

  const handleAddPrize = async () => {
    if (savingPrizeLock.current) return
    if (!selectedPrize) { toast('請選擇品項', 'error'); return }
    savingPrizeLock.current = true
    setSavingPrize(true)
    try {
      const payload = {
        slot_prize_id: selectedPrize.id,
        display_name:  selectedPrize.name,
        min_bet:       addForm.min_bet === '' ? null : parseInt(addForm.min_bet),
        remaining:     addForm.remaining === '' ? null : parseInt(addForm.remaining),
      }
      const res = await fetch(`/api/admin/slot/themes/${id}/pool`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error || '新增失敗')
      toast('獎品已加入所有機台')
      setShowAddPrize(false)
      fetchPoolItems()
    } catch (e: any) {
      toast(e.message ?? '新增失敗', 'error')
    } finally {
      savingPrizeLock.current = false
      setSavingPrize(false)
    }
  }

  const handleDeletePoolItem = async (item: PoolItem) => {
    if (!confirm('確定從所有機台移除此獎品？')) return
    const res = await fetch(
      `/api/admin/slot/themes/${id}/pool?pool_item_id=${item.id}`,
      { method: 'DELETE' }
    )
    if (res.ok) { toast('已從所有機台移除'); fetchPoolItems() }
    else toast('移除失敗', 'error')
  }

  const handleSaveRecycleValue = async () => {
    if (!editingRecycle) return
    const val = parseInt(editingRecycle.value)
    if (isNaN(val) || val < 0) { toast('請輸入有效數字', 'error'); return }
    const res = await fetch(`/api/admin/slot/themes/${id}/pool`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prize_name: editingRecycle.name, recycle_value: val }),
    })
    if (res.ok) {
      toast('回收幣值已更新')
      setEditingRecycle(null)
      fetchPoolItems()
    } else {
      toast('更新失敗', 'error')
    }
  }

  const handleAutoAssignLevels = async () => {
    // Group by tier, sort each group by recycle_value desc, then assign 一/二/三等獎 (10%/20%/70%)
    const tiers = [...new Set(poolItems.map(i => i.min_bet))]
    const assignments: { name: string; level: string }[] = []

    for (const tier of tiers) {
      const group = [...poolItems.filter(i => i.min_bet === tier)]
        .sort((a, b) => (b.slot_prizes?.recycle_value ?? 0) - (a.slot_prizes?.recycle_value ?? 0))
      const N = group.length
      const godCount    = Math.max(1, Math.round(N * 0.1))
      const strongCount = Math.max(1, Math.round(N * 0.2))
      group.forEach((item, idx) => {
        const name = item.slot_prizes?.name ?? item.display_name ?? ''
        if (!name) return
        const level = idx < godCount ? '一等獎' : idx < godCount + strongCount ? '二等獎' : '三等獎'
        assignments.push({ name, level })
      })
    }

    // Deduplicate by name
    const unique = new Map<string, string>()
    assignments.forEach(a => unique.set(a.name, a.level))

    await Promise.all([...unique.entries()].map(([prize_name, level]) =>
      fetch(`/api/admin/slot/themes/${id}/pool`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prize_name, level }),
      })
    ))
    toast('已自動分配賞等')
    fetchPoolItems()
  }

  const handleAddMachine = async () => {
    const res  = await fetch(`/api/admin/slot/themes/${id}/machines`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) { toast(`#${data.machine.machine_number} 已加入`); fetchData() }
    else toast(data.error ?? '新增失敗', 'error')
  }

  const handleRemoveMachine = async (machineId: number) => {
    if (!confirm('確定移除此機台？')) return
    const res = await fetch(`/api/admin/slot/themes/${id}/machines?machine_id=${machineId}`, { method: 'DELETE' })
    if (res.ok) { toast('已移除'); fetchData() }
    else toast('移除失敗', 'error')
  }

  const handleToggleMachine = async (machine: Machine) => {
    const res = await fetch(`/api/admin/slot/machines/${machine.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !machine.is_active }),
    })
    if (res.ok) {
      setMachines(prev => prev.map(m => m.id === machine.id ? { ...m, is_active: !m.is_active } : m))
      toast(machine.is_active ? '已下架' : '已上架')
    }
  }

  if (isLoading) return <AdminLayout pageTitle="主題設定"><div className="p-8 text-center text-neutral-400">載入中...</div></AdminLayout>
  if (!theme)    return <AdminLayout pageTitle="主題設定"><div className="p-8 text-center text-neutral-400">找不到主題</div></AdminLayout>

  const TABS = [
    { key: 'settings', label: '主題設定' },
    { key: 'prizes',   label: `RUSH獎池 (${prizes.length})` },
    { key: 'videos',   label: '特效影片' },
    { key: 'machines', label: `機台 (${machines.length})` },
  ] as const

  const tierOptions      = [...new Set(poolItems.map(p => p.min_bet))].sort((a, b) => (a ?? 0) - (b ?? 0))
  const filteredItems    = tierFilter == null ? poolItems : poolItems.filter(p => p.min_bet === tierFilter)

  const handlePoolSort = (field: string) => {
    if (field === poolSortField) setPoolSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setPoolSortField(field); setPoolSortDir('asc') }
  }

  const POOL_LEVEL_RANK: Record<string, number> = { '一等獎': 1, '二等獎': 2, '三等獎': 3 }
  const sortedItems = [...filteredItems].sort((a, b) => {
    const dir = poolSortDir === 'asc' ? 1 : -1
    switch (poolSortField) {
      case 'name':
        return dir * (a.slot_prizes?.name ?? a.display_name ?? '').localeCompare(b.slot_prizes?.name ?? b.display_name ?? '', 'zh-Hant')
      case 'level':
        return dir * ((POOL_LEVEL_RANK[a.slot_prizes?.level ?? ''] ?? 9) - (POOL_LEVEL_RANK[b.slot_prizes?.level ?? ''] ?? 9))
      case 'min_bet':
        return dir * ((a.min_bet ?? 0) - (b.min_bet ?? 0))
      case 'remaining':
        return dir * ((a.remaining ?? Number.MAX_SAFE_INTEGER) - (b.remaining ?? Number.MAX_SAFE_INTEGER))
      case 'recycle':
      default:
        return dir * ((a.slot_prizes?.recycle_value ?? 0) - (b.slot_prizes?.recycle_value ?? 0))
    }
  })
  const filteredPrizesSearch = availablePrizes.filter(p =>
    !prizeSearch || p.name.toLowerCase().includes(prizeSearch.toLowerCase())
  )

  return (
    <AdminLayout
      pageTitle={theme.name}
      breadcrumbs={[
        { label: '主題管理', href: '/slot' },
        { label: theme.name, href: `/slot/${id}` },
      ]}
    >
      <div className="space-y-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
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

        {/* Tabs */}
        <div className="border-b border-neutral-200 flex gap-0">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ Tab: 主題設定 ════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div className="space-y-4">

            {/* 基本資訊 */}
            <PageCard>
              <h3 className="font-semibold text-neutral-800 mb-4">基本資訊</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                  <Field label="主題名稱">
                    <input type="text" className={INPUT} value={form.name ?? ''}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  </Field>
                </div>
                <Field label="上架">
                  <div className="flex items-center gap-2 mt-2">
                    <Switch checked={form.is_active ?? false} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                    <span className="text-sm text-neutral-600">{form.is_active ? '上架中' : '已下架'}</span>
                  </div>
                </Field>
                <Field label="排序">
                  <input type="number" className={INPUT} value={form.sort_order ?? 0}
                    onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) }))} />
                </Field>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="廠商 ID">
                  <input type="number" className={INPUT} value={form.supplier_id ?? ''}
                    onChange={e => setForm(p => ({ ...p, supplier_id: parseInt(e.target.value) || null }))} />
                </Field>
                <Field label="活動頁連結（event_slug）">
                  <input type="text" className={INPUT} placeholder="例：1（→ /events/1）" value={form.event_slug ?? ''}
                    onChange={e => setForm(p => ({ ...p, event_slug: e.target.value || null }))} />
                </Field>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="機台圖片">
                  <input type="file" accept="image/*" onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setMachineImageFile(f); setMachineImagePreview(URL.createObjectURL(f)) }
                  }} className="w-full text-sm text-neutral-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200" />
                  {machineImagePreview && (
                    <div className="mt-2 w-14 h-14 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
                      <img src={machineImagePreview} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                </Field>
                <Field label="機台組圖（sprite，2048×1400 模板）">
                  <input type="file" accept="image/png" onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setSpriteFile(f); setSpritePreview(URL.createObjectURL(f)) }
                  }} className="w-full text-sm text-neutral-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200" />
                  {spritePreview ? (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="w-24 h-16 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-900">
                        <img src={spritePreview} alt="" className="w-full h-full object-contain" />
                      </div>
                      <button type="button"
                        onClick={() => { setSpriteFile(null); setSpritePreview(''); setForm(p => ({ ...p, machine_sprite_url: null })) }}
                        className="text-xs text-neutral-500 underline hover:text-red-500">
                        清除（改用預設）
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-neutral-400">未上傳，使用預設組圖</p>
                  )}
                </Field>
              </div>
              <div className="mt-4">
                <Field label="機台版位覆蓋（JSON，選填）">
                  <textarea rows={5} className={INPUT + ' font-mono text-xs'} value={layoutStr}
                    onChange={e => setLayoutStr(e.target.value)}
                    placeholder={'留空使用預設版位。範例：\n{"reels":{"t":39,"h":17,"cols":[{"l":19.5,"w":18.5},{"l":42},{"l":63.5}]},"marquee":{"t":16},"scoreboard":{"t":30}}'}
                  />
                  <p className="mt-1 text-xs text-neutral-400">
                    單位為機台寬高百分比。可覆蓋 marquee / scoreboard / reels / autoBtn / spinBtn / rushBtn，只填要調的欄位（l/t/w/h）
                  </p>
                </Field>
              </div>
              <div className="mt-4">
                <Field label="機台模組">
                  <div className="flex gap-3 mt-1">
                    {([
                      { value: 'video',   label: '影片帶入',  desc: '突入/連中/勝利影片演出' },
                      { value: 'classic', label: '純機台效果', desc: '滾輪動畫 + 蓋章 + 音效' },
                    ] as const).map(opt => (
                      <label key={opt.value}
                        className={`flex-1 flex items-start gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          (form.machine_type ?? 'video') === opt.value
                            ? 'border-primary bg-primary/5'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <input type="radio" name="machine_type" value={opt.value}
                          checked={(form.machine_type ?? 'video') === opt.value}
                          onChange={() => setForm(p => ({ ...p, machine_type: opt.value }))}
                          className="mt-0.5 accent-primary shrink-0"
                        />
                        <div>
                          <p className="text-sm font-semibold text-neutral-800">{opt.label}</p>
                          <p className="text-xs text-neutral-400 mt-0.5">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
            </PageCard>

            {/* 投注檔次 */}
            <PageCard>
              <h3 className="font-semibold text-neutral-800 mb-2">投注檔次</h3>
              <p className="text-xs text-neutral-400 mb-3">最多 5 個，以逗號分隔。決定玩家可選的 G 幣投注金額。</p>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <input type="text" className={INPUT + ' pr-12' + (parsedTiers.length > 5 ? ' border-red-400' : '')}
                    placeholder="100,300,500,1000,2000"
                    value={betTiersInput}
                    onChange={e => setBetTiersInput(e.target.value)}
                  />
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${parsedTiers.length > 5 ? 'text-red-500' : 'text-neutral-400'}`}>
                    {parsedTiers.length}/5
                  </span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {parsedTiers.slice(0, 5).map((t, i) => (
                    <span key={i} className="text-sm px-3 py-1 bg-amber-50 text-amber-700 font-bold rounded-full">
                      {t.coins.toLocaleString()} G
                    </span>
                  ))}
                </div>
              </div>
            </PageCard>

            {/* 遊戲機率設定 ─ 核心 */}
            <PageCard>
              <h3 className="font-semibold text-neutral-800 mb-1">RUSH 機率設定</h3>
              <p className="text-xs text-neutral-400 mb-5">每轉先判斷觸發率，未觸發時累積轉數；達保底轉數必定觸發，觸發後進度歸零。</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <Field label="觸發率（每轉）">
                  <div className="relative">
                    <input type="number" step={0.01} min={0.01} max={100} className={INPUT + ' pr-8'}
                      value={triggerRateStr}
                      onChange={e => setTriggerRateStr(e.target.value)}
                      onBlur={e => {
                        const v = parseFloat(e.target.value)
                        const val = isNaN(v) ? 0 : Math.min(100, Math.max(0, v))
                        setForm(prev => ({ ...prev, trigger_rate: val / 100 }))
                        setTriggerRateStr(val > 0 ? val.toFixed(2) : '')
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
                  </div>
                </Field>
                <Field label="保底轉數">
                  <input type="number" min={1} className={INPUT}
                    value={N > 0 ? N : ''}
                    onChange={e => setForm(prev => ({ ...prev, floor_spin_count: parseInt(e.target.value) }))}
                  />
                  {p > 0 && N > 0 && (() => {
                    const naturalMean = Math.round(1 / p)
                    const effectiveCap = Math.round(naturalMean * 3)
                    if (N > effectiveCap) {
                      return (
                        <p className="mt-1 text-xs text-red-500">
                          保底幾乎不觸發（自然均值 {naturalMean.toLocaleString()} 轉，建議 ≤ {effectiveCap.toLocaleString()}）
                        </p>
                      )
                    }
                    return null
                  })()}
                </Field>
                <Field label="RUSH 保底連數">
                  <input type="number" min={1} max={10} className={INPUT}
                    value={minHits > 0 ? minHits : ''}
                    onChange={e => setForm(prev => ({ ...prev, min_rush_hits: parseInt(e.target.value) }))}
                  />
                </Field>
                <Field label="RUSH 延續率">
                  <div className="relative">
                    <input type="number" step={0.01} min={0} max={99.99} className={INPUT + ' pr-8'}
                      value={continueRateStr}
                      onChange={e => setContinueRateStr(e.target.value)}
                      onBlur={e => {
                        const v = parseFloat(e.target.value)
                        const val = isNaN(v) ? 0 : Math.min(99.99, Math.max(0, v))
                        setForm(prev => ({ ...prev, continue_rate: val / 100 }))
                        setContinueRateStr(val > 0 ? val.toFixed(2) : '')
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
                  </div>
                </Field>
                <Field label="延續率遞減係數">
                  <div className="relative">
                    <input type="number" step={1} min={1} max={100} className={INPUT + ' pr-8'}
                      value={decayStr}
                      onChange={e => setDecayStr(e.target.value)}
                      onBlur={e => {
                        const v = parseFloat(e.target.value)
                        const val = isNaN(v) ? 50 : Math.min(100, Math.max(1, v))
                        setForm(prev => ({ ...prev, continue_rate_decay: val / 100 }))
                        setDecayStr(val.toFixed(0))
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    每延續一次，延續率 × 此係數（例：延續率 50%、係數 50% → 第二次延續判定為 25%）。100% = 不遞減
                  </p>
                </Field>
              </div>

              {/* 自動計算結果 */}
              {stats ? (
                <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-neutral-50 rounded-xl p-4 text-center">
                    <div className="text-xs text-neutral-500 mb-1">回報率（幣值返還）</div>
                    <div className={`font-black text-2xl ${rtpColor}`}>
                      {Math.max(0, stats.coinRtp * 100).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">不含 RUSH 實體獎品</div>
                  </div>
                  <div className="bg-neutral-50 rounded-xl p-4 text-center">
                    <div className="text-xs text-neutral-500 mb-1">平均觸發 RUSH 轉數</div>
                    <div className="font-black text-neutral-800 text-2xl">
                      {stats.eSpins < 1/p * 0.99 ? stats.eSpins.toFixed(1) : `≈${(1/p).toFixed(0)}`}
                      <span className="text-sm font-medium ml-1">轉</span>
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-xl p-4 text-center">
                    <div className="text-xs text-neutral-500 mb-1">平均 RUSH 連數</div>
                    <div className="font-black text-neutral-800 text-2xl">
                      {stats.eHits.toFixed(1)}
                      <span className="text-sm font-medium ml-1">連</span>
                    </div>
                  </div>
                </div>
                {/* 各檔次完整 RTP */}
                {tierRtpList.length > 0 && (
                  <div className="bg-neutral-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-neutral-500">各檔次完整 RTP（含 RUSH 獎品回收幣值）</p>
                      {!hasRecycleData && (
                        <span className="text-[10px] text-amber-600">⚠ 請至 RUSH獎池 tab 設定各品項的回收幣值</span>
                      )}
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(tierRtpList.length, 5)}, 1fr)` }}>
                      {tierRtpList.map(({ tier, totalRtp, prizeRtp, avgRecycle, prizeCount }) => {
                        const color = !prizeRtp ? 'text-neutral-400'
                          : totalRtp > 0.9 ? 'text-red-600'
                          : totalRtp > 0.7 ? 'text-amber-600'
                          : 'text-green-600'
                        return (
                          <div key={tier} className="bg-white rounded-lg p-3 text-center border border-neutral-100">
                            <div className="text-[10px] text-neutral-400 mb-1">{tier.toLocaleString()} G</div>
                            <div className={`font-black text-xl ${color}`}>
                              {prizeRtp ? `${(totalRtp * 100).toFixed(1)}%` : '—'}
                            </div>
                            {avgRecycle > 0 && (
                              <div className="text-[10px] text-neutral-400 mt-0.5">均獎 {avgRecycle.toFixed(0)} G</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                </>
              ) : (
                <div className="bg-neutral-50 rounded-xl p-4 text-sm text-neutral-400 text-center">
                  填入觸發率與連數後自動計算
                </div>
              )}
            </PageCard>
          </div>
        )}

        {/* ═══ Tab: RUSH獎池 ════════════════════════════════════════════════ */}
        {activeTab === 'prizes' && (
          <div className="space-y-4">
            <PageCard noPadding>
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-700">RUSH 獎池</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    顯示所有機台的實際獎池。<span className="font-medium text-amber-600">最低投注</span> = 玩家需投注 ≥ 此金額才可獲得。
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAutoAssignLevels} className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
                    ✦ 自動分配賞等
                  </button>
                  <button onClick={openAddPrize} className={BTN_PRIMARY}>+ 加入獎品</button>
                </div>
              </div>

              {/* 檔次篩選 */}
              <div className="px-4 py-2.5 border-b border-neutral-100 flex gap-2 flex-wrap">
                <button onClick={() => setTierFilter(null)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                    tierFilter == null ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}>
                  全部 ({poolItems.length})
                </button>
                {tierOptions.map(minBet => (
                  <button key={String(minBet)} onClick={() => setTierFilter(minBet)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      tierFilter === minBet ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}>
                    {minBet != null ? minBet.toLocaleString() : '全檔次'}&nbsp;
                    ({poolItems.filter(p => p.min_bet === minBet).length})
                  </button>
                ))}
              </div>

              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-400">
                  {poolItems.length === 0 ? '尚無獎品，點擊右上角從品項管理新增' : '此檔次無獎品'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 border-b border-neutral-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-neutral-500 whitespace-nowrap">圖片</th>
                        <SortableTableHeader sortKey="name" currentSortField={poolSortField} sortDirection={poolSortDir} onSort={handlePoolSort} className="px-4 py-2.5">名稱</SortableTableHeader>
                        <SortableTableHeader sortKey="level" currentSortField={poolSortField} sortDirection={poolSortDir} onSort={handlePoolSort} className="px-4 py-2.5">稀有度</SortableTableHeader>
                        <SortableTableHeader sortKey="min_bet" currentSortField={poolSortField} sortDirection={poolSortDir} onSort={handlePoolSort} className="px-4 py-2.5">最低投注</SortableTableHeader>
                        <SortableTableHeader sortKey="recycle" currentSortField={poolSortField} sortDirection={poolSortDir} onSort={handlePoolSort} className="px-4 py-2.5">回收幣值</SortableTableHeader>
                        <SortableTableHeader sortKey="remaining" currentSortField={poolSortField} sortDirection={poolSortDir} onSort={handlePoolSort} className="px-4 py-2.5">庫存（每台）</SortableTableHeader>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-neutral-500 whitespace-nowrap">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {sortedItems.map(item => {
                        const prizeName    = item.slot_prizes?.name ?? item.display_name ?? '—'
                        const prizeImg     = item.slot_prizes?.image_url ?? '/images/item.png'
                        const recycleVal   = item.slot_prizes?.recycle_value ?? 0
                        const isEditingThis = editingRecycle?.name === prizeName
                        return (
                          <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200">
                                <img src={prizeImg} alt="" className="w-full h-full object-cover" />
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium text-neutral-900">{prizeName}</td>
                            <td className="px-4 py-3">
                              {(() => {
                                const lv = item.slot_prizes?.level
                                if (lv === '一等獎') return <Badge color="amber">一等獎</Badge>
                                if (lv === '二等獎') return <Badge color="blue">二等獎</Badge>
                                if (lv === '三等獎') return <Badge color="gray">三等獎</Badge>
                                return <span className="text-xs text-neutral-300">—</span>
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              {item.min_bet != null
                                ? <Badge color="amber">{item.min_bet.toLocaleString()} G+</Badge>
                                : <span className="text-xs text-neutral-400">全檔次</span>}
                            </td>
                            <td className="px-4 py-3">
                              {isEditingThis ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number" min={0} autoFocus
                                    className="w-24 px-2 py-1 border border-primary rounded text-sm"
                                    value={editingRecycle!.value}
                                    onChange={e => setEditingRecycle({ name: prizeName, value: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveRecycleValue(); if (e.key === 'Escape') setEditingRecycle(null) }}
                                  />
                                  <button onClick={handleSaveRecycleValue} className="text-xs text-green-600 font-bold px-1">✓</button>
                                  <button onClick={() => setEditingRecycle(null)} className="text-xs text-neutral-400 px-1">✕</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditingRecycle({ name: prizeName, value: String(recycleVal) })}
                                  className="text-sm text-neutral-700 hover:text-primary font-mono"
                                >
                                  {recycleVal > 0 ? `${recycleVal.toLocaleString()} G` : <span className="text-neutral-300">— 點選設定</span>}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-neutral-600">
                              {item.remaining != null ? item.remaining : <span className="text-green-600 font-bold">∞</span>}
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => handleDeletePoolItem(item)} className="text-red-500 hover:text-red-700 text-sm font-medium">移除</button>
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

        {/* ═══ Tab: 特效影片 ════════════════════════════════════════════════ */}
        {activeTab === 'videos' && <VideoTab theme={theme} onSave={handleSaveVideos} />}

        {/* ═══ Tab: 機台 ═══════════════════════════════════════════════════ */}
        {activeTab === 'machines' && (
          <PageCard noPadding>
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
              <div>
                <h3 className="text-sm font-semibold text-neutral-700">機台列表</h3>
                <p className="text-xs text-neutral-400 mt-0.5">各台機器 RUSH 獎池庫存獨立計算</p>
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
                      {['編號', 'RUSH獎池', '普通返還', '上架', '前台', '操作'].map(h => (
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
                            <span className="text-base font-black text-neutral-700">#{machine.machine_number}</span>
                            <span className="ml-2 text-xs text-neutral-400">ID:{machine.id}</span>
                          </td>
                          <td className="px-4 py-3">
                            {rushCount > 0 ? <Badge color="purple">{rushCount} 件</Badge> : <span className="text-xs text-neutral-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {returnCount > 0 ? <Badge color="blue">{returnCount} 種</Badge> : <span className="text-xs text-neutral-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Switch checked={machine.is_active} onCheckedChange={() => handleToggleMachine(machine)} />
                          </td>
                          <td className="px-4 py-3">
                            <a href={`/challenge?machine=${machine.id}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline">預覽 ↗</a>
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
        )}
      </div>

      {/* ─── 加入獎品 Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={showAddPrize} onClose={() => setShowAddPrize(false)} title="加入 RUSH 獎品">
        <div className="space-y-4">
          {/* 品項搜尋選擇 */}
          <Field label="選擇品項">
            <input
              type="text"
              className={INPUT}
              placeholder="搜尋品項名稱..."
              value={prizeSearch}
              onChange={e => { setPrizeSearch(e.target.value); setSelectedPrize(null) }}
            />
            {prizeSearch && !selectedPrize && filteredPrizesSearch.length > 0 && (
              <div className="mt-1 border border-neutral-200 rounded-lg bg-white shadow-sm max-h-48 overflow-y-auto">
                {filteredPrizesSearch.slice(0, 20).map(p => (
                  <button key={p.id} type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-neutral-50 text-left"
                    onClick={() => { setSelectedPrize(p); setPrizeSearch(p.name) }}>
                    <img src={p.image_url ?? '/images/item.png'} alt="" className="w-8 h-8 rounded object-cover bg-neutral-100 flex-shrink-0" />
                    <span className="text-sm text-neutral-800">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedPrize && (
              <div className="mt-2 flex items-center gap-3 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                <img src={selectedPrize.image_url ?? '/images/item.png'} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-neutral-800">{selectedPrize.name}</div>
                </div>
                <button type="button" onClick={() => { setSelectedPrize(null); setPrizeSearch('') }}
                  className="text-xs text-neutral-400 hover:text-neutral-600">✕</button>
              </div>
            )}
            {prizeSearch && !selectedPrize && filteredPrizesSearch.length === 0 && (
              <p className="mt-1 text-xs text-neutral-400 px-1">找不到相符品項</p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="投注檔次">
              <select className={INPUT} value={addForm.min_bet}
                onChange={e => setAddForm(p => ({ ...p, min_bet: e.target.value }))}>
                <option value="">全檔次皆可</option>
                {parsedTiers.map(t => (
                  <option key={t.coins} value={String(t.coins)}>{t.coins.toLocaleString()} G 以上</option>
                ))}
              </select>
            </Field>
            <Field label="每台庫存">
              <input type="number" className={INPUT} min={0}
                value={addForm.remaining}
                onChange={e => setAddForm(p => ({ ...p, remaining: e.target.value }))}
                placeholder="空白 = 不限" />
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowAddPrize(false)} className={BTN_GHOST}>取消</button>
            <button onClick={handleAddPrize} disabled={savingPrize || !selectedPrize} className={BTN_PRIMARY}>
              {savingPrize ? '新增中...' : '加入'}
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

function VideoTab({ theme, onSave }: { theme: SlotTheme; onSave: (u: Record<string, string | null>) => void }) {
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
      const res  = await fetch('/api/admin/upload', { method: 'POST', body: uploadForm })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '上傳失敗')
      setVideos(prev => ({ ...prev, [key]: String(json?.publicUrl || '') }))
      toast(`上傳成功`)
    } catch (e: any) { toast(e.message ?? '上傳失敗', 'error') }
    finally { setUploading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {VIDEO_SLOTS.map(slot => {
          const url = videos[slot.key]
          const isUploading = uploading === slot.key
          return (
            <PageCard key={slot.key}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  slot.key.includes('entry') ? 'bg-purple-100 text-purple-700' :
                  slot.key.includes('god') ? 'bg-red-100 text-red-700' :
                  slot.key.includes('strong') ? 'bg-amber-100 text-amber-700' :
                  slot.key.includes('revival') ? 'bg-green-100 text-green-700' :
                  slot.key.includes('anticipation') ? 'bg-neutral-100 text-neutral-600' :
                  'bg-blue-100 text-blue-700'
                }`}>{slot.badge}</span>
                <span className="text-sm font-semibold text-neutral-700">{slot.label}</span>
              </div>
              <p className="text-xs text-neutral-400 mb-3">{slot.desc}</p>
              {url ? (
                <div className="mb-3">
                  <video src={url} className="w-full rounded-lg bg-black aspect-video object-contain" controls muted playsInline />
                  <button onClick={() => setVideos(prev => ({ ...prev, [slot.key]: null }))}
                    className="mt-1 text-xs text-red-500 hover:text-red-700">移除</button>
                </div>
              ) : (
                <div className="aspect-video bg-neutral-100 rounded-lg flex items-center justify-center mb-3 border-2 border-dashed border-neutral-200">
                  <span className="text-xs text-neutral-400">{isUploading ? '上傳中...' : '尚未設定'}</span>
                </div>
              )}
              <label className="block">
                <span className="block w-full text-center px-3 py-2 text-xs text-primary border border-primary rounded-lg hover:bg-primary/5 cursor-pointer transition-colors">
                  {isUploading ? '上傳中...' : url ? '重新上傳' : '上傳影片'}
                </span>
                <input type="file" accept="video/*" className="hidden" disabled={!!uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(slot.key, f) }} />
              </label>
            </PageCard>
          )
        })}
      </div>
      <div className="flex justify-end">
        <button onClick={async () => { setSaving(true); await onSave(videos); setSaving(false) }}
          disabled={saving} className={BTN_PRIMARY}>
          {saving ? '儲存中...' : '儲存影片設定'}
        </button>
      </div>
    </div>
  )
}
