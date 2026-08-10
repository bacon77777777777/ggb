'use client'

import { AdminLayout, ListTableCard, RowAction, type ListColumn } from '@/components'
import Badge from '@/components/ui/Badge'
import { useState, useEffect, useCallback } from 'react'
import SelectField from '@/components/ui/SelectField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Analysis {
  id: number
  run_date: string
  run_type: string
  competitors_scraped: number
  report: string | null
  facts_layer: string | null
  insight_layer: string | null
  suggest_layer: string | null
  anomalies: any[]
  created_at: string
}

interface Watchlist {
  id: number
  name: string
  url: string
  status: string
  discovered_by: string | null
  notes: string | null
  added_at: string | null
}

interface Post {
  id: number
  competitor: string
  platform: string | null
  content: string
  url: string | null
  added_by: string
  created_at: string
}

const PLATFORMS = ['IG', 'Threads', 'FB', 'YouTube', 'PTT', '蝦皮', '其他']

export default function CompetitorIntelPage() {
  const [tab, setTab]               = useState<'report' | 'posts'>('report')
  const [analyses, setAnalyses]     = useState<Analysis[]>([])
  const [watchlist, setWatchlist]   = useState<Watchlist[]>([])
  const [posts, setPosts]           = useState<Post[]>([])
  const [loading, setLoading]       = useState(false)
  const [triggering, setTriggering] = useState(false)
  const { confirm, dialogProps } = useConfirmDialog()
  const [showForm, setShowForm]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedReports, setExpandedReports] = useState<Set<string | number>>(new Set())
  const [expandedPosts, setExpandedPosts] = useState<Set<string | number>>(new Set())
  const [form, setForm]             = useState({ competitor: '', platform: '', content: '', url: '' })

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [aRes, wRes, pRes] = await Promise.all([
      fetch('/api/admin/market-intel'),
      fetch('/api/admin/market-intel?type=watchlist'),
      fetch('/api/admin/competitor-posts'),
    ])
    const [aData, wData, pData] = await Promise.all([aRes.json(), wRes.json(), pRes.json()])
    setAnalyses(Array.isArray(aData) ? aData : [])
    setWatchlist(Array.isArray(wData) ? wData : [])
    setPosts(Array.isArray(pData) ? pData : [])
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const triggerAnalysis = async () => {
    setTriggering(true)
    await fetch('/api/admin/market-intel', { method: 'POST' })
    await loadAll()
    setTriggering(false)
  }

  const submitPost = async () => {
    if (!form.competitor.trim() || !form.content.trim()) return
    setSubmitting(true)
    await fetch('/api/admin/competitor-posts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    setForm({ competitor: '', platform: '', content: '', url: '' })
    setShowForm(false)
    setSubmitting(false)
    loadAll()
  }

  const removePost = async (id: number) => {
    confirm({
      title: '確認操作',
      message: "確定刪除此筆情報？",
      onConfirm: async () => {
      await fetch(`/api/admin/competitor-posts?id=${id}`, { method: 'DELETE' })
      loadAll()
      },
    })
  }

  const latest = analyses[0]
  const activeWatchlist = watchlist.filter(w => w.status === 'active')
  const candidateWatchlist = watchlist.filter(w => w.status === 'candidate')

  const reportColumns: ListColumn<Analysis>[] = [
    {
      key: 'createdAt', label: '時間',
      className: 'font-mono',
      sortValue: a => new Date(a.created_at).getTime(),
      render: a => (
        <span className="text-xs text-neutral-500">
          {new Date(a.created_at).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'runType', label: '類型',
      sortValue: a => a.run_type,
      render: a => (
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
          {a.run_type === 'manual' ? '手動' : a.run_type === 'weekly' ? '週報' : a.run_type}
        </span>
      ),
    },
    {
      key: 'scraped', label: '監控家數',
      className: 'tabular-nums',
      sortValue: a => a.competitors_scraped,
      render: a => <>{a.competitors_scraped}</>,
    },
    {
      key: 'anomalies', label: '異常',
      sortValue: a => a.anomalies?.length ?? 0,
      render: a => (a.anomalies?.length ?? 0) > 0
        ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">{a.anomalies.length} 個異常</span>
        : <span className="text-xs text-neutral-300">—</span>,
    },
    {
      key: 'preview', label: '報告摘要',
      render: a => <p className="max-w-md truncate text-[13px] text-neutral-600">{a.report ?? '—'}</p>,
    },
  ]

  const postColumns: ListColumn<Post>[] = [
    {
      key: 'competitor', label: '競品',
      sortValue: pp => pp.competitor,
      render: pp => <span className="text-sm font-semibold text-neutral-800">{pp.competitor}</span>,
    },
    {
      key: 'platform', label: '平台',
      sortValue: pp => pp.platform ?? '',
      render: pp => pp.platform
        ? <span className="inline-flex rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{pp.platform}</span>
        : <span className="text-xs text-neutral-300">—</span>,
    },
    {
      key: 'source', label: '來源',
      sortValue: pp => pp.added_by,
      render: pp => pp.added_by === 'market_intel_v2'
        ? <Badge variant="primary">AI 爬取</Badge>
        : <span className="text-xs text-neutral-400">手動</span>,
    },
    {
      key: 'preview', label: '內容摘要',
      render: pp => <p className="max-w-md truncate text-[13px] text-neutral-600">{pp.content}</p>,
    },
    {
      key: 'createdAt', label: '時間',
      className: 'font-mono',
      sortValue: pp => new Date(pp.created_at).getTime(),
      render: pp => <span className="text-xs text-neutral-400">{new Date(pp.created_at).toLocaleDateString('zh-TW')}</span>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: pp => <RowAction tone="danger" onClick={() => removePost(pp.id)}>刪除</RowAction>,
    },
  ]

  return (
    <AdminLayout pageTitle="競品情報">
      <div className="space-y-5">

        {/* 監控清單 */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-neutral-800 text-sm">監控清單（{activeWatchlist.length} 家）</h3>
            <button
              onClick={triggerAnalysis}
              disabled={triggering}
              className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {triggering ? '分析中…' : '立即爬取分析'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeWatchlist.map(w => (
              <a
                key={w.id}
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-100"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                {w.name}
              </a>
            ))}
            {candidateWatchlist.map(w => (
              <span
                key={w.id}
                title={w.notes ?? undefined}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-neutral-50 text-neutral-500 border border-neutral-200"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                {w.name}（候選）
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            每週日 11:30 自動爬取。市場情報 AI 深度分析結果推至 LINE 群組。
          </p>
        </div>

        {/* Tabs —— 輪播圖管理同款 pill 頁籤 */}
        <div className="flex w-fit gap-1 rounded-lg bg-neutral-100 p-1">
          {(['report', 'posts'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t === 'report' ? `AI 情報週報（${analyses.length}）` : `原始情報（${posts.length}）`}
            </button>
          ))}
        </div>

        {tab === 'report' ? (
          <ListTableCard
            pageKey="competitor-report"
            data={analyses}
            columns={reportColumns}
            keyField="id"
            isLoading={loading}
            emptyMessage="尚無 AI 分析報告。點擊「立即爬取分析」生成第一份週報。"
            defaultSortField="createdAt"
            defaultSortDirection="desc"
            expandedIds={expandedReports}
            onExpandChange={setExpandedReports}
            renderExpanded={a => (
              <div className="space-y-4">
                {a.report && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">情報週報（LINE 推播版）</h4>
                    <p className="whitespace-pre-wrap rounded-lg bg-white p-4 text-sm leading-relaxed text-neutral-700">{a.report}</p>
                  </div>
                )}
                {(a.facts_layer || a.insight_layer || a.suggest_layer) && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {a.facts_layer && (
                      <div className="rounded-lg bg-blue-50 p-3">
                        <h5 className="mb-1 text-xs font-semibold text-primary">事實層</h5>
                        <p className="text-xs leading-relaxed text-blue-800">{a.facts_layer}</p>
                      </div>
                    )}
                    {a.insight_layer && (
                      <div className="rounded-lg bg-amber-50 p-3">
                        <h5 className="mb-1 text-xs font-semibold text-amber-700">解讀層</h5>
                        <p className="text-xs leading-relaxed text-amber-800">{a.insight_layer}</p>
                      </div>
                    )}
                    {a.suggest_layer && (
                      <div className="rounded-lg bg-green-50 p-3">
                        <h5 className="mb-1 text-xs font-semibold text-green-700">建議層</h5>
                        <p className="text-xs leading-relaxed text-green-800">{a.suggest_layer}</p>
                      </div>
                    )}
                  </div>
                )}
                {a.anomalies?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold text-red-500">即時異常</h4>
                    {a.anomalies.map((an: any, i: number) => (
                      <div key={i} className="mb-1 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">{an.description}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          />
        ) : (
          <div className="space-y-3">
            {showForm && (
              <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
                <h3 className="font-semibold text-neutral-800">新增競品情報</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">競品名稱 *</label>
                    <Input
                      placeholder="例：KujiFlip、SlimeToy"
                      value={form.competitor}
                      onChange={e => setForm(f => ({ ...f, competitor: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">來源平台</label>
                    <SelectField value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
                      <option value="">選擇平台</option>
                      {PLATFORMS.map(pf => <option key={pf} value={pf}>{pf}</option>)}
                    </SelectField>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">內容 *（貼文文字、活動說明等）</label>
                  <Textarea
                    rows={4}
                    placeholder="貼入競品貼文內容…"
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">來源連結</label>
                  <Input
                    placeholder="https://..."
                    value={form.url}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={submitPost}
                    disabled={submitting}
                    className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    儲存
                  </button>
                  <button onClick={() => setShowForm(false)} className="rounded-lg border border-neutral-200 px-4 py-1.5 text-sm hover:bg-neutral-50">
                    取消
                  </button>
                </div>
              </div>
            )}

            <ListTableCard
              pageKey="competitor-posts"
              data={posts}
              columns={postColumns}
              keyField="id"
              isLoading={loading}
              emptyMessage="尚無情報記錄"
              defaultSortField="createdAt"
              defaultSortDirection="desc"
              addButtonText="+ 新增情報"
              onAddClick={() => setShowForm(v => !v)}
              expandedIds={expandedPosts}
              onExpandChange={setExpandedPosts}
              renderExpanded={pp => (
                <div className="space-y-2">
                  <p className="whitespace-pre-wrap rounded-lg bg-white px-4 py-3 text-sm leading-relaxed text-neutral-700">{pp.content}</p>
                  {pp.url && (
                    <a href={pp.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-primary hover:underline">
                      {pp.url}
                    </a>
                  )}
                </div>
              )}
            />
          </div>
        )}
      </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
