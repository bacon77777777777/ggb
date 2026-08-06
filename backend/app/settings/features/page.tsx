'use client'

import { AdminLayout, PageCard, Switch } from '@/components'
import { useEffect, useMemo, useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'

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
        payment: [{ key: 'recharge' as const, label: '儲值充值' }],
        other: [
          { key: 'sell' as const, label: '販售' },
          { key: 'ichiban' as const, label: '一番賞' },
          { key: 'blindbox' as const, label: '盒玩' },
          { key: 'gacha' as const, label: '轉蛋' },
          { key: 'card' as const, label: '抽卡' },
          { key: 'custom' as const, label: '自製賞' },
        ],
        sellPayment: [{ key: 'sell_escrow' as const, label: '販售金流（平台代收）' }],
        exchangeMarket: [
          { key: 'exchange' as const, label: '交換' },
          { key: 'market' as const, label: '交易所' },
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

  return (
    <AdminLayout pageTitle="功能開關">
      <PageCard>
        {/* ── 維護模式 ── */}
        <div className="mb-5 rounded-2xl border-2 border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[13px] font-black text-neutral-900">維護模式</div>
              <div className="text-[11px] text-neutral-500">
                前台維護時玩家會被帶到維護頁；停在頁面上的人最多 30 秒內也會被帶走
              </div>
            </div>
            {maint && maint.scope !== 'off' && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-800">
                維護中
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {([
              { v: 'off',      label: '正常營運',   hint: '兩邊都開放' },
              { v: 'frontend', label: '只關前台',   hint: '玩家看維護頁，後台照常（最常用）' },
              { v: 'backend',  label: '只關後台',   hint: '前台照常，後台管理員擋在外面' },
              { v: 'all',      label: '前後台都關', hint: '全站停機' },
            ] as const).map(o => {
              const active = (maint?.scope ?? 'off') === o.v
              return (
                <button
                  key={o.v}
                  type="button"
                  disabled={!maint || maintSaving}
                  onClick={() => saveMaint({ scope: o.v, message: maint?.message ?? '', until: maint?.until ?? '' })}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                    active
                      ? o.v === 'off'
                        ? 'border-primary bg-primary/5'
                        : 'border-amber-400 bg-amber-50'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="text-[13px] font-bold text-neutral-900">{o.label}</div>
                  <div className="text-[11px] text-neutral-500">{o.hint}</div>
                </button>
              )
            })}
          </div>

          {maint && maint.scope !== 'off' && (
            <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
              <div>
                <label className="mb-1 block text-[11px] font-black text-neutral-500">玩家看到的訊息</label>
                <Textarea
                  rows={2}
                  value={maint.message}
                  onChange={e => setMaint({ ...maint, message: e.target.value })}
                  onBlur={() => saveMaint({ scope: maint.scope, message: maint.message, until: maint.until })}
                  placeholder="系統維護中，我們正在做一些調整，很快就回來。"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black text-neutral-500">預計恢復時間（選填）</label>
                <Input
                  type="datetime-local"
                  value={maint.until ? maint.until.slice(0, 16) : ''}
                  onChange={e => setMaint({ ...maint, until: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  onBlur={() => saveMaint({ scope: maint.scope, message: maint.message, until: maint.until })}
                />
              </div>
              <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <div className="text-[11px] font-black text-neutral-500">自己要進去驗證的連結</div>
                <code className="mt-1 block break-all text-[11px] text-neutral-700">
                  {`https://www.ggb.com.tw/?__mk=${maint.bypassKey}`}
                </code>
                <div className="mt-1 text-[10px] text-neutral-400">
                  開一次就種 8 小時的通行 cookie。每次重新啟動維護都會換一把新的，舊連結會失效。
                </div>
              </div>
            </div>
          )}
        </div>

        {loadError && (
          <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm font-bold text-neutral-700">
            讀取功能開關失敗，請重新整理（若仍失敗可能是登入狀態過期）
          </div>
        )}
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[12px] font-black text-neutral-500">金流</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.payment.map((item) => {
                const ready = Boolean(flags) && !isLoading
                const on = ready ? Boolean((flags as Record<FeatureKey, boolean>)[item.key]) : true
                return (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                      ready && !on ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-neutral-900 truncate">{item.label}</div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {ready && !on ? '已關閉：綠界建單會被拒絕，儲值頁顯示維護中' : '關閉會斷開綠界，已購代幣不受影響'}
                      </div>
                    </div>
                    <Switch
                      checked={on}
                      disabled={!ready || isSaving}
                      onCheckedChange={(checked) => {
                        if (!flags) return
                        const next = { ...flags, [item.key]: checked }
                        setFlags(next)
                        save(next)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-black text-neutral-500">其他</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.other.map((item) => {
                const ready = Boolean(flags) && !isLoading
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-neutral-900 truncate">{item.label}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={ready ? Boolean((flags as Record<FeatureKey, boolean>)[item.key]) : false}
                        disabled={!ready || isSaving}
                        onCheckedChange={(checked) => {
                          if (!flags) return
                          const next = { ...flags, [item.key]: checked }
                          setFlags(next)
                          save(next)
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-black text-neutral-500">販售金流</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.sellPayment.map((item) => {
                const ready = Boolean(flags) && !isLoading
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-neutral-900 truncate">{item.label}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={ready ? Boolean((flags as Record<FeatureKey, boolean>)[item.key]) : false}
                        disabled={!ready || isSaving}
                        onCheckedChange={(checked) => {
                          if (!flags) return
                          const next = { ...flags, [item.key]: checked }
                          if (checked) next.sell = true
                          setFlags(next)
                          save(next)
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-black text-neutral-500">交換 / 交易所</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.exchangeMarket.map((item) => {
                const ready = Boolean(flags) && !isLoading
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-neutral-900 truncate">{item.label}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={ready ? Boolean((flags as Record<FeatureKey, boolean>)[item.key]) : false}
                        disabled={!ready || isSaving}
                        onCheckedChange={(checked) => {
                          if (!flags) return
                          const next = { ...flags, [item.key]: checked }
                          if (item.key === 'exchange' && checked) next.market = false
                          if (item.key === 'market' && checked) next.exchange = false
                          if (next.exchange && next.market) next.market = false
                          setFlags(next)
                          save(next)
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>


          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-black text-neutral-500">GB哥推播</div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-neutral-400">總開關</span>
                <Switch
                  checked={!isPushLoading && LINE_PUSH_ITEMS.every(item => pushFlags[item.key])}
                  disabled={isPushLoading || isPushSaving}
                  onCheckedChange={(checked) => saveAllPushFlags(checked)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {LINE_PUSH_ITEMS.map((item) => {
                const ready = !isPushLoading
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-neutral-900 truncate">{item.label}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={ready ? pushFlags[item.key] : false}
                        disabled={!ready || isPushSaving}
                        onCheckedChange={(checked) => {
                          savePushFlag(item.key, checked)
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </PageCard>
    </AdminLayout>
  )
}
