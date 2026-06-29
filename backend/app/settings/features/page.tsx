'use client'

import { AdminLayout, PageCard, Switch } from '@/components'
import { useEffect, useMemo, useState } from 'react'

type FeatureKey = 'sell' | 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom' | 'exchange' | 'market' | 'sell_escrow'

const DEFAULT_FLAGS: Record<FeatureKey, boolean> = {
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

  const items = useMemo(
    () =>
      ({
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

  useEffect(() => {
    const init = async () => {
      try {
        await fetch('/api/admin/feature-flags', { method: 'POST', credentials: 'include' })
      } catch {
        void 0
      }
      load()
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
    <AdminLayout pageTitle="功能開關" pageSubtitle="控制前台是否顯示各功能入口">
      <PageCard>
        {loadError && (
          <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm font-bold text-neutral-700">
            讀取功能開關失敗，請重新整理（若仍失敗可能是登入狀態過期）
          </div>
        )}
        <div className="space-y-4">
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
        </div>
      </PageCard>
    </AdminLayout>
  )
}
