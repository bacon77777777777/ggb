'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useEffect, useCallback } from 'react'

interface CsTicket {
  id: string
  category: string
  email: string
  phone: string
  content: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  admin_note: string | null
  created_at: string
  user: { id: string; name: string; email: string; tokens: number } | null
}

const STATUS_META = {
  open:        { label: '待處理', cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  in_progress: { label: '處理中', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  resolved:    { label: '已解決', cls: 'bg-green-50 text-green-700 border border-green-200' },
  closed:      { label: '已關閉', cls: 'bg-neutral-100 text-neutral-500 border border-neutral-200' },
}

const STATUS_TABS = [
  { key: 'open', label: '待處理' },
  { key: 'in_progress', label: '處理中' },
  { key: 'resolved', label: '已解決' },
  { key: 'closed', label: '已關閉' },
  { key: 'all', label: '全部' },
] as const

export default function CsTicketsPage() {
  const [tickets, setTickets] = useState<CsTicket[]>([])
  const [filterStatus, setFilterStatus] = useState('open')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

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

  return (
    <AdminLayout pageTitle="客服工單">
      <div className="space-y-4">

        {/* Filter + Actions bar */}
        <div className="bg-white rounded-xl border border-neutral-200 px-4 py-3 flex items-center gap-2 flex-wrap">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filterStatus === tab.key
                  ? 'bg-primary text-white'
                  : 'text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={load}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold text-neutral-500 hover:bg-neutral-100 transition-colors"
          >
            重新整理
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">狀態</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">類型</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">用戶</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">問題摘要</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">時間</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">載入中…</td>
                </tr>
              )}
              {!loading && tickets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">
                    目前沒有{filterStatus !== 'all' ? STATUS_META[filterStatus as keyof typeof STATUS_META]?.label : ''}工單
                  </td>
                </tr>
              )}
              {tickets.map(t => {
                const meta = STATUS_META[t.status]
                const isOpen = expanded === t.id
                return (
                  <>
                    <tr
                      key={t.id}
                      className={`cursor-pointer transition-colors ${isOpen ? 'bg-neutral-50' : 'hover:bg-neutral-50'}`}
                      onClick={() => setExpanded(isOpen ? null : t.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-neutral-700 whitespace-nowrap">{t.category}</td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-neutral-800">{t.user?.name || '—'}</p>
                        <p className="text-[11px] text-neutral-400">{t.user?.email || '—'}</p>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-[13px] text-neutral-600 truncate">{t.content}</p>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-neutral-400 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-neutral-400">{isOpen ? '收起 ▲' : '展開 ▼'}</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${t.id}-detail`} className="bg-neutral-50">
                        <td colSpan={6} className="px-6 pb-5 pt-4">
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-6 text-[13px]">
                              <div>
                                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-1">聯絡資訊</p>
                                <p className="text-neutral-700">{t.email}</p>
                                <p className="text-neutral-500">{t.phone}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-1">代幣餘額</p>
                                <p className="text-neutral-700 font-mono">{t.user?.tokens?.toLocaleString() ?? '—'}</p>
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-1">問題內容</p>
                              <p className="text-[13px] text-neutral-700 whitespace-pre-wrap bg-white rounded-lg border border-neutral-200 px-4 py-3 leading-relaxed">{t.content}</p>
                            </div>

                            <div>
                              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-1">內部備註</p>
                              <textarea
                                rows={2}
                                value={notes[t.id] ?? (t.admin_note || '')}
                                onChange={e => setNotes(n => ({ ...n, [t.id]: e.target.value }))}
                                placeholder="填寫處理記錄…"
                                className="w-full px-3 py-2 text-[13px] rounded-lg border border-neutral-200 bg-white text-neutral-800 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                                onClick={e => e.stopPropagation()}
                              />
                            </div>

                            <div className="flex gap-2 flex-wrap">
                              {t.status === 'open' && (
                                <button
                                  onClick={e => { e.stopPropagation(); update(t.id, { status: 'in_progress', admin_note: notes[t.id] ?? t.admin_note }) }}
                                  disabled={saving === t.id}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                                >
                                  標為處理中
                                </button>
                              )}
                              {(t.status === 'open' || t.status === 'in_progress') && (
                                <button
                                  onClick={e => { e.stopPropagation(); update(t.id, { status: 'resolved', admin_note: notes[t.id] ?? t.admin_note }) }}
                                  disabled={saving === t.id}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
                                >
                                  標為已解決
                                </button>
                              )}
                              <button
                                onClick={e => { e.stopPropagation(); update(t.id, { status: 'closed', admin_note: notes[t.id] ?? t.admin_note }) }}
                                disabled={saving === t.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-500 text-white hover:bg-neutral-600 disabled:opacity-50 transition-colors"
                              >
                                關閉工單
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); update(t.id, { admin_note: notes[t.id] ?? t.admin_note }) }}
                                disabled={saving === t.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 transition-colors"
                              >
                                {saving === t.id ? '儲存中…' : '儲存備註'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>
    </AdminLayout>
  )
}
