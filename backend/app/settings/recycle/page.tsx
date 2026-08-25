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
import SelectField from '@/components/ui/SelectField'
import Badge from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/contexts/ToastContext'

interface Rate {
  product_type: string
  tier: 'all' | 'major' | 'normal'
  rate_percent: number
  min_value: number
}

interface Supplier {
  id: number
  name: string
  recycle_settlement_mode: 'charge' | 'margin' | null
  recycle_margin_supplier_share: number | null
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
  const [mode, setMode] = useState<'charge' | 'margin'>('margin')
  const [supplierShare, setSupplierShare] = useState<number>(0)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
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
      setMode(json.settlement?.mode ?? 'margin')
      setSupplierShare(Number(json.settlement?.supplierShare ?? 0))
      setSuppliers((json.suppliers ?? []).map((s: any) => ({
        ...s,
        recycle_margin_supplier_share:
          s.recycle_margin_supplier_share === null ? null : Number(s.recycle_margin_supplier_share),
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

  const setOverride = (id: number, field: 'recycle_settlement_mode' | 'recycle_margin_supplier_share', value: any) => {
    setSuppliers(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/recycle-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rates,
          settlement: { mode, supplierShare },
          supplierOverrides: suppliers.map(s => ({
            id: s.id,
            mode: s.recycle_settlement_mode,
            supplierShare: s.recycle_margin_supplier_share,
          })),
        }),
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

        <PageCard>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-neutral-900">結算方式</h2>
            <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
              一筆抽獎被回收之後，那筆營收怎麼跟廠商拆。兩種方式二選一，不會同時套用。
            </p>
          </div>

          <div className="space-y-4">
            <div className="max-w-sm">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">全站預設</label>
              <SelectField value={mode} onChange={e => setMode(e.target.value as 'charge' | 'margin')}>
                <option value="margin">差額分潤（抽獎不走一般分潤）</option>
                <option value="charge">跟廠商收回收價（抽獎照一般分潤）</option>
              </SelectField>
            </div>

            {mode === 'margin' ? (
              <>
                <div className="max-w-sm">
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5">差額分給廠商</label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={String(supplierShare)}
                      onChange={e => setSupplierShare(e.target.value === '' ? 0 : Number(e.target.value))}
                      className="font-mono pr-7"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">%</span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">0 ＝ 差額平台全拿</p>
                </div>

                {/* 用老闆給的例子直接算給他看，設定改了數字就跟著動 */}
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-sm max-w-md">
                  <div className="text-xs font-medium text-neutral-500 mb-2">試算</div>
                  <div className="space-y-1 tabular-nums text-neutral-700">
                    <div className="flex justify-between"><span>轉蛋單抽價</span><span className="font-mono">100 G</span></div>
                    <div className="flex justify-between">
                      <span>玩家回收拿到</span>
                      <span className="font-mono">
                        −{(() => { const p = preview('gacha', 'all'); return p ? Math.max(1, Math.floor(100 * (rateMap.get('gacha:all')?.rate_percent ?? 0) / 100)) : 0 })()} G
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold">
                      <span>差額</span>
                      <span className="font-mono">
                        {100 - Math.max(1, Math.floor(100 * (rateMap.get('gacha:all')?.rate_percent ?? 0) / 100))} G
                      </span>
                    </div>
                    {(() => {
                      const refund = Math.max(1, Math.floor(100 * (rateMap.get('gacha:all')?.rate_percent ?? 0) / 100))
                      const margin = 100 - refund
                      const toSupplier = Math.round((margin * supplierShare) / 100)
                      return (
                        <>
                          <div className="flex justify-between text-neutral-500"><span>└ 廠商</span><span className="font-mono">{toSupplier} G</span></div>
                          <div className="flex justify-between text-primary font-semibold"><span>└ 平台</span><span className="font-mono">{margin - toSupplier} G</span></div>
                        </>
                      )
                    })()}
                  </div>
                  <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                    回收價由平台從那筆營收裡出，不另外跟廠商收。貨沒出去、仍在廠商倉庫，他可以重組再利用。
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 max-w-md leading-relaxed">
                抽獎照一般分潤率分給廠商，<span className="font-medium">回收價再從廠商當期結算扣除</span>。
                這是改版前的做法。
              </div>
            )}
          </div>

          {/* 廠商覆蓋：合約條件談不一樣時才需要，預設全部照全站 */}
          {!loading && suppliers.length > 0 && (
            <div className="mt-6 pt-5 border-t border-neutral-200">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-neutral-900">廠商個別設定</h3>
                <Badge variant="default">選填</Badge>
              </div>
              <p className="text-xs text-neutral-500 mb-3">留空即照全站預設。只有合約條件談得不一樣的廠商才需要填。</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-neutral-500">廠商</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-neutral-500">結算方式</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-neutral-500 w-40">差額分給廠商</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {suppliers.map(s => (
                      <tr key={s.id}>
                        <td className="py-2 px-3 text-neutral-900">{s.name}</td>
                        <td className="py-2 px-3">
                          <SelectField
                            compact
                            value={s.recycle_settlement_mode ?? ''}
                            onChange={e => setOverride(s.id, 'recycle_settlement_mode', e.target.value === '' ? null : e.target.value)}
                          >
                            <option value="">照全站預設</option>
                            <option value="margin">差額分潤</option>
                            <option value="charge">跟廠商收回收價</option>
                          </SelectField>
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            placeholder="預設"
                            value={s.recycle_margin_supplier_share === null ? '' : String(s.recycle_margin_supplier_share)}
                            onChange={e => setOverride(
                              s.id,
                              'recycle_margin_supplier_share',
                              e.target.value === '' ? null : Number(e.target.value),
                            )}
                            className="font-mono"
                            disabled={s.recycle_settlement_mode === 'charge'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
