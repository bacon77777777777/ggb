'use client'

import { AdminLayout, PageCard, Switch } from '@/components'
import { useEffect, useMemo, useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import { useAdmin } from '@/contexts/AdminContext'
import ConfirmDialog from '@/components/ConfirmDialog'

type FeatureKey = 'sell' | 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom' | 'exchange' | 'market' | 'sell_escrow' | 'recharge'

type LinePushKey =
  | 'line_push_daily' | 'line_push_cfo' | 'line_push_cmo' | 'line_push_supply'
  | 'line_push_health' | 'line_push_market' | 'line_push_risk' | 'line_push_monitor'
  | 'line_push_finance' | 'line_push_deliver' | 'line_push_dormant' | 'line_push_recharge'
  | 'line_push_content' | 'line_push_cto'

const LINE_PUSH_ITEMS: { key: LinePushKey; label: string }[] = [
  { key: 'line_push_daily',    label: '每日早報' },
  { key: 'line_push_cfo',      label: 'CFO 財務對帳' },
  { key: 'line_push_cmo',      label: 'CMO 行銷日報' },
  { key: 'line_push_supply',   label: '供應鏈警示' },
  { key: 'line_push_health',   label: '健康監測' },
  { key: 'line_push_market',   label: '市場 / 競品情報' },
  { key: 'line_push_risk',     label: '風控掃描' },
  { key: 'line_push_monitor',  label: '平台監測' },
  { key: 'line_push_finance',  label: '對帳 / 月結' },
  { key: 'line_push_deliver',  label: '自動出貨通知' },
  { key: 'line_push_dormant',  label: '沉睡客喚回' },
  { key: 'line_push_recharge', label: '待審核儲值' },
  { key: 'line_push_content',  label: 'AI 文案生成' },
  { key: 'line_push_cto',      label: 'AI CTO 報告' },
]

const DEFAULT_PUSH_FLAGS = LINE_PUSH_ITEMS.reduce((acc, { key }) => {
  acc[key] = true
  return acc
}, {} as Record<LinePushKey, boolean>)

const DEFAULT_FLAGS: Record<FeatureKey, boolean> = {
  // 儲值預設開啟。關掉會直接斷開綠界建單（見 /api/payment/ecpay），
  // 玩家在儲值頁看到「儲值維護中」。已購買的代幣、抽獎與出貨都不受影響
  recharge: true,
  sell: true,
  ichiban: true,
  blindbox: true,
  gacha: true,
  card: true,
  custom: true,
  exchange: true,
  market: false,
  sell_escrow: false,
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<Record<FeatureKey, boolean> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const [pushFlags, setPushFlags] = useState<Record<LinePushKey, boolean>>(DEFAULT_PUSH_FLAGS)

  // 維護模式。前台與後台分開，因為維護的原因通常只影響一邊：
  // 改前台版面不必把後台鎖起來，而後台在改資料時前台反而更需要正常運作
  const [maint, setMaint] = useState<{ scope: string; message: string; until: string; bypassKey: string } | null>(null)
  const [maintSaving, setMaintSaving] = useState(false)
  // 切換維護前先確認 —— 這個動作會把所有人擋在外面，不該一鍵就生效
  const [pendingScope, setPendingScope] = useState<string | null>(null)
  const { user: adminUser } = useAdmin()
  const isSuperAdmin = adminUser?.role === 'super_admin' || adminUser?.role === 'superadmin'

  const ready = Boolean(flags) && !isLoading

  const toggleFlag = (key: FeatureKey, checked: boolean) => {
    if (!flags) return
    const next = { ...flags, [key]: checked }
    setFlags(next)
    save(next)
  }

  // 已經是這個狀態就不用問；點自己不該有反應
  const requestScope = (v: string) => {
    if ((maint?.scope ?? 'off') === v) return
    setPendingScope(v)
  }

  const saveMaint = async (next: { scope: string; message: string; until: string }) => {
    setMaintSaving(true)
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(next),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '儲存失敗')
      setMaint(m => (m ? { ...m, ...next, bypassKey: json.bypassKey ?? m.bypassKey } : m))
    } catch {
      // 讀回真實狀態，不要讓畫面停在使用者以為成功的樣子
      fetch('/api/admin/maintenance', { credentials: 'include' })
        .then(r => r.json()).then(setMaint).catch(() => {})
    } finally {
      setMaintSaving(false)
    }
  }
  const [isPushLoading, setIsPushLoading] = useState(true)
  const [isPushSaving, setIsPushSaving] = useState(false)

  const items = useMemo(
    () =>
      ({
        // 群組依「玩家看到什麼」分，不是依實作分。
        // 原本金流拆成兩組（儲值 / 販售金流）各只有一項，畫面上就是兩排孤零零的卡片
        payment: [
          { key: 'recharge' as const,     label: '儲值充值', hint: '關閉會斷開綠界，已購代幣不受影響' },
          { key: 'sell_escrow' as const,  label: '販售金流', hint: '平台代收買家貨款' },
        ],
        play: [
          { key: 'ichiban' as const,  label: '一番賞',  hint: '' },
          { key: 'blindbox' as const, label: '盒玩',    hint: '' },
          { key: 'gacha' as const,    label: '轉蛋',    hint: '' },
          { key: 'card' as const,     label: '抽卡',    hint: '' },
          { key: 'custom' as const,   label: '自製賞',  hint: '' },
          { key: 'sell' as const,     label: '販售',    hint: '玩家之間的二手販售' },
        ],
        exchangeMarket: [
          { key: 'exchange' as const, label: '交換',   hint: '卡牌一對一交換' },
          { key: 'market' as const,   label: '交易所', hint: '' },
        ],
      }) as const,
    []
  )

  const load = async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      fetch('/api/admin/maintenance', { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).then(d => { if (d) setMaint(d) }).catch(() => {})

      const res = await fetch('/api/admin/feature-flags', { method: 'GET', credentials: 'include', cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) throw new Error('load_failed')
      const json = (await res.json().catch(() => null)) as any
      const next = { ...DEFAULT_FLAGS }
      const incoming = json?.flags || {}
      for (const k of Object.keys(next) as FeatureKey[]) {
        if (k in incoming) next[k] = Boolean(incoming[k])
      }
      if (next.exchange && next.market) next.market = false
      setFlags(next)
    } catch {
      setLoadError(true)
      setFlags(null)
    } finally {
      setIsLoading(false)
    }
  }

  const loadPushFlags = async () => {
    setIsPushLoading(true)
    try {
      const res = await fetch('/api/admin/line-push-flags', { method: 'GET', credentials: 'include', cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json().catch(() => null)) as any
      const incoming = json?.flags || {}
      const next = { ...DEFAULT_PUSH_FLAGS }
      for (const k of Object.keys(next) as LinePushKey[]) {
        if (k in incoming) next[k] = Boolean(incoming[k])
      }
      setPushFlags(next)
    } catch {
      void 0
    } finally {
      setIsPushLoading(false)
    }
  }

  const saveAllPushFlags = async (value: boolean) => {
    setIsPushSaving(true)
    const allFlags = Object.fromEntries(
      LINE_PUSH_ITEMS.map(item => [item.key, value])
    ) as Record<LinePushKey, boolean>
    setPushFlags(prev => ({ ...prev, ...allFlags }))
    try {
      const res = await fetch('/api/admin/line-push-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ flags: allFlags }),
      })
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as any
        const incoming = json?.flags || {}
        const normalized = { ...DEFAULT_PUSH_FLAGS }
        for (const k of Object.keys(normalized) as LinePushKey[]) {
          if (k in incoming) normalized[k] = Boolean(incoming[k])
        }
        setPushFlags(normalized)
      }
    } finally {
      setIsPushSaving(false)
    }
  }

  /**
   * 批次儲存推播開關。
   * 總開關一次要改十四項，逐項呼叫 savePushFlag 會送出十四個請求，
   * 而且每個都會 setState，互相覆蓋。API 本來就吃多筆，一次送完。
   */
  const savePush = async (next: Record<LinePushKey, boolean>) => {
    setIsPushSaving(true)
    try {
      await fetch('/api/admin/line-push-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ flags: next }),
      })
    } finally {
      setIsPushSaving(false)
    }
  }

  const savePushFlag = async (key: LinePushKey, value: boolean) => {
    setIsPushSaving(true)
    const next = { ...pushFlags, [key]: value }
    setPushFlags(next)
    try {
      const res = await fetch('/api/admin/line-push-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ flags: { [key]: value } }),
      })
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as any
        const incoming = json?.flags || {}
        const normalized = { ...DEFAULT_PUSH_FLAGS }
        for (const k of Object.keys(normalized) as LinePushKey[]) {
          if (k in incoming) normalized[k] = Boolean(incoming[k])
        }
        setPushFlags(normalized)
      }
    } catch {
      void 0
    } finally {
      setIsPushSaving(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        await fetch('/api/admin/feature-flags', { method: 'POST', credentials: 'include' })
      } catch {
        void 0
      }
      load()
      loadPushFlags()
    }
    init()
  }, [])

  const save = async (next: Record<FeatureKey, boolean>) => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ flags: next }),
      })
      if (!res.ok) throw new Error('save_failed')
      const json = (await res.json().catch(() => null)) as any
      const incoming = json?.flags || next
      const normalized = { ...DEFAULT_FLAGS }
      for (const k of Object.keys(normalized) as FeatureKey[]) {
        if (k in incoming) normalized[k] = Boolean(incoming[k])
      }
      if (normalized.exchange && normalized.market) normalized.market = false
      setFlags(normalized)
    } catch {
      setFlags(next)
    } finally {
      setIsSaving(false)
    }
  }


const MAINT_OPTIONS = [
  { v: 'off',      label: '正常營運',   hint: '兩邊都開放',                         adminOnly: false },
  { v: 'frontend', label: '只關前台',   hint: '玩家看維護頁，後台照常（最常用）',   adminOnly: false },
  { v: 'backend',  label: '只關後台',   hint: '前台照常，一般管理員擋在外面',       adminOnly: true  },
  { v: 'all',      label: '前後台都關', hint: '全站停機',                           adminOnly: true  },
] as const

  return (
    <AdminLayout pageTitle="功能開關">
      {/* 維護模式獨立一張卡：它是「營運狀態」不是「功能開關」，
          而且原本擠在同一張卡裡會變成容器包容器 */}
      <PageCard>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-neutral-900">維護模式</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              前台維護時玩家會被帶到維護頁；停在頁面上的人最多 30 秒內也會被帶走。
            </p>
          </div>
          {maint && maint.scope !== 'off' && (
            <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
              維護中
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MAINT_OPTIONS.map(o => {
            const active = (maint?.scope ?? 'off') === o.v
            const blocked = o.adminOnly && !isSuperAdmin
            return (
              <button
                key={o.v}
                type="button"
                disabled={!maint || maintSaving || blocked}
                onClick={() => requestScope(o.v)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? o.v === 'off'
                      ? 'border-primary bg-primary/5'
                      : 'border-amber-400 bg-amber-50'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="text-sm font-bold text-neutral-900">{o.label}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {blocked ? '僅超級管理員可用' : o.hint}
                </div>
              </button>
            )
          })}
        </div>

        {maint && maint.scope !== 'off' && (
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
            <div>
              <label className="mb-1 block text-xs font-black text-neutral-500">玩家看到的訊息</label>
              <Textarea
                rows={2}
                value={maint.message}
                onChange={e => setMaint({ ...maint, message: e.target.value })}
                onBlur={() => saveMaint({ scope: maint.scope, message: maint.message, until: maint.until })}
                placeholder="系統維護中，我們正在做一些調整，很快就回來。"
              />
            </div>
            <div className="max-w-xs">
              <label className="mb-1 block text-xs font-black text-neutral-500">預計恢復時間（選填）</label>
              <Input
                type="datetime-local"
                value={maint.until ? maint.until.slice(0, 16) : ''}
                onChange={e => setMaint({ ...maint, until: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                onBlur={() => saveMaint({ scope: maint.scope, message: maint.message, until: maint.until })}
              />
            </div>
            <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
              <div className="text-xs font-black text-neutral-500">維護期間自己要進去驗證的連結</div>
              <code className="mt-1 block break-all font-mono text-xs text-neutral-700">
                {`https://www.ggb.com.tw/?__mk=${maint.bypassKey}`}
              </code>
              <div className="mt-1 text-[11px] text-neutral-400">
                開一次就種 8 小時的通行 cookie。每次重新啟動維護都會換一把新的，舊連結失效。
              </div>
            </div>
          </div>
        )}
      </PageCard>

      <PageCard>
        {loadError && (
          <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm font-bold text-neutral-700">
            讀取功能開關失敗，請重新整理（若仍失敗可能是登入狀態過期）
          </div>
        )}

        <div className="space-y-6">
          <FlagSection title="金流"        items={items.payment}        flags={flags} ready={ready} saving={isSaving} onToggle={toggleFlag} />
          <FlagSection title="玩法"        items={items.play}           flags={flags} ready={ready} saving={isSaving} onToggle={toggleFlag} />
          <FlagSection title="交換 / 交易所" items={items.exchangeMarket} flags={flags} ready={ready} saving={isSaving} onToggle={toggleFlag} />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black text-neutral-500">GB哥推播</h2>
              <label className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-400">總開關</span>
                <Switch
                  checked={Object.values(pushFlags).some(Boolean)}
                  disabled={isPushLoading || isPushSaving}
                  onCheckedChange={(checked) => {
                    const next = LINE_PUSH_ITEMS.reduce((acc, { key }) => {
                      acc[key] = checked
                      return acc
                    }, {} as Record<LinePushKey, boolean>)
                    setPushFlags(next)
                    savePush(next)
                  }}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {LINE_PUSH_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                  <div className="min-w-0 text-[13px] font-bold text-neutral-900 truncate">{item.label}</div>
                  <Switch
                    checked={pushFlags[item.key]}
                    disabled={isPushLoading || isPushSaving}
                    onCheckedChange={(checked) => {
                      const next = { ...pushFlags, [item.key]: checked }
                      setPushFlags(next)
                      savePush(next)
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageCard>

      <ConfirmDialog
        isOpen={pendingScope !== null}
        onClose={() => setPendingScope(null)}
        onConfirm={() => { if (pendingScope) saveMaint({ scope: pendingScope, message: maint?.message ?? '', until: maint?.until ?? '' }); setPendingScope(null) }}
        title={pendingScope === 'off' ? '解除維護模式？' : '啟動維護模式？'}
        message={
          pendingScope === 'off'
            ? '解除後前台與後台立即恢復正常，最多 30 秒內全站生效。'
            : pendingScope === 'frontend'
              ? '所有玩家會被帶到維護頁，正在瀏覽的人最多 30 秒內也會被帶走。後台照常運作。'
              : pendingScope === 'backend'
                ? '超級管理員以外的管理員會被擋在後台外面。前台照常運作。'
                : '前台玩家與後台一般管理員都會被擋下來。只有超級管理員進得去。'
        }
        confirmText={pendingScope === 'off' ? '解除維護' : '啟動維護'}
        type={pendingScope === 'off' ? 'info' : 'warning'}
      />
    </AdminLayout>
  )
}

/** 一組功能開關。四個群組原本各自複製一份一模一樣的卡片標記，抽出來才統一得了樣式 */
function FlagSection({ title, items, flags, ready, saving, onToggle }: {
  title: string
  items: readonly { key: FeatureKey; label: string; hint?: string }[]
  flags: Record<FeatureKey, boolean> | null
  ready: boolean
  saving: boolean
  onToggle: (key: FeatureKey, checked: boolean) => void
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-black text-neutral-500">{title}</h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {items.map(item => {
          const on = ready && flags ? Boolean(flags[item.key]) : false
          return (
            <div
              key={item.key}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                ready && !on && item.key === 'recharge'
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-neutral-200 bg-white'
              }`}
            >
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-neutral-900 truncate">{item.label}</div>
                {item.hint && <div className="text-[11px] text-neutral-500 truncate">{item.hint}</div>}
              </div>
              <Switch
                checked={on}
                disabled={!ready || saving}
                onCheckedChange={(checked) => onToggle(item.key, checked)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
