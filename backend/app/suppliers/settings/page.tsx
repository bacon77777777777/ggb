'use client'

/**
 * 廠商結算設定（全站預設）
 *
 * 老闆 2026-08-25：結算費率不再是結算頁上手打的暫存值，一律存 DB。
 * 這頁設的是**全站預設**；每家廠商可在「廠商管理」的新增／編輯視窗覆蓋，
 * 留空就跟著這裡走 —— 所以改這頁會連動所有沒客製過的廠商，動過的不受影響。
 *
 * 綠界手續費估算率只在這裡、不進廠商層級：那是平台與綠界之間的費率，
 * 跟哪家廠商無關，而且結算優先採用實際帳算出的混合費率，這個值只是備援。
 *
 * 變更明細寫進 action_logs，在「系統設定 → 操作記錄」看。
 */

import { useState, useEffect } from 'react'
import { AdminLayout, PageCard } from '@/components'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { CardSkeleton } from '@/components/ui/Skeleton'
import {
  SettingsShell,
  SettingsNav,
  SectionHead,
  SettingsRow,
  Segmented,
} from '@/components/settings/SettingsSection'
import { useToast } from '@/contexts/ToastContext'

type SectionKey = 'rates' | 'recycle'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'rates', label: '結算費率' },
  { key: 'recycle', label: '回收機制' },
]

interface Defaults {
  supplierShare: number
  withholdingRate: number
  pointsMode: 'A' | 'B'
  ecpayRate: number
  recycleMode: 'charge' | 'margin'
  recycleMarginShare: number
}

const EMPTY: Defaults = {
  supplierShare: 70,
  withholdingRate: 0,
  pointsMode: 'B',
  ecpayRate: 2.75,
  // 回收價預設「收」（老闆 2026-08-25）
  recycleMode: 'charge',
  recycleMarginShare: 0,
}

/** 右側只放輸入框，單位貼在框內右側 */
function PctInput({ value, onChange, disabled, unit = '%', step }: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  unit?: string
  step?: string
}) {
  return (
    <div className="relative w-28">
      <Input
        type="number"
        min={0}
        max={100}
        step={step}
        value={String(value)}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className="pr-7 font-mono"
        disabled={disabled}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">{unit}</span>
    </div>
  )
}

export default function SupplierSettlementSettingsPage() {
  const [section, setSection] = useState<SectionKey>('rates')
  const [d, setD] = useState<Defaults>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/supplier-settings')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '載入失敗')
      setD({ ...EMPTY, ...(json.defaults ?? {}) })
    } catch (err: any) {
      toast(err?.message ?? '載入失敗', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const set = <K extends keyof Defaults>(k: K, v: Defaults[K]) => setD(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/supplier-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: d }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '儲存失敗')
      toast(json.changed > 0 ? `已更新 ${json.changed} 項設定` : '沒有任何變更')
      await load()
    } catch (err: any) {
      toast(err?.message ?? '儲存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  const SaveBar = (
    <div className="mt-5 flex justify-end">
      <Button variant="primary" onClick={save} isLoading={saving}>儲存設定</Button>
    </div>
  )

  return (
    <AdminLayout pageTitle="廠商結算設定">
      <PageCard>
        {loading ? (
          <CardSkeleton rows={6} />
        ) : (
          <SettingsShell nav={<SettingsNav sections={SECTIONS} value={section} onChange={setSection} />}>
            {section === 'rates' && (
              <>
                <SectionHead
                  title="結算費率"
                  info="這裡是全站預設。每家廠商可在「廠商管理」的新增／編輯視窗覆蓋，留空就跟著這裡走 —— 所以改這頁會連動所有沒客製過的廠商，動過的不受影響。綠界手續費估算率只在這裡、不分廠商：那是平台與綠界之間的費率，而且結算優先採用實際帳算出的混合費率，這個值只在撈不到實際資料時當備援。異動會寫進「系統設定 → 操作記錄」。"
                />
                <div className="divide-y divide-neutral-100">
                  <SettingsRow title="廠商分潤比">
                    <PctInput value={d.supplierShare} onChange={v => set('supplierShare', v)} />
                  </SettingsRow>
                  <SettingsRow title="代扣稅率">
                    <PctInput value={d.withholdingRate} onChange={v => set('withholdingRate', v)} />
                  </SettingsRow>
                  <SettingsRow title="積分扣除模式">
                    <Segmented
                      value={d.pointsMode}
                      disabled={saving}
                      onChange={v => set('pointsMode', v as 'A' | 'B')}
                      options={[
                        { v: 'A', label: '廠商吸收 50%', tone: 'warn' },
                        { v: 'B', label: '平台全吸收', tone: 'on' },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow title="綠界手續費估算">
                    <PctInput value={d.ecpayRate} onChange={v => set('ecpayRate', v)} step="0.05" />
                  </SettingsRow>
                </div>
                {SaveBar}
              </>
            )}

            {section === 'recycle' && (
              <>
                <SectionHead
                  title="回收機制"
                  info="一筆抽獎被玩家回收之後，那筆營收怎麼跟廠商拆。兩個設定各自獨立（老闆 2026-08-25）：回收價＝退給玩家的代幣要不要跟廠商收，「收」就是抽獎照一般分潤、回收價再從當期結算扣除，「不收」則由平台吸收、那筆抽獎的營收改走差額分潤；差額分潤＝差額（單抽價 − 回收價）分多少 % 給廠商，收回收價的廠商一樣可以再分他差額。這裡是全站預設，個別廠商可在「廠商管理」覆蓋。"
                />
                <div className="divide-y divide-neutral-100">
                  <SettingsRow title="回收價" state={d.recycleMode === 'charge' ? 'on' : 'maintenance'}>
                    <Segmented
                      value={d.recycleMode}
                      disabled={saving}
                      onChange={v => set('recycleMode', v as 'charge' | 'margin')}
                      options={[
                        { v: 'charge', label: '收', tone: 'on' },
                        { v: 'margin', label: '不收', tone: 'warn' },
                      ]}
                    />
                  </SettingsRow>
                  {/* 差額分潤不再被「收回收價」鎖住 —— 兩者可以同時成立 */}
                  <SettingsRow title="差額分潤">
                    <PctInput
                      value={d.recycleMarginShare}
                      onChange={v => set('recycleMarginShare', v)}
                    />
                  </SettingsRow>
                </div>
                {SaveBar}
              </>
            )}
          </SettingsShell>
        )}
      </PageCard>
    </AdminLayout>
  )
}
