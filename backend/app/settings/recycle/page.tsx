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
 * 版型跟功能開關一致（老闆 2026-08-25）：左側分類、右側內容，共用 SettingsShell。
 * 結算方式與廠商個別設定在「廠商管理 → 廠商設定」，不在這頁。
 */

import { useState, useEffect, useMemo } from 'react'
import { AdminLayout, PageCard } from '@/components'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { CardSkeleton } from '@/components/ui/Skeleton'
import {
  SettingsShell,
  SettingsNav,
  SectionHead,
  SettingsRow,
} from '@/components/settings/SettingsSection'
import { useToast } from '@/contexts/ToastContext'

interface Rate {
  product_type: string
  tier: 'all' | 'major' | 'normal'
  rate_percent: number
  min_value: number
}

type TypeKey = 'gacha' | 'blindbox' | 'ichiban' | 'card' | 'custom'

/** 每個類型的顯示名稱、賞等結構、預設試算單價，以及那一類為什麼這樣算 */
const TYPE_META: Record<TypeKey, {
  label: string
  tiers: Rate['tier'][]
  sample: number
  info: string
  note: string
}> = {
  gacha: {
    label: '轉蛋',
    tiers: ['all'],
    sample: 179,
    info: '轉蛋抽到的就是那件商品本身，實物價值約等於單抽價，所以整類共用一個比例。回收後庫存會加回原商品（remaining +1），同一抽可以再賣一次全價 —— 這是回收成本最可控的類型。',
    note: '不分賞等。回收後庫存加回原商品，可再賣一次全價。',
  },
  blindbox: {
    label: '盒玩',
    tiers: ['all'],
    sample: 355,
    info: '同轉蛋：抽到的就是那件商品，價值約等於單抽價，回收後庫存也會加回原商品。',
    note: '不分賞等。回收後庫存加回原商品，可再賣一次全價。',
  },
  ichiban: {
    label: '一番賞',
    tiers: ['major', 'normal'],
    sample: 309,
    info: '序列商品，回收後庫存不會加回（加回去會破壞封存驗證與籤號順序），實體留在廠商倉庫等重組。大賞由系統自動判定：品項初始總數 ≤ 3 就算大賞，不需要人工指定。',
    note: '序列商品，庫存不加回，實體留在廠商倉庫。',
  },
  card: {
    label: '抽卡',
    tiers: ['major', 'normal'],
    sample: 204,
    info: '同一番賞。要注意抽卡的一般賞數量級很大（D賞全站有兩萬多件），那類品項的實物價值跟單抽價幾乎脫鉤，一般賞比例不宜設高。',
    note: '序列商品，庫存不加回。一般賞數量級大，比例不宜設高。',
  },
  custom: {
    label: '自製賞',
    tiers: ['major', 'normal'],
    sample: 199,
    info: '同一番賞。自製賞常由回收品重組而成，設定比例時可一併考慮那批貨的取得成本。',
    note: '序列商品，庫存不加回，實體留在廠商倉庫。',
  },
}

const SECTIONS = (Object.keys(TYPE_META) as TypeKey[]).map(k => ({
  key: k,
  label: TYPE_META[k].label,
}))

const TIER_LABEL: Record<Rate['tier'], string> = {
  all: '回收比例',
  major: '大賞比例',
  normal: '一般賞比例',
}

const TIER_DESC: Record<Rate['tier'], string> = {
  all: '玩家回收一件可換回的代幣 ＝ 單抽價 × 這個比例。',
  major: '品項初始總數 ≤ 3 的賞項，由系統自動判定，不需人工指定。',
  normal: '總數 > 3 的賞項。這類實物價值與單抽價脫鉤，比例設高會嚴重高估。',
}

const key = (t: string, tier: string) => `${t}:${tier}`

export default function RecycleRatesPage() {
  const [section, setSection] = useState<TypeKey>('gacha')
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /** 每個類型各自的試算單價，讓人拿真實商品的價格去試 */
  const [samplePrice, setSamplePrice] = useState<Record<string, number>>({})
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

  const meta = TYPE_META[section]
  const price = samplePrice[section] ?? meta.sample

  /** 用試算單價算出玩家實際會拿到多少，以及要收幾件才換得到一抽 */
  const preview = (tier: Rate['tier']) => {
    const r = rateMap.get(key(section, tier))
    if (!r) return null
    const value = Math.max(r.min_value, Math.floor((price * r.rate_percent) / 100))
    return { value, perDraw: value > 0 ? Math.ceil(price / value) : 0 }
  }

  return (
    <AdminLayout pageTitle="回收價格設定">
      <div className="space-y-3">
        <PageCard>
          <div className="text-sm leading-relaxed text-neutral-500">
            回收價的基準是<span className="font-medium text-neutral-700">商品單抽價</span>，
            品項編輯頁不再有回收價欄位。
            回收在廠商結算怎麼拆帳（結算方式、差額分潤、廠商個別設定）在
            <a href="/suppliers/settings" className="mx-1 text-primary hover:underline">廠商管理 → 廠商設定</a>
            。
          </div>
        </PageCard>

        <PageCard>
          {loading ? (
            <CardSkeleton rows={6} />
          ) : (
            <SettingsShell
              nav={<SettingsNav sections={SECTIONS} value={section} onChange={setSection} />}
            >
              <SectionHead title={meta.label} info={meta.info} />
              <p className="mb-1 text-sm text-neutral-400">{meta.note}</p>

              <div className="divide-y divide-neutral-100">
                {meta.tiers.map(tier => {
                  const r = rateMap.get(key(section, tier))
                  const p = preview(tier)
                  return (
                    <SettingsRow
                      key={tier}
                      title={TIER_LABEL[tier]}
                      desc={
                        <>
                          {TIER_DESC[tier]}
                          {p && (
                            <span className="mt-1 block text-neutral-500">
                              單抽 {price.toLocaleString()} G 時回收
                              <span className="mx-1 font-medium text-primary">{p.value} G</span>
                              {p.perDraw > 0 && <>· 約 {p.perDraw} 件換一抽</>}
                            </span>
                          )}
                        </>
                      }
                    >
                      <div className="flex gap-2">
                        <div className="relative w-28">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={r ? String(r.rate_percent) : ''}
                            onChange={e => setRate(section, tier, 'rate_percent', e.target.value)}
                            className="pr-7 font-mono"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
                        </div>
                        <div className="relative w-28">
                          <Input
                            type="number"
                            min={0}
                            value={r ? String(r.min_value) : ''}
                            onChange={e => setRate(section, tier, 'min_value', e.target.value)}
                            className="pr-9 font-mono"
                            title="算出來不足這個數字時，至少給這麼多"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">下限</span>
                        </div>
                      </div>
                    </SettingsRow>
                  )
                })}

                {/* 試算不寫進 DB，純粹拿來抓手感 —— 只看百分比很難判斷玩家的感受 */}
                <SettingsRow
                  title="試算單抽價"
                  desc="只影響上面的預覽金額，不會存檔。填實際商品的單抽價，就看得出玩家回收會拿到多少。"
                >
                  <div className="relative w-28">
                    <Input
                      type="number"
                      min={0}
                      value={String(price)}
                      onChange={e => setSamplePrice(prev => ({
                        ...prev,
                        [section]: e.target.value === '' ? 0 : Number(e.target.value),
                      }))}
                      className="pr-7 font-mono"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">G</span>
                  </div>
                </SettingsRow>
              </div>

              <div className="mt-5 flex justify-end">
                <Button variant="primary" onClick={save} isLoading={saving}>
                  儲存設定
                </Button>
              </div>
            </SettingsShell>
          )}
        </PageCard>
      </div>
    </AdminLayout>
  )
}
