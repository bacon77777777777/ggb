'use client'

import { AdminLayout, ListTableCard, type ListColumn } from '@/components'
import Badge from '@/components/ui/Badge'
import { useState, useEffect, useCallback } from 'react'
import SelectField from '@/components/ui/SelectField'

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
  approved:  { label: '已確認', cls: 'bg-blue-100 text-primary border-blue-200' },
  published: { label: '已發布', cls: 'bg-green-100 text-green-700 border-green-200' },
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

  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(new Set())

  const filtered = drafts.filter(d => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return d.text_content.toLowerCase().includes(q)
      || (d.product_name ?? '').toLowerCase().includes(q)
  })

  const columns: ListColumn<ContentDraft>[] = [
    {
      key: 'date', label: '日期',
      className: 'font-mono',
      sortValue: d => d.draft_date,
      render: d => <>{d.draft_date}</>,
    },
    {
      key: 'product', label: '商品',
      sortValue: d => d.product_name ?? '',
      render: d => <span className="text-[13px] text-neutral-700">{d.product_name || '—'}</span>,
    },
    {
      key: 'style', label: '風格',
      sortValue: d => d.style,
      render: d => (
        <span className="text-sm font-semibold text-neutral-700">
          {STYLE_LABEL[d.style].emoji} {STYLE_LABEL[d.style].label}
        </span>
      ),
    },
    {
      key: 'status', label: '狀態',
      sortValue: d => d.status,
      render: d => <Badge status={d.status}>{STATUS_LABEL[d.status].label}</Badge>,
    },
    {
      key: 'preview', label: '文案摘要',
      render: d => <p className="max-w-md truncate text-[13px] text-neutral-600">{d.text_content}</p>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: d => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => copyText(d.text_content, d.id)}
            className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
          >
            {copied === d.id ? '已複製' : '複製文字'}
          </button>
          <SelectField
            value={d.status}
            disabled={updating === d.id}
            onChange={e => updateStatus(d.id, e.target.value as DraftStatus)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            {STATUS_OPTIONS.map(st => (
              <option key={st} value={st}>{STATUS_LABEL[st].label}</option>
            ))}
          </SelectField>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="AI 文案草稿">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {generateMsg && <span className="text-sm text-neutral-600">{generateMsg}</span>}
          <button
            onClick={triggerGenerate}
            disabled={generating}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? '生成中…' : '立即生成今日草稿'}
          </button>
        </div>

        <ListTableCard
          pageKey="content-drafts"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={loading}
          emptyMessage="目前沒有草稿，點選「立即生成」建立今日草稿"
          defaultSortField="date"
          defaultSortDirection="desc"
          searchPlaceholder="搜尋文案內容或商品..."
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'status', label: '狀態',
              value: filterStatus || 'all',
              onChange: v => setFilterStatus(v === 'all' ? '' : v),
              options: [
                { value: 'all', label: `全部（${total}）` },
                ...STATUS_OPTIONS.map(st => ({ value: st, label: STATUS_LABEL[st].label })),
              ],
            },
          ]}
          expandedIds={expandedIds}
          onExpandChange={setExpandedIds}
          renderExpanded={d => (
            <pre className="whitespace-pre-wrap rounded-lg bg-white px-4 py-3 font-sans text-sm leading-relaxed text-neutral-700">
              {d.text_content}
            </pre>
          )}
        />
      </div>
    </AdminLayout>
  )
}
