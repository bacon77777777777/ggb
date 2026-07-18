'use client'

import AdminLayout from '@/components/AdminLayout'
import Badge from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { useState, useEffect, useCallback } from 'react'
import SelectField from '@/components/ui/SelectField'

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
  const [showForm, setShowForm]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
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
    if (!confirm('確定刪除此筆情報？')) return
    await fetch(`/api/admin/competitor-posts?id=${id}`, { method: 'DELETE' })
    loadAll()
  }

  const latest = analyses[0]
  const activeWatchlist = watchlist.filter(w => w.status === 'active')
  const candidateWatchlist = watchlist.filter(w => w.status === 'candidate')

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

        {/* Tabs */}
        <div className="flex gap-1 border-b border-neutral-200">
          {(['report', 'posts'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t === 'report' ? `AI 情報週報（${analyses.length}）` : `原始情報（${posts.length}）`}
            </button>
          ))}
        </div>

        {loading ? (
          <CardSkeleton rows={5} />
        ) : tab === 'report' ? (
          <div className="space-y-4">
            {analyses.length === 0 ? (
              <div className="text-center py-12 text-neutral-400 text-sm">
                尚無 AI 分析報告。點擊「立即爬取分析」生成第一份週報。
              </div>
            ) : analyses.map(a => (
              <div key={a.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div
                  className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-neutral-50"
                  onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-neutral-400">
                      {new Date(a.created_at).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
                      {a.run_type === 'manual' ? '手動' : a.run_type === 'weekly' ? '週報' : a.run_type}
                    </span>
                    <span className="text-xs text-neutral-400">監控 {a.competitors_scraped} 家</span>
                    {a.anomalies?.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                        {a.anomalies.length} 個異常
                      </span>
                    )}
                  </div>
                  <span className="text-neutral-400 text-xs">{expandedId === a.id ? '▲' : '▼'}</span>
                </div>

                {expandedId === a.id && (
                  <div className="border-t border-neutral-100 px-5 py-4 space-y-4">
                    {a.report && (
                      <div>
                        <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">情報週報（LINE 推播版）</h4>
                        <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed bg-neutral-50 rounded-lg p-4">{a.report}</p>
                      </div>
                    )}
                    {(a.facts_layer || a.insight_layer || a.suggest_layer) && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {a.facts_layer && (
                          <div className="bg-primary rounded-lg p-3">
                            <h5 className="text-xs font-semibold text-primary mb-1">事實層</h5>
                            <p className="text-xs text-blue-800 leading-relaxed">{a.facts_layer}</p>
                          </div>
                        )}
                        {a.insight_layer && (
                          <div className="bg-amber-50 rounded-lg p-3">
                            <h5 className="text-xs font-semibold text-amber-700 mb-1">解讀層</h5>
                            <p className="text-xs text-amber-800 leading-relaxed">{a.insight_layer}</p>
                          </div>
                        )}
                        {a.suggest_layer && (
                          <div className="bg-green-50 rounded-lg p-3">
                            <h5 className="text-xs font-semibold text-green-700 mb-1">建議層</h5>
                            <p className="text-xs text-green-800 leading-relaxed">{a.suggest_layer}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {a.anomalies?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-red-500 mb-2">即時異常</h4>
                        {a.anomalies.map((an: any, i: number) => (
                          <div key={i} className="text-xs text-red-700 bg-red-50 rounded px-3 py-1.5 mb-1">{an.description}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => setShowForm(v => !v)}
                className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700"
              >
                + 新增情報
              </button>
            </div>

            {showForm && (
              <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
                <h3 className="font-semibold text-neutral-800">新增競品情報</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-500 block mb-1">競品名稱 *</label>
                    <input
                      className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                      placeholder="例：KujiFlip、SlimeToy"
                      value={form.competitor}
                      onChange={e => setForm(f => ({ ...f, competitor: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500 block mb-1">來源平台</label>
                    <SelectField value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                    >
                      <option value="">選擇平台</option>
                      {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </SelectField>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">內容 *（貼文文字、活動說明等）</label>
                  <textarea
                    className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                    rows={4}
                    placeholder="貼入競品貼文內容…"
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">原始連結（選填）</label>
                  <input
                    className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                    placeholder="https://…"
                    value={form.url}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={submitPost}
                    disabled={submitting}
                    className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    儲存
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50">
                    取消
                  </button>
                </div>
              </div>
            )}

            {posts.length === 0 ? (
              <div className="text-center py-12 text-neutral-400 text-sm">尚無情報記錄</div>
            ) : posts.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-neutral-800 text-sm">{p.competitor}</span>
                      {p.platform && (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700">{p.platform}</span>
                      )}
                      {p.added_by === 'market_intel_v2' && (
                        <Badge variant="primary">AI 爬取</Badge>
                      )}
                      <span className="text-xs text-neutral-400">
                        {new Date(p.created_at).toLocaleDateString('zh-TW')}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap line-clamp-4">{p.content}</p>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline break-all"
                      >
                        {p.url}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => removePost(p.id)}
                    className="text-xs text-neutral-400 hover:text-red-500 flex-shrink-0"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
