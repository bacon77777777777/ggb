'use client'

/**
 * 回收價格設定
 *
 * 老闆 2026-08-25「回收機制大改版」：
 *   - 品項編輯裡的回收價欄位整個移除，改成在這裡統一設定
 *   - 基準一律是「商品單抽價」。不逐品項填實物價值 —— 沒人力，而且
 *     product_prizes.recycle_value 這個欄位早就存在卻是 1,778 個品項零填寫
 *   - 轉蛋、盒玩各一個 %；一番賞／抽卡／自製賞各有大賞 % 與一般賞 %
 *   - 大賞由系統自動判定（品項初始總數 ≤ 3），不需要人工指定
 *
 * 結算那一段是老闆特別要的：「不跟廠商收回收價，但差額平台全部賺取」。
 * 用他的例子 —— 轉蛋單抽 100G、玩家回收拿 15G，差額就是 85G，這 85 要不要分給廠商可設定。
 */

import { useState, useEffect, useMemo } from 'react'
import { AdminLayout, PageCard } from '@/components'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/contexts/ToastContext'

interface Rate {
  product_type: string
  tier: 'all' | 'major' | 'normal'
  rate_percent: number
  min_value: number
}

/** 每個類型的顯示名稱、賞等結構，與拿來試算的參考單價 */
const TYPE_META: Record<string, { label: string; tiers: Rate['tier'][]; sample: number; note: string }> = {
  gacha:    { label: '轉蛋',   tiers: ['all'],               sample: 179, note: '回收後庫存加回原商品，可再賣一次全價' },
  blindbox: { label: '盒玩',   tiers: ['all'],               sample: 355, note: '回收後庫存加回原商品，可再賣一次全價' },
  ichiban:  { label: '一番賞', tiers: ['major', 'normal'],   sample: 309, note: '序列商品，庫存不加回，實體留在廠商倉庫' },
  card:     { label: '抽卡',   tiers: ['major', 'normal'],   sample: 204, note: '序列商品，庫存不加回，實體留在廠商倉庫' },
  custom:   { label: '自製賞', tiers: ['major', 'normal'],   sample: 199, note: '序列商品，庫存不加回，實體留在廠商倉庫' },
}

const TIER_LABEL: Record<Rate['tier'], string> = {
  all:    '回收比例',
  major:  '大賞比例',
  normal: '一般賞比例',
}

const key = (t: string, tier: string) => `${t}:${tier}`

export default function RecycleRatesPage() {
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/recycle-rates')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '載入失敗')
      setRates((json.rates ?? []).map((r: any) => ({
        product_type: r.product_type,
        tier: r.tier,
        rate_percent: Number(r.rate_percent),
        min_value: Number(r.min_value),
      })))
    } catch (err: any) {
      toast(err?.message ?? '載入失敗', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const rateMap = useMemo(() => {
    const m = new Map<string, Rate>()
    rates.forEach(r => m.set(key(r.product_type, r.tier), r))
    return m
  }, [rates])

  const setRate = (t: string, tier: string, field: 'rate_percent' | 'min_value', raw: string) => {
    const v = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(v)) return
    setRates(prev => prev.map(r =>
      r.product_type === t && r.tier === tier ? { ...r, [field]: v } : r,
    ))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/recycle-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '儲存失敗')
      toast('回收價格設定已更新')
      await load()
    } catch (err: any) {
      toast(err?.message ?? '儲存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  /** 用參考單價即時試算，避免只看百分比抓不到實際手感 */
  const preview = (t: string, tier: Rate['tier']) => {
    const r = rateMap.get(key(t, tier))
    const meta = TYPE_META[t]
    if (!r || !meta) return null
    const value = Math.max(r.min_value, Math.floor((meta.sample * r.rate_percent) / 100))
    const perDraw = value > 0 ? Math.ceil(meta.sample / value) : 0
    return { value, perDraw }
  }

  return (
    <AdminLayout pageTitle="回收價格設定">
      <div className="space-y-6">

        <PageCard>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-neutral-900">回收比例</h2>
            <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
              基準是<span className="font-medium text-neutral-700">商品單抽價</span>。
              玩家回收一件品項可換回的代幣 ＝ 單抽價 × 比例（不足下限時給下限）。
              <br />
              一番賞、抽卡、自製賞的<span className="font-medium text-neutral-700">大賞由系統自動判定</span>
              （品項初始總數 ≤ 3），不需要人工指定；轉蛋與盒玩不分賞等。
            </p>
          </div>

          {loading ? (
            <CardSkeleton rows={6} />
          ) : (
            <div className="space-y-3">
              {Object.entries(TYPE_META).map(([type, meta]) => (
                <div key={type} className="border border-neutral-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-semibold text-neutral-900">{meta.label}</span>
                    <span className="text-xs text-neutral-400">{meta.note}</span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {meta.tiers.map(tier => {
                      const r = rateMap.get(key(type, tier))
                      const p = preview(type, tier)
                      return (
                        <div key={tier} className="space-y-1.5">
                          <label className="block text-xs font-medium text-neutral-500">
                            {TIER_LABEL[tier]}
                            {tier === 'major' && <span className="text-neutral-400">（總數 ≤ 3）</span>}
                          </label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step="0.5"
                                value={r ? String(r.rate_percent) : ''}
                                onChange={e => setRate(type, tier, 'rate_percent', e.target.value)}
                                className="font-mono pr-7"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">%</span>
                            </div>
                            <div className="relative w-24">
                              <Input
                                type="number"
                                min={0}
                                value={r ? String(r.min_value) : ''}
                                onChange={e => setRate(type, tier, 'min_value', e.target.value)}
                                className="font-mono pr-7"
                                title="下限：算出來不足這個數字時至少給這麼多"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">下限</span>
                            </div>
                          </div>
                          {p && (
                            <p className="text-xs text-neutral-400 tabular-nums">
                              單抽 {meta.sample} G 時回收 <span className="font-medium text-primary">{p.value} G</span>
                              {p.perDraw > 0 && <span> · 約 {p.perDraw} 件換一抽</span>}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>

        {/*
          結算方式與廠商個別設定已搬到「廠商管理 → 廠商設定」（老闆 2026-08-25）：
          那邊用表格呈現、可直接編輯，而且有完整變更紀錄。這頁只管費率。
        */}
        <PageCard>
          <div className="flex items-start gap-3">
            <div className="text-sm text-neutral-600 leading-relaxed">
              <span className="font-medium text-neutral-900">回收在結算怎麼跟廠商拆</span>
              （結算方式、差額分潤、廠商個別設定）已移到
              <a href="/suppliers/settings" className="text-primary hover:underline mx-1">廠商管理 → 廠商設定</a>
              ，那邊有完整變更紀錄。
            </div>
          </div>
        </PageCard>

        <div className="flex justify-end">
          <Button variant="primary" onClick={save} isLoading={saving} disabled={loading}>
            儲存設定
          </Button>
        </div>
      </div>
    </AdminLayout>
  )
}
