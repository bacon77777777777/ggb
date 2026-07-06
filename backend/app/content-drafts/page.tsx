'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useEffect, useCallback } from 'react'

type DraftStatus = 'pending' | 'approved' | 'published' | 'archived'
type DraftStyle  = 'promotional' | 'story' | 'urgency'

interface ContentDraft {
  id: string
  draft_date: string
  product_id: number | null
  product_name: string | null
  style: DraftStyle
  text_content: string
  image_url: string | null
  status: DraftStatus
  created_at: string
}

const STATUS_LABEL: Record<DraftStatus, { label: string; cls: string }> = {
  pending:   { label: '待確認', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved:  { label: '已確認', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  published: { label: '已發布', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  archived:  { label: '已棄用', cls: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
}

const STYLE_LABEL: Record<DraftStyle, { label: string; emoji: string }> = {
  promotional: { label: '促銷型', emoji: '🔥' },
  story:       { label: '故事型', emoji: '✨' },
  urgency:     { label: '緊迫感型', emoji: '⚡' },
}

const STATUS_OPTIONS: DraftStatus[] = ['pending', 'approved', 'published', 'archived']

export default function ContentDraftsPage() {
  const [drafts, setDrafts] = useState<ContentDraft[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [copied, setCopied] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateMsg, setGenerateMsg] = useState('')

  const fetchDrafts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/admin/content-drafts?${params}`)
    if (res.ok) {
      const data = await res.json()
      setDrafts(data.drafts ?? [])
      setTotal(data.total ?? 0)
    }
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { fetchDrafts() }, [fetchDrafts])

  async function updateStatus(id: string, status: DraftStatus) {
    setUpdating(id)
    await fetch(`/api/admin/content-drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setUpdating(null)
    fetchDrafts()
  }

  async function copyText(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function triggerGenerate() {
    setGenerating(true)
    setGenerateMsg('')
    const res = await fetch('/api/admin/trigger/generate-content', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setGenerateMsg(`✓ 已生成 ${data.productName} 的 ${data.count} 則草稿`)
      fetchDrafts()
    } else {
      setGenerateMsg(`✗ ${data.error ?? '生成失敗'}`)
    }
    setGenerating(false)
  }

  const grouped = drafts.reduce<Record<string, ContentDraft[]>>((acc, d) => {
    const key = d.draft_date
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})

  return (
    <AdminLayout pageTitle="AI 文案草稿" breadcrumbs={[{ label: 'AI 文案草稿', href: '/content-drafts' }]}>
      <div className="space-y-4">
        {/* 操作列 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">狀態篩選：</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">全部（{total}）</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{STATUS_LABEL[s].label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            {generateMsg && (
              <span className="text-sm text-neutral-600">{generateMsg}</span>
            )}
            <button
              onClick={triggerGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              立即生成今日草稿
            </button>
          </div>
        </div>

        {/* 草稿列表（依日期分組） */}
        {loading ? (
          <div className="flex justify-center py-16 text-neutral-400 text-sm">載入中…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm">目前沒有草稿，點選「立即生成」建立今日草稿</span>
          </div>
        ) : (
          Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, items]) => (
              <div key={date} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                  <span className="text-sm font-semibold text-neutral-700">{date}</span>
                  {items[0]?.product_name && (
                    <span className="ml-3 text-xs text-neutral-500">商品：{items[0].product_name}</span>
                  )}
                </div>
                <div className="divide-y divide-neutral-100">
                  {items.map(draft => {
                    const s = STYLE_LABEL[draft.style]
                    const st = STATUS_LABEL[draft.status]
                    return (
                      <div key={draft.id} className="flex gap-4 p-5">
                        {/* 內容 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-neutral-700">{s.emoji} {s.label}</span>
                            <span className={`px-2 py-0.5 text-xs rounded border ${st.cls}`}>{st.label}</span>
                          </div>
                          <pre className="text-sm text-neutral-700 whitespace-pre-wrap font-sans leading-relaxed bg-neutral-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                            {draft.text_content}
                          </pre>
                        </div>

                        {/* 操作 */}
                        <div className="flex-shrink-0 flex flex-col gap-2">
                          {/* 複製文字 */}
                          <button
                            onClick={() => copyText(draft.text_content, draft.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                          >
                            {copied === draft.id ? (
                              <><svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> 已複製</>
                            ) : (
                              <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> 複製文字</>
                            )}
                          </button>
                          {/* 狀態切換 */}
                          <select
                            value={draft.status}
                            disabled={updating === draft.id}
                            onChange={e => updateStatus(draft.id, e.target.value as DraftStatus)}
                            className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{STATUS_LABEL[s].label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
        )}
      </div>
    </AdminLayout>
  )
}
