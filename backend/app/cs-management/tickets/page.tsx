'use client'

import { AdminLayout, ListTableCard, type ListColumn } from '@/components'
import Badge from '@/components/ui/Badge'
import { useState, useEffect, useCallback } from 'react'
import Textarea from '@/components/ui/Textarea'
import MemberNo from '@/components/MemberNo'
import { userMatches } from '@/lib/userSearch'
import { realEmail } from '@/lib/syntheticEmail'

/**
 * 客服工單 —— 定版樣板（ListTableCard）＋展開列。
 * 一列一張工單，點開看聯絡資訊、問題全文、內部備註與處理動作。
 */

interface CsTicket {
  id: string
  category: string
  email: string
  phone: string
  content: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  admin_note: string | null
  created_at: string
  user: { id: string; member_no?: number | null; name: string; email: string; tokens: number } | null
}

const STATUS_LABEL: Record<CsTicket['status'], string> = {
  open: '待處理',
  in_progress: '處理中',
  resolved: '已解決',
  closed: '已關閉',
}

export default function CsTicketsPage() {
  const [tickets, setTickets] = useState<CsTicket[]>([])
  const [filterStatus, setFilterStatus] = useState('open')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  // 狀態篩選走 API（後端已支援 status 參數），不是前端過濾
  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/cs-tickets?status=${filterStatus}&limit=100`)
    const data = await res.json()
    setTickets(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const update = async (id: string, patch: Record<string, unknown>) => {
    setSaving(id)
    await fetch('/api/admin/cs-tickets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    setSaving(null)
    load()
  }

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })

  const filtered = tickets.filter(t => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return t.content.toLowerCase().includes(q)
      || userMatches(q, t.user)
      || (realEmail(t.email) ?? '').toLowerCase().includes(q)
  })

  const columns: ListColumn<CsTicket>[] = [
    {
      key: 'status', label: '狀態',
      sortValue: t => t.status,
      render: t => <Badge status={t.status}>{STATUS_LABEL[t.status]}</Badge>,
    },
    {
      key: 'category', label: '類型',
      sortValue: t => t.category,
      render: t => <span className="text-[13px] font-semibold text-neutral-700">{t.category}</span>,
    },
    {
      key: 'memberNo', label: '會員編號',
      sortValue: t => t.user?.member_no ?? 0,
      render: t => <MemberNo no={t.user?.member_no} uuid={t.user?.id} />,
    },
    {
      key: 'user', label: '暱稱',
      sortValue: t => t.user?.name ?? '',
      render: t => <span className="text-[13px] font-medium text-neutral-800">{t.user?.name || '—'}</span>,
    },
    {
      key: 'content', label: '問題摘要',
      render: t => <p className="max-w-xs truncate text-[13px] text-neutral-600">{t.content}</p>,
    },
    {
      key: 'createdAt', label: '時間',
      sortValue: t => new Date(t.created_at).getTime(),
      className: 'font-mono',
      render: t => <span className="text-[12px] text-neutral-400">{fmtDate(t.created_at)}</span>,
    },
  ]

  return (
    <AdminLayout pageTitle="客服工單">
      <div className="space-y-4">
        <ListTableCard
          pageKey="cs-tickets"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={loading}
          emptyMessage={`目前沒有${filterStatus !== 'all' ? STATUS_LABEL[filterStatus as CsTicket['status']] ?? '' : ''}工單`}
          defaultSortField="createdAt"
          defaultSortDirection="desc"
          searchPlaceholder="搜尋內容、用戶或信箱..."
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'status', label: '狀態',
              value: filterStatus, onChange: setFilterStatus,
              options: [
                { value: 'open', label: '待處理' },
                { value: 'in_progress', label: '處理中' },
                { value: 'resolved', label: '已解決' },
                { value: 'closed', label: '已關閉' },
                { value: 'all', label: '全部' },
              ],
            },
          ]}
          toolbarChildren={
            <button
              onClick={load}
              className="h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              重新整理
            </button>
          }
          expandedIds={expandedIds}
          onExpandChange={setExpandedIds}
          renderExpanded={t => (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-6 text-[13px]">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">聯絡資訊</p>
                  <p className="text-neutral-700">{realEmail(t.email) || '—'}</p>
                  <p className="text-neutral-500">{t.phone}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">代幣餘額</p>
                  <p className="font-mono text-neutral-700">{t.user?.tokens?.toLocaleString() ?? '—'}</p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">問題內容</p>
                <p className="whitespace-pre-wrap rounded-lg border border-neutral-200 bg-white px-4 py-3 text-[13px] leading-relaxed text-neutral-700">{t.content}</p>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">內部備註</p>
                <Textarea
                  rows={2}
                  value={notes[t.id] ?? (t.admin_note || '')}
                  onChange={e => setNotes(n => ({ ...n, [t.id]: e.target.value }))}
                  placeholder="填寫處理記錄…" className="resize-none text-[13px] text-neutral-800"
                  onClick={e => e.stopPropagation()}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {t.status === 'open' && (
                  <button
                    onClick={e => { e.stopPropagation(); update(t.id, { status: 'in_progress', admin_note: notes[t.id] ?? t.admin_note }) }}
                    disabled={saving === t.id}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-primary disabled:opacity-50"
                  >
                    標為處理中
                  </button>
                )}
                {(t.status === 'open' || t.status === 'in_progress') && (
                  <button
                    onClick={e => { e.stopPropagation(); update(t.id, { status: 'resolved', admin_note: notes[t.id] ?? t.admin_note }) }}
                    disabled={saving === t.id}
                    className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                  >
                    標為已解決
                  </button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); update(t.id, { status: 'closed', admin_note: notes[t.id] ?? t.admin_note }) }}
                  disabled={saving === t.id}
                  className="rounded-lg bg-neutral-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-neutral-600 disabled:opacity-50"
                >
                  關閉工單
                </button>
                <button
                  onClick={e => { e.stopPropagation(); update(t.id, { admin_note: notes[t.id] ?? t.admin_note }) }}
                  disabled={saving === t.id}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-50"
                >
                  {saving === t.id ? '儲存中…' : '儲存備註'}
                </button>
              </div>
            </div>
          )}
        />
      </div>
    </AdminLayout>
  )
}
