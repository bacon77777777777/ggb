'use client'

import AdminLayout from '@/components/AdminLayout'
import Badge from '@/components/ui/Badge'
import { useState, useEffect, useCallback } from 'react'
import { CardSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

interface RefundRequest {
  id: number
  amount_twd: number
  tokens_to_deduct: number
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'processed'
  admin_note: string | null
  created_at: string
  reviewed_at: string | null
  processed_at: string | null
  user: { id: string; name: string; email: string; tokens: number } | null
  recharge: { id: number; order_number: string; amount: number; status: string } | null
}

// 顏色統一交由 Badge 的 statusVariantMap 決定，此處只留標籤文字
const STATUS_META = {
  pending:   { label: '待審核' },
  approved:  { label: '已核准' },
  rejected:  { label: '已拒絕' },
  processed: { label: '已處理' },
}

export default function RefundRequestsPage() {
  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [filterStatus, setFilterStatus] = useState('pending')
  const [loading, setLoading]           = useState(false)
  const [notes, setNotes]               = useState<Record<number, string>>({})

  // 新增申請
  const [showForm, setShowForm]         = useState(false)
  const [form, setForm]                 = useState({ userId: '', rechargeId: '', amountTwd: '', tokensToClaim: '', reason: '' })
  const [submitting, setSubmitting]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = filterStatus ? `?status=${filterStatus}` : ''
    const res  = await fetch(`/api/admin/refund-requests${params}`)
    const data = await res.json()
    setRequests(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const act = async (id: number, action: string, adminNote?: string) => {
    await fetch(`/api/admin/refund-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, adminNote: adminNote ?? notes[id] ?? null }),
    })
    load()
  }

  const submitForm = async () => {
    if (!form.userId || !form.amountTwd || !form.reason) return
    setSubmitting(true)
    await fetch('/api/admin/refund-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId:        form.userId,
        rechargeId:    form.rechargeId ? Number(form.rechargeId) : null,
        amountTwd:     Number(form.amountTwd),
        tokensToClaim: Number(form.tokensToClaim) || 0,
        reason:        form.reason,
      }),
    })
    setSubmitting(false)
    setShowForm(false)
    setForm({ userId: '', rechargeId: '', amountTwd: '', tokensToClaim: '', reason: '' })
    setFilterStatus('pending')
    load()
  }

  return (
    <AdminLayout pageTitle="退款申請">
      <div className="space-y-4">

        {/* 控制列 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-3">
          {(['', 'pending', 'approved', 'rejected', 'processed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filterStatus === s
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {s === '' ? '全部' : STATUS_META[s].label}
            </button>
          ))}
          <button
            onClick={() => setShowForm(v => !v)}
            className="ml-auto px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700"
          >
            + 新增申請
          </button>
        </div>

        {/* 新增表單 */}
        {showForm && (
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h3 className="font-semibold text-neutral-800">新增退款申請</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">用戶 UUID *</label>
                <input className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} placeholder="user UUID" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">儲值單 ID（選填）</label>
                <input className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" value={form.rechargeId} onChange={e => setForm(f => ({ ...f, rechargeId: e.target.value }))} placeholder="recharge_records.id" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">退款金額 (TWD) *</label>
                <input type="number" className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" value={form.amountTwd} onChange={e => setForm(f => ({ ...f, amountTwd: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">扣回代幣 (G)</label>
                <input type="number" className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" value={form.tokensToClaim} onChange={e => setForm(f => ({ ...f, tokensToClaim: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">退款原因 *</label>
              <textarea className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button onClick={submitForm} disabled={submitting} className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">送出</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50">取消</button>
            </div>
          </div>
        )}

        {/* 申請列表 */}
        {loading ? (
          <CardSkeleton rows={3} />
        ) : requests.length === 0 ? (
          <EmptyState message="無退款申請" />
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">#</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">會員</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">原因</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500">退款 (TWD)</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500">扣回 (G)</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">申請時間</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-neutral-500">狀態</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">備註</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => {
                    const sm = STATUS_META[r.status]
                    const editable = r.status === 'pending' || r.status === 'approved'
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-neutral-800 whitespace-nowrap">#{r.id}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-800">{r.user?.name || '(未命名)'}</div>
                          <div className="text-xs text-neutral-400">{r.user?.email}</div>
                          <div className="text-xs text-violet-600">餘額 {(r.user?.tokens ?? 0).toLocaleString()} G</div>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="text-neutral-600 truncate" title={r.reason}>{r.reason}</div>
                          {r.recharge && (
                            <div className="text-xs text-neutral-400 truncate">
                              儲值單 {r.recharge.order_number}（NT$ {Number(r.recharge.amount).toLocaleString()}）
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-neutral-900 whitespace-nowrap">
                          {Number(r.amount_twd).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-500 whitespace-nowrap">
                          {r.tokens_to_deduct > 0 ? `-${r.tokens_to_deduct.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString('zh-TW')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge status={r.status}>{sm.label}</Badge>
                        </td>
                        <td className="px-4 py-3 max-w-[160px]">
                          {editable ? (
                            <input
                              className="text-xs border border-neutral-200 rounded px-3 py-0.5 w-full focus:outline-none"
                              placeholder="備註..."
                              value={notes[r.id] ?? (r.admin_note ?? '')}
                              onChange={e => setNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                            />
                          ) : (
                            <span className="text-xs text-neutral-400">{r.admin_note || '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {r.status === 'pending' && (
                              <>
                                <button onClick={() => act(r.id, 'approve')} className="px-2 py-1 text-xs bg-primary text-primary rounded hover:bg-blue-100 whitespace-nowrap">核准</button>
                                <button onClick={() => act(r.id, 'reject')} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 whitespace-nowrap">拒絕</button>
                              </>
                            )}
                            {r.status === 'approved' && (
                              <button onClick={() => act(r.id, 'process')} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 whitespace-nowrap">執行退款</button>
                            )}
                            {r.status === 'processed' && r.processed_at && (
                              <span className="text-xs text-neutral-400">{new Date(r.processed_at).toLocaleDateString('zh-TW')}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
