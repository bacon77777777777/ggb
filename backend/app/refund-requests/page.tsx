'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useEffect, useCallback } from 'react'

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

const STATUS_META = {
  pending:   { label: '待審核', cls: 'bg-yellow-50 text-yellow-700' },
  approved:  { label: '已核准', cls: 'bg-primary text-primary' },
  rejected:  { label: '已拒絕', cls: 'bg-red-50 text-red-600' },
  processed: { label: '已處理', cls: 'bg-green-50 text-green-700' },
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
          <div className="text-center py-12 text-neutral-400">載入中...</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">無退款申請</div>
        ) : (
          <div className="space-y-3">
            {requests.map(r => {
              const sm = STATUS_META[r.status]
              return (
                <div key={r.id} className="bg-white rounded-xl border border-neutral-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-800">#{r.id}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${sm.cls}`}>{sm.label}</span>
                        <span className="text-xs text-neutral-400">{new Date(r.created_at).toLocaleString('zh-TW')}</span>
                      </div>
                      <div className="text-sm text-neutral-700">
                        <span className="font-medium">{r.user?.name || '(未命名)'}</span>
                        <span className="text-neutral-400 ml-2">{r.user?.email}</span>
                        <span className="ml-2 text-violet-600">餘額 {(r.user?.tokens ?? 0).toLocaleString()} G</span>
                      </div>
                      {r.recharge && (
                        <div className="text-xs text-neutral-500">
                          儲值單：{r.recharge.order_number}（NT$ {Number(r.recharge.amount).toLocaleString()}，{r.recharge.status}）
                        </div>
                      )}
                      <div className="text-sm text-neutral-600">原因：{r.reason}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-neutral-900">NT$ {Number(r.amount_twd).toLocaleString()}</p>
                      {r.tokens_to_deduct > 0 && (
                        <p className="text-xs text-rose-500">扣回 {r.tokens_to_deduct.toLocaleString()} G</p>
                      )}
                    </div>
                  </div>

                  {/* 管理員操作 */}
                  {(r.status === 'pending' || r.status === 'approved') && (
                    <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-2">
                      <input
                        className="flex-1 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                        placeholder="備註（選填）..."
                        value={notes[r.id] ?? (r.admin_note ?? '')}
                        onChange={e => setNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                      />
                      {r.status === 'pending' && (
                        <>
                          <button onClick={() => act(r.id, 'approve')} className="px-3 py-1.5 text-sm bg-primary text-primary rounded-lg hover:bg-blue-100">核准</button>
                          <button onClick={() => act(r.id, 'reject')} className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100">拒絕</button>
                        </>
                      )}
                      {r.status === 'approved' && (
                        <button onClick={() => act(r.id, 'process')} className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium">
                          執行退款（扣代幣）
                        </button>
                      )}
                    </div>
                  )}
                  {r.admin_note && r.status !== 'pending' && r.status !== 'approved' && (
                    <div className="mt-2 text-xs text-neutral-500">備註：{r.admin_note}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
