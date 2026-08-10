'use client'

import { AdminLayout, ListTableCard, RowAction, type ListColumn } from '@/components'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
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

// 顏色統一交由 Badge 的 statusVariantMap 決定，此處只留標籤文字
const STATUS_META: Record<RefundRequest['status'], { label: string }> = {
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
  const [searchQuery, setSearchQuery]   = useState('')

  // 新增申請
  const [showForm, setShowForm]         = useState(false)
  const [form, setForm]                 = useState({ userId: '', rechargeId: '', amountTwd: '', tokensToClaim: '', reason: '' })
  const [submitting, setSubmitting]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = filterStatus !== 'all' ? `?status=${filterStatus}` : ''
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

  const filtered = requests.filter(r => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (r.user?.name ?? '').toLowerCase().includes(q)
      || (r.user?.email ?? '').toLowerCase().includes(q)
      || (r.recharge?.order_number ?? '').toLowerCase().includes(q)
      || r.reason.toLowerCase().includes(q)
  })

  const columns: ListColumn<RefundRequest>[] = [
    {
      key: 'id', label: '#',
      sortValue: r => r.id,
      className: 'font-mono font-medium text-neutral-800',
      render: r => <>#{r.id}</>,
    },
    {
      key: 'user', label: '會員',
      sortValue: r => r.user?.name ?? '',
      render: r => (
        <>
          <div className="font-medium text-neutral-800">{r.user?.name || '(未命名)'}</div>
          <div className="text-xs text-neutral-400">{r.user?.email}</div>
          <div className="text-xs text-violet-600">餘額 {(r.user?.tokens ?? 0).toLocaleString()} G</div>
        </>
      ),
    },
    {
      key: 'reason', label: '原因',
      className: 'max-w-[220px]',
      render: r => (
        <>
          <div className="text-neutral-600 truncate" title={r.reason}>{r.reason}</div>
          {r.recharge && (
            <div className="text-xs text-neutral-400 truncate">
              儲值單 {r.recharge.order_number}（NT$ {Number(r.recharge.amount).toLocaleString()}）
            </div>
          )}
        </>
      ),
    },
    {
      key: 'amountTwd', label: '退款 (TWD)',
      sortValue: r => Number(r.amount_twd),
      className: 'text-right font-mono font-semibold text-neutral-900',
      render: r => <>{Number(r.amount_twd).toLocaleString()}</>,
    },
    {
      key: 'tokensToDeduct', label: '扣回 (G)',
      sortValue: r => r.tokens_to_deduct,
      className: 'text-right font-mono text-rose-500',
      render: r => <>{r.tokens_to_deduct > 0 ? `-${r.tokens_to_deduct.toLocaleString()}` : '—'}</>,
    },
    {
      key: 'createdAt', label: '申請時間',
      sortValue: r => new Date(r.created_at).getTime(),
      className: 'font-mono text-xs text-neutral-500',
      render: r => <>{new Date(r.created_at).toLocaleString('zh-TW')}</>,
    },
    {
      key: 'status', label: '狀態',
      sortValue: r => r.status,
      render: r => <Badge status={r.status}>{STATUS_META[r.status].label}</Badge>,
    },
    {
      key: 'note', label: '備註',
      className: 'max-w-[160px]',
      render: r => {
        const editable = r.status === 'pending' || r.status === 'approved'
        return editable ? (
          <Input className="text-xs"
            placeholder="備註..."
            value={notes[r.id] ?? (r.admin_note ?? '')}
            onChange={e => setNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
          />
        ) : (
          <span className="text-xs text-neutral-400">{r.admin_note || '—'}</span>
        )
      },
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: r => (
        <div className="flex items-center gap-2">
          {r.status === 'pending' && (
            <>
              <RowAction tone="primary" onClick={() => void act(r.id, 'approve')}>核准</RowAction>
              <RowAction tone="danger" onClick={() => void act(r.id, 'reject')}>拒絕</RowAction>
            </>
          )}
          {r.status === 'approved' && (
            <RowAction tone="primary" onClick={() => void act(r.id, 'process')}>執行退款</RowAction>
          )}
          {r.status === 'processed' && r.processed_at && (
            <span className="text-xs text-neutral-400">{new Date(r.processed_at).toLocaleDateString('zh-TW')}</span>
          )}
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="退款申請">
      <div className="space-y-4">

        {/* 新增表單 */}
        {showForm && (
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h3 className="font-semibold text-neutral-800">新增退款申請</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">用戶 UUID *</label>
                <Input value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} placeholder="user UUID" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">儲值單 ID（選填）</label>
                <Input value={form.rechargeId} onChange={e => setForm(f => ({ ...f, rechargeId: e.target.value }))} placeholder="recharge_records.id" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">退款金額 (TWD) *</label>
                <Input type="number" value={form.amountTwd} onChange={e => setForm(f => ({ ...f, amountTwd: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">扣回代幣 (G)</label>
                <Input type="number" value={form.tokensToClaim} onChange={e => setForm(f => ({ ...f, tokensToClaim: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">退款原因 *</label>
              <Textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button onClick={submitForm} disabled={submitting} className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">送出</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50">取消</button>
            </div>
          </div>
        )}

        <ListTableCard
          pageKey="refund-requests"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={loading}
          emptyMessage="無退款申請"
          defaultSortField="createdAt"
          defaultSortDirection="desc"
          searchPlaceholder="搜尋會員、儲值單號..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增申請"
          onAddClick={() => setShowForm(v => !v)}
          filters={[
            {
              key: 'status', label: '狀態',
              value: filterStatus, onChange: setFilterStatus,
              options: [
                { value: 'all',       label: '全部狀態' },
                { value: 'pending',   label: '待審核' },
                { value: 'approved',  label: '已核准' },
                { value: 'rejected',  label: '已拒絕' },
                { value: 'processed', label: '已處理' },
              ],
            },
          ]}
        />
      </div>
    </AdminLayout>
  )
}
