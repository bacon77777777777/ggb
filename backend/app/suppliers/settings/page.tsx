'use client'

/**
 * 廠商設定
 *
 * 老闆 2026-08-25：把「結算方式」與「廠商個別設定」從回收價格設定頁搬過來，
 * 用表格呈現、可直接編輯，並且要有完整操作紀錄 ——
 * 「正常初始設定完，後續比較少會去編輯」，正因為少動，動的那一次才要查得到。
 *
 * 版型跟功能開關一致：左側分類、右側內容，共用 SettingsShell。
 * 回收價格設定頁（/settings/recycle）從此只管費率 %，不再碰結算。
 */

import { useState, useEffect } from 'react'
import { AdminLayout, PageCard } from '@/components'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import SelectField from '@/components/ui/SelectField'
import Badge from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { TableEmpty } from '@/components/ui/EmptyState'
import {
  SettingsShell,
  SettingsNav,
  SectionHead,
  SettingsRow,
  Segmented,
} from '@/components/settings/SettingsSection'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'

interface Supplier {
  id: number
  name: string
  recycle_settlement_mode: 'charge' | 'margin' | null
  recycle_margin_supplier_share: number | null
}

interface ChangeLog {
  id: number
  supplierName: string
  field: string
  oldLabel: string
  newLabel: string
  changedBy: string
  createdAt: string
}

type SectionKey = 'settlement' | 'suppliers' | 'logs'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'settlement', label: '回收結算' },
  { key: 'suppliers', label: '廠商個別設定' },
  { key: 'logs', label: '變更紀錄' },
]

const FIELD_LABEL: Record<string, string> = {
  recycle_settlement_mode: '結算方式',
  recycle_margin_supplier_share: '差額分給廠商',
  global_recycle_settlement_mode: '結算方式（全站預設）',
  global_recycle_margin_supplier_share: '差額分給廠商（全站預設）',
}

export default function SupplierSettingsPage() {
  const [section, setSection] = useState<SectionKey>('settlement')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [globalMode, setGlobalMode] = useState<'charge' | 'margin'>('margin')
  const [globalShare, setGlobalShare] = useState<number>(0)
  const [logs, setLogs] = useState<ChangeLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/supplier-settings')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '載入失敗')
      setSuppliers((json.suppliers ?? []).map((s: any) => ({
        ...s,
        recycle_margin_supplier_share:
          s.recycle_margin_supplier_share === null ? null : Number(s.recycle_margin_supplier_share),
      })))
      setGlobalMode(json.global?.mode ?? 'margin')
      setGlobalShare(Number(json.global?.supplierShare ?? 0))
      setLogs(json.logs ?? [])
    } catch (err: any) {
      toast(err?.message ?? '載入失敗', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const setField = (id: number, field: keyof Supplier, value: any) => {
    setSuppliers(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/supplier-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          global: { mode: globalMode, supplierShare: globalShare },
          suppliers: suppliers.map(s => ({
            id: s.id,
            mode: s.recycle_settlement_mode,
            supplierShare: s.recycle_margin_supplier_share,
          })),
        }),
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

  /** 那一列實際生效的值（廠商沒設就吃全站預設） */
  const effective = (s: Supplier) => ({
    mode: s.recycle_settlement_mode ?? globalMode,
    share: s.recycle_margin_supplier_share ?? globalShare,
  })

  const overrideCount = suppliers.filter(
    s => s.recycle_settlement_mode !== null || s.recycle_margin_supplier_share !== null,
  ).length

  /** 用老闆給的 100 G 例子即時試算，數字改了跟著動 */
  const sampleRefund = 15
  const sampleMargin = 100 - sampleRefund
  const sampleToSupplier = Math.round((sampleMargin * globalShare) / 100)

  const SaveBar = (
    <div className="mt-5 flex justify-end">
      <Button variant="primary" onClick={save} isLoading={saving}>
        儲存設定
      </Button>
    </div>
  )

  return (
    <AdminLayout pageTitle="廠商設定">
      <div className="space-y-3">
        <PageCard>
          {loading ? (
            <CardSkeleton rows={6} />
          ) : (
            <SettingsShell
              nav={<SettingsNav sections={SECTIONS} value={section} onChange={setSection} />}
            >
              {section === 'settlement' && (
                <>
                  <SectionHead
                    title="回收結算"
                    info="一筆抽獎被玩家回收之後，那筆營收怎麼跟廠商拆。兩種方式二選一，不會同時套用 —— 同時套用會重複計算（廠商既被扣回收價、又只分到部分差額）。"
                  />
                  <p className="mb-1 text-sm text-neutral-400">
                    這裡設的是全站預設。個別廠商可在「廠商個別設定」覆蓋。
                  </p>

                  <div className="divide-y divide-neutral-100">
                    <SettingsRow
                      title="結算方式"
                      desc={
                        globalMode === 'margin'
                          ? '被回收的抽獎不走一般分潤，改成差額 ＝（單抽價 − 回收價）依比例拆。回收價由平台吸收，不跟廠商收。'
                          : '抽獎照一般分潤率分給廠商，回收價再從當期結算扣除。這是改版前的做法。'
                      }
                      state={globalMode === 'margin' ? 'on' : 'maintenance'}
                    >
                      <Segmented
                        value={globalMode}
                        disabled={saving}
                        onChange={v => setGlobalMode(v as 'charge' | 'margin')}
                        options={[
                          { v: 'margin', label: '差額分潤', tone: 'on' },
                          { v: 'charge', label: '跟廠商收回收價', tone: 'warn' },
                        ]}
                      />
                    </SettingsRow>

                    <SettingsRow
                      title="差額分給廠商"
                      desc={
                        <>
                          0 ＝ 差額平台全拿。
                          <span className="mt-1 block text-neutral-500">
                            例：轉蛋單抽 100 G、玩家回收拿 {sampleRefund} G → 差額
                            <span className="mx-1 font-medium text-neutral-700">{sampleMargin} G</span>
                            ；廠商 <span className="font-mono">{sampleToSupplier}</span> G、
                            平台 <span className="font-mono text-primary">{sampleMargin - sampleToSupplier}</span> G
                          </span>
                        </>
                      }
                      dimmed={globalMode === 'charge'}
                    >
                      <div className="relative w-28">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={String(globalShare)}
                          onChange={e => setGlobalShare(e.target.value === '' ? 0 : Number(e.target.value))}
                          className="pr-7 font-mono"
                          disabled={globalMode === 'charge'}
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
                      </div>
                    </SettingsRow>
                  </div>

                  {SaveBar}
                </>
              )}

              {section === 'suppliers' && (
                <>
                  <SectionHead
                    title="廠商個別設定"
                    info="留空即照全站預設。只有合約條件談得不一樣的廠商才需要填 —— 每多一個例外，之後對帳就多一個要記得的規則。"
                    right={
                      <span className="text-sm text-neutral-400">
                        {overrideCount} / {suppliers.length} 家有個別設定
                      </span>
                    }
                  />

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="border-b border-neutral-200 bg-neutral-50">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">廠商</th>
                          <th className="w-52 px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">結算方式</th>
                          <th className="w-36 px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">差額分給廠商</th>
                          <th className="w-48 px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">實際生效</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {suppliers.length === 0 ? (
                          <TableEmpty colSpan={4} />
                        ) : suppliers.map(s => {
                          const eff = effective(s)
                          const isDefault =
                            s.recycle_settlement_mode === null && s.recycle_margin_supplier_share === null
                          return (
                            <tr key={s.id} className="transition-colors hover:bg-neutral-50">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-neutral-900">{s.name}</span>
                                  {isDefault && <Badge variant="default">預設</Badge>}
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <SelectField
                                  compact
                                  value={s.recycle_settlement_mode ?? ''}
                                  onChange={e => setField(
                                    s.id,
                                    'recycle_settlement_mode',
                                    e.target.value === '' ? null : e.target.value,
                                  )}
                                >
                                  <option value="">照全站預設</option>
                                  <option value="margin">差額分潤</option>
                                  <option value="charge">跟廠商收回收價</option>
                                </SelectField>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="relative">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    placeholder="預設"
                                    value={s.recycle_margin_supplier_share === null
                                      ? '' : String(s.recycle_margin_supplier_share)}
                                    onChange={e => setField(
                                      s.id,
                                      'recycle_margin_supplier_share',
                                      e.target.value === '' ? null : Number(e.target.value),
                                    )}
                                    className="pr-7 font-mono"
                                    disabled={eff.mode === 'charge'}
                                  />
                                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">%</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-neutral-500">
                                {eff.mode === 'margin'
                                  ? <>差額分潤 · 廠商 <span className="font-mono text-neutral-700">{eff.share}%</span></>
                                  : '跟廠商收回收價'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {SaveBar}
                </>
              )}

              {section === 'logs' && (
                <>
                  <SectionHead
                    title="變更紀錄"
                    info="每一格的異動都留底。這些設定初始設完之後很少再動，正因為少動，動的那一次才要查得到是誰、什麼時候、把值從多少改成多少。沒有變動的欄位不會留紀錄。"
                    right={<span className="text-sm text-neutral-400">最新 200 筆</span>}
                  />

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="border-b border-neutral-200 bg-neutral-50">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">時間</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">對象</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">項目</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">變更</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-500">操作人</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {logs.length === 0 ? (
                          <TableEmpty colSpan={5} />
                        ) : logs.map(l => (
                          <tr key={l.id} className="transition-colors hover:bg-neutral-50">
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">{formatDateTime(l.createdAt)}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-neutral-900">{l.supplierName}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-neutral-700">{FIELD_LABEL[l.field] ?? l.field}</td>
                            <td className="whitespace-nowrap px-4 py-2.5">
                              <span className="text-neutral-400 line-through">{l.oldLabel}</span>
                              <span className="mx-1.5 text-neutral-300">→</span>
                              <span className="font-medium text-neutral-900">{l.newLabel}</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-neutral-600">{l.changedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </SettingsShell>
          )}
        </PageCard>
      </div>
    </AdminLayout>
  )
}
