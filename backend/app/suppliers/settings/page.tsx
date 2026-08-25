'use client'

/**
 * 廠商設定
 *
 * 老闆 2026-08-25：把「結算方式」與「廠商個別設定」從回收價格設定頁搬過來，
 * 用表格呈現、可直接編輯，並且要有完整操作紀錄 ——
 * 「正常初始設定完，後續比較少會去編輯」，正因為少動，動的那一次才要查得到。
 *
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

const FIELD_LABEL: Record<string, string> = {
  recycle_settlement_mode: '結算方式',
  recycle_margin_supplier_share: '差額分給廠商',
  global_recycle_settlement_mode: '結算方式（全站預設）',
  global_recycle_margin_supplier_share: '差額分給廠商（全站預設）',
}

export default function SupplierSettingsPage() {
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

  /** 那一列實際生效的值（廠商沒設就顯示全站預設） */
  const effective = (s: Supplier) => ({
    mode: s.recycle_settlement_mode ?? globalMode,
    share: s.recycle_margin_supplier_share ?? globalShare,
  })

  return (
    <AdminLayout pageTitle="廠商設定">
      <div className="space-y-6">

        <PageCard>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-neutral-900">回收結算方式</h2>
            <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
              一筆抽獎被玩家回收之後，那筆營收怎麼跟廠商拆。兩種方式二選一，不會同時套用。
            </p>
          </div>

          {loading ? (
            <CardSkeleton rows={4} />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5">全站預設</label>
                  <SelectField value={globalMode} onChange={e => setGlobalMode(e.target.value as 'charge' | 'margin')}>
                    <option value="margin">差額分潤（抽獎不走一般分潤）</option>
                    <option value="charge">跟廠商收回收價（抽獎照一般分潤）</option>
                  </SelectField>
                </div>
                {globalMode === 'margin' && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5">差額分給廠商</label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={String(globalShare)}
                        onChange={e => setGlobalShare(e.target.value === '' ? 0 : Number(e.target.value))}
                        className="font-mono pr-7"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">%</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">0 ＝ 差額平台全拿</p>
                  </div>
                )}
              </div>

              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs text-neutral-600 leading-relaxed max-w-2xl">
                <span className="font-medium text-neutral-900">差額分潤</span>：
                被回收的抽獎不走一般分潤，改成差額 ＝（單抽價 − 回收價）依比例拆，回收價由平台吸收、不跟廠商收。
                例：轉蛋單抽 100 G、玩家回收拿 15 G → 差額 85 G，設 0% 就是平台全拿。
                <br />
                <span className="font-medium text-neutral-900">跟廠商收回收價</span>：
                抽獎照一般分潤率分給廠商，回收價再從當期結算扣除。
              </div>
            </div>
          )}
        </PageCard>

        <PageCard>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-900">廠商個別設定</h2>
            <p className="text-sm text-neutral-500 mt-1">
              留空即照全站預設。只有合約條件談得不一樣的廠商才需要填。
            </p>
          </div>

          {loading ? (
            <CardSkeleton rows={4} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500">廠商</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500 w-56">結算方式</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500 w-40">差額分給廠商</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500 w-52">實際生效</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {suppliers.length === 0 ? (
                    <TableEmpty colSpan={4} />
                  ) : suppliers.map(s => {
                    const eff = effective(s)
                    const isDefault = s.recycle_settlement_mode === null && s.recycle_margin_supplier_share === null
                    return (
                      <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-neutral-900">{s.name}</span>
                            {isDefault && <Badge variant="default">預設</Badge>}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <SelectField
                            compact
                            value={s.recycle_settlement_mode ?? ''}
                            onChange={e => setField(s.id, 'recycle_settlement_mode', e.target.value === '' ? null : e.target.value)}
                          >
                            <option value="">照全站預設</option>
                            <option value="margin">差額分潤</option>
                            <option value="charge">跟廠商收回收價</option>
                          </SelectField>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="預設"
                              value={s.recycle_margin_supplier_share === null ? '' : String(s.recycle_margin_supplier_share)}
                              onChange={e => setField(
                                s.id,
                                'recycle_margin_supplier_share',
                                e.target.value === '' ? null : Number(e.target.value),
                              )}
                              className="font-mono pr-7"
                              disabled={eff.mode === 'charge'}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-neutral-500">
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
          )}

          <div className="flex justify-end mt-5">
            <Button variant="primary" onClick={save} isLoading={saving} disabled={loading}>
              儲存設定
            </Button>
          </div>
        </PageCard>

        <PageCard>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-900">變更紀錄</h2>
            <p className="text-sm text-neutral-500 mt-1">
              每一格的異動都留底：誰、什麼時候、從多少改成多少。最新 200 筆。
            </p>
          </div>

          {loading ? (
            <CardSkeleton rows={3} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">時間</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500">對象</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500">項目</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500">變更</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-neutral-500">操作人</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {logs.length === 0 ? (
                    <TableEmpty colSpan={5} />
                  ) : logs.map(l => (
                    <tr key={l.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-2.5 px-4 text-xs text-neutral-500 whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
                      <td className="py-2.5 px-4 text-neutral-900 whitespace-nowrap">{l.supplierName}</td>
                      <td className="py-2.5 px-4 text-neutral-700 whitespace-nowrap">{FIELD_LABEL[l.field] ?? l.field}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="text-neutral-400 line-through">{l.oldLabel}</span>
                        <span className="mx-1.5 text-neutral-300">→</span>
                        <span className="font-medium text-neutral-900">{l.newLabel}</span>
                      </td>
                      <td className="py-2.5 px-4 text-neutral-600 whitespace-nowrap">{l.changedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>

      </div>
    </AdminLayout>
  )
}
