'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useEffect, useCallback } from 'react'

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
  confirmed: { label: '已確認', cls: 'bg-blue-50 text-blue-700' },
  paid:      { label: '已付款', cls: 'bg-emerald-50 text-emerald-700' },
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
  const [snapshots, setSnapshots]   = useState<Snapshot[]>([])
  const [filterMonth, setFilterMonth] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading]       = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMonth, setGenMonth]     = useState('')
  const [editNote, setEditNote]     = useState<Record<number, string>>({})

  const cronSecret = typeof window !== 'undefined' ? localStorage.getItem('cron_secret') ?? '' : ''

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
    const secret = window.prompt('請輸入 CRON_SECRET 以執行月結快照：')
    if (!secret) return
    setGenerating(true)
    const params = genMonth ? `?secret=${secret}&month=${genMonth}` : `?secret=${secret}`
    const res = await fetch(`/api/cron/monthly-settlement${params}`)
    const data = await res.json()
    setGenerating(false)
    if (data.ok) {
      alert(`完成！共建立 ${data.created} 筆`)
      load()
    } else {
      alert(`錯誤：${data.error}`)
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
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          >
            <option value="">所有月份</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          >
            <option value="">所有狀態</option>
            <option value="draft">草稿</option>
            <option value="confirmed">已確認</option>
            <option value="paid">已付款</option>
          </select>
          <select
            value={genMonth}
            onChange={e => setGenMonth(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          >
            <option value="">上個月</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
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
          <div className="text-center py-12 text-neutral-400">載入中...</div>
        ) : Object.keys(byMonth).length === 0 ? (
          <div className="text-center py-12 text-neutral-400">無結算紀錄，點「立即生成快照」產生本月資料。</div>
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
                  {allPaid && <span className="text-xs text-emerald-600 font-medium">✓ 全部已付款</span>}
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500">廠商</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500">商品消費 (G)</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500">ECPay</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500">分解退</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500 font-semibold">應付 (TWD)</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500">備註</th>
                      <th className="text-center px-4 py-2 text-xs font-medium text-neutral-500">狀態</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const sm = STATUS_META[row.status]
                      return (
                        <tr key={row.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                          <td className="px-4 py-3 font-medium text-neutral-800">{row.supplier_name}</td>
                          <td className="px-4 py-3 text-right font-mono text-neutral-600">{Number(row.total_g).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-rose-500">-{Number(row.ecpay_fee).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-amber-600">-{Number(row.dismantle_total).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-neutral-900">{fmt(row.supplier_net)}</td>
                          <td className="px-4 py-3 max-w-[160px]">
                            <div className="flex items-center gap-1">
                              <input
                                className="text-xs border border-neutral-200 rounded px-2 py-0.5 w-full focus:outline-none"
                                placeholder="備註..."
                                value={editNote[row.id] ?? (row.note ?? '')}
                                onChange={e => setEditNote(prev => ({ ...prev, [row.id]: e.target.value }))}
                                onBlur={() => saveNote(row.id)}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${sm.cls}`}>{sm.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {row.status === 'draft' && (
                                <button onClick={() => updateStatus(row.id, 'confirmed')} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">確認</button>
                              )}
                              {row.status === 'confirmed' && (
                                <button onClick={() => updateStatus(row.id, 'paid')} className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100">標記已付款</button>
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
