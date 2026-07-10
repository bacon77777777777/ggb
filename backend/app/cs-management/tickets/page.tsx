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
  open:        { label: '待處理', cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  in_progress: { label: '處理中', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  resolved:    { label: '已解決', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  closed:      { label: '已關閉', cls: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' },
}

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

  const fmtDate = (s: string) => new Date(s).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <AdminLayout pageTitle="客服工單" pageSubtitle="前台聯絡我們表單提交的問題">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Status filter */}
        <div className="flex gap-2">
          {(['open', 'in_progress', 'resolved', 'closed', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterStatus === s ? 'bg-primary text-white' : 'bg-white dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
            >
              {s === 'all' ? '全部' : STATUS_META[s].label}
            </button>
          ))}
          <button onClick={load} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700">重新整理</button>
        </div>

        {loading && <p className="text-sm text-neutral-400 py-8 text-center">載入中…</p>}

        {!loading && tickets.length === 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 p-10 text-center">
            <p className="text-sm text-neutral-400">目前沒有{filterStatus !== 'all' ? STATUS_META[filterStatus as keyof typeof STATUS_META]?.label : ''}工單</p>
          </div>
        )}

        <div className="space-y-2">
          {tickets.map(t => {
            const meta = STATUS_META[t.status]
            const isOpen = expanded === t.id
            return (
              <div key={t.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                >
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
                  <span className="text-[13px] font-bold text-neutral-900 dark:text-white shrink-0">{t.category}</span>
                  <span className="text-[12px] text-neutral-400 dark:text-neutral-500 truncate">{t.content}</span>
                  <span className="ml-auto text-[11px] text-neutral-400 dark:text-neutral-500 shrink-0">{fmtDate(t.created_at)}</span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-neutral-100 dark:border-neutral-800 space-y-3 pt-4">
                    <div className="grid grid-cols-2 gap-4 text-[12px]">
                      <div>
                        <p className="text-neutral-400 mb-0.5 uppercase tracking-widest font-bold text-[10px]">用戶</p>
                        <p className="text-neutral-800 dark:text-neutral-200">{t.user?.name || '—'}</p>
                        <p className="text-neutral-500">{t.user?.email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-neutral-400 mb-0.5 uppercase tracking-widest font-bold text-[10px]">聯絡方式</p>
                        <p className="text-neutral-800 dark:text-neutral-200">{t.email}</p>
                        <p className="text-neutral-500">{t.phone}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-neutral-400 mb-1 uppercase tracking-widest font-bold text-[10px]">問題內容</p>
                      <p className="text-[13px] text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3">{t.content}</p>
                    </div>

                    <div>
                      <p className="text-neutral-400 mb-1 uppercase tracking-widest font-bold text-[10px]">內部備註</p>
                      <textarea
                        rows={2}
                        value={notes[t.id] ?? (t.admin_note || '')}
                        onChange={e => setNotes(n => ({ ...n, [t.id]: e.target.value }))}
                        placeholder="填寫處理記錄…"
                        className="w-full px-3 py-2 text-[12px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {t.status === 'open' && (
                        <button onClick={() => update(t.id, { status: 'in_progress', admin_note: notes[t.id] ?? t.admin_note })} disabled={saving === t.id} className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
                          標為處理中
                        </button>
                      )}
                      {(t.status === 'open' || t.status === 'in_progress') && (
                        <button onClick={() => update(t.id, { status: 'resolved', admin_note: notes[t.id] ?? t.admin_note })} disabled={saving === t.id} className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors">
                          標為已解決
                        </button>
                      )}
                      <button onClick={() => update(t.id, { status: 'closed', admin_note: notes[t.id] ?? t.admin_note })} disabled={saving === t.id} className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-neutral-500 text-white hover:bg-neutral-600 disabled:opacity-50 transition-colors">
                        關閉工單
                      </button>
                      <button onClick={() => update(t.id, { admin_note: notes[t.id] ?? t.admin_note })} disabled={saving === t.id} className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors">
                        {saving === t.id ? '儲存中…' : '儲存備註'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AdminLayout>
  )
}
