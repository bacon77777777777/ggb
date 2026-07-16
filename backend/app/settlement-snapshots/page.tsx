'use client'

import AdminLayout from '@/components/AdminLayout'
import Badge from '@/components/ui/Badge'
import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { CardSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import SelectField from '@/components/ui/SelectField'

interface Snapshot {
  id: number
  supplier_id: number
  supplier_name: string
  period_start: string
  period_end: string
  settlement_date: string
  total_g: number
  dismantle_total: number
  ecpay_fee: number
  supplier_net: number
  status: 'draft' | 'confirmed' | 'paid'
  confirmed_at: string | null
  paid_at: string | null
  note: string | null
  created_at: string
}

const STATUS_META = {
  draft:     { label: '草稿',   cls: 'bg-neutral-100 text-neutral-600' },
  confirmed: { label: '已確認', cls: 'bg-primary text-primary' },
  paid:      { label: '已付款', cls: 'bg-green-50 text-green-700' },
}

function fmt(n: number) {
  return `NT$ ${Math.round(n).toLocaleString()}`
}

function periodMonths(count = 12) {
  const months: string[] = []
  const now = new Date()
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export default function SettlementSnapshotsPage() {
  const { toast } = useToast()
  const [snapshots, setSnapshots]   = useState<Snapshot[]>([])
  const [filterMonth, setFilterMonth] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading]       = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMonth, setGenMonth]     = useState('')
  const [editNote, setEditNote]     = useState<Record<number, string>>({})
  const [cronSecretInput, setCronSecretInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterMonth)  params.set('month', filterMonth)
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/admin/settlement-snapshots?${params}`)
    const data = await res.json()
    setSnapshots(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filterMonth, filterStatus])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: number, status: string, note?: string) => {
    await fetch(`/api/admin/settlement-snapshots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(note !== undefined ? { note } : {}) }),
    })
    load()
  }

  const saveNote = async (id: number) => {
    await fetch(`/api/admin/settlement-snapshots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: editNote[id] ?? '' }),
    })
    load()
  }

  const generate = async () => {
    const secret = cronSecretInput.trim()
    if (!secret) { toast('請輸入 CRON_SECRET', 'warning'); return }
    setGenerating(true)
    const params = genMonth ? `?secret=${secret}&month=${genMonth}` : `?secret=${secret}`
    const res = await fetch(`/api/cron/monthly-settlement${params}`)
    const data = await res.json()
    setGenerating(false)
    if (data.ok) {
      toast(`完成！共建立 ${data.created} 筆`, 'success')
      load()
    } else {
      toast(`錯誤：${data.error}`, 'error')
    }
  }

  // 按月份分組
  const byMonth: Record<string, Snapshot[]> = {}
  for (const s of snapshots) {
    const m = s.period_start.slice(0, 7)
    if (!byMonth[m]) byMonth[m] = []
    byMonth[m].push(s)
  }

  const months = periodMonths(12)

  return (
    <AdminLayout pageTitle="月結管理">
      <div className="space-y-4">

        {/* 控制列 */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SelectField
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          >
            <option value="">所有月份</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </SelectField>
          <SelectField
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          >
            <option value="">所有狀態</option>
            <option value="draft">草稿</option>
            <option value="confirmed">已確認</option>
            <option value="paid">已付款</option>
          </SelectField>
          <SelectField
            value={genMonth}
            onChange={e => setGenMonth(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          >
            <option value="">上個月</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </SelectField>
          <input
            type="password"
            value={cronSecretInput}
            onChange={e => setCronSecretInput(e.target.value)}
            placeholder="CRON_SECRET"
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary w-40"
          />
          <button
            onClick={generate}
            disabled={generating}
            className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? '生成中…' : '立即生成快照'}
          </button>
        </div>

        {/* 結算列表 */}
        {loading ? (
          <CardSkeleton rows={3} />
        ) : Object.keys(byMonth).length === 0 ? (
          <EmptyState message="無結算紀錄，點「立即生成快照」產生本月資料。" />
        ) : (
          Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).map(([month, rows]) => {
            const totalNet = rows.reduce((s, r) => s + Number(r.supplier_net), 0)
            const allPaid  = rows.every(r => r.status === 'paid')
            return (
              <div key={month} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b border-neutral-200">
                  <div>
                    <span className="font-semibold text-neutral-800">{month.replace('-', '年')}月</span>
                    <span className="ml-3 text-sm text-neutral-500">{rows.length} 家廠商｜合計 {fmt(totalNet)}</span>
                  </div>
                  {allPaid && <span className="text-xs text-green-600 font-medium">✓ 全部已付款</span>}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">廠商</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500">商品消費 (G)</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500">ECPay</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500">分解退</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500 font-semibold">應付 (TWD)</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">備註</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-neutral-500">狀態</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const sm = STATUS_META[row.status]
                      return (
                        <tr key={row.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-800">{row.supplier_name}</td>
                          <td className="px-4 py-3 text-right font-mono text-neutral-600">{Number(row.total_g).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-rose-500">-{Number(row.ecpay_fee).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-amber-600">-{Number(row.dismantle_total).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-neutral-900">{fmt(row.supplier_net)}</td>
                          <td className="px-4 py-3 max-w-[160px]">
                            <div className="flex items-center gap-1">
                              <input
                                className="text-xs border border-neutral-200 rounded px-3 py-0.5 w-full focus:outline-none"
                                placeholder="備註..."
                                value={editNote[row.id] ?? (row.note ?? '')}
                                onChange={e => setEditNote(prev => ({ ...prev, [row.id]: e.target.value }))}
                                onBlur={() => saveNote(row.id)}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge status={row.status}>{sm.label}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {row.status === 'draft' && (
                                <button onClick={() => updateStatus(row.id, 'confirmed')} className="px-2 py-1 text-xs bg-primary text-primary rounded hover:bg-blue-100">確認</button>
                              )}
                              {row.status === 'confirmed' && (
                                <button onClick={() => updateStatus(row.id, 'paid')} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">標記已付款</button>
                              )}
                              {row.status === 'paid' && row.paid_at && (
                                <span className="text-xs text-neutral-400">{new Date(row.paid_at).toLocaleDateString('zh-TW')}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })
        )}
      </div>
    </AdminLayout>
  )
}
