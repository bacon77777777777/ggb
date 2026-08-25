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
  info: string
}> = {
  gacha: {
    label: '轉蛋',
    tiers: ['all'],
    info: '不分賞等 —— 轉蛋抽到的就是那件商品本身，實物價值約等於單抽價，所以整類共用一個比例。回收後庫存會加回原商品（remaining +1），同一抽可以再賣一次全價，是回收成本最可控的類型。',
  },
  blindbox: {
    label: '盒玩',
    tiers: ['all'],
    info: '不分賞等 —— 同轉蛋：抽到的就是那件商品，價值約等於單抽價。回收後庫存會加回原商品，可再賣一次全價。',
  },
  ichiban: {
    label: '一番賞',
    tiers: ['major', 'normal'],
    info: '序列商品，回收後庫存不會加回（加回去會破壞封存驗證與籤號順序），實體留在廠商倉庫等重組。大賞由系統自動判定：品項初始總數 ≤ 3 就算大賞，不需要人工指定。',
  },
  card: {
    label: '抽卡',
    tiers: ['major', 'normal'],
    info: '序列商品，庫存不加回，實體留在廠商倉庫。要注意抽卡的一般賞數量級很大（D賞全站有兩萬多件），那類品項的實物價值跟單抽價幾乎脫鉤，一般賞比例不宜設高。',
  },
  custom: {
    label: '自製賞',
    tiers: ['major', 'normal'],
    info: '序列商品，庫存不加回，實體留在廠商倉庫。自製賞常由回收品重組而成，設定比例時可一併考慮那批貨的取得成本。',
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

const key = (t: string, tier: string) => `${t}:${tier}`

export default function RecycleRatesPage() {
  const [section, setSection] = useState<TypeKey>('gacha')
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

  const meta = TYPE_META[section]

  return (
    <AdminLayout pageTitle="回收價格設定">
      <div className="space-y-3">
        <PageCard>
          {loading ? (
            <CardSkeleton rows={6} />
          ) : (
            <SettingsShell
              nav={<SettingsNav sections={SECTIONS} value={section} onChange={setSection} />}
            >
              <SectionHead title={meta.label} info={meta.info} />

              <div className="divide-y divide-neutral-100">
                {meta.tiers.map(tier => {
                  const r = rateMap.get(key(section, tier))
                  return (
                    <SettingsRow key={tier} title={TIER_LABEL[tier]}>
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
