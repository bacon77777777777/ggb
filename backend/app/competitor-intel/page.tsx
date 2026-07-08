'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useEffect, useCallback } from 'react'

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
  const [posts, setPosts]           = useState<Post[]>([])
  const [loading, setLoading]       = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm]             = useState({ competitor: '', platform: '', content: '', url: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/admin/competitor-posts')
    const data = await res.json()
    setPosts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!form.competitor.trim() || !form.content.trim()) return
    setSubmitting(true)
    await fetch('/api/admin/competitor-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ competitor: '', platform: '', content: '', url: '' })
    setShowForm(false)
    setSubmitting(false)
    load()
  }

  const remove = async (id: number) => {
    if (!confirm('確定刪除此筆情報？')) return
    await fetch(`/api/admin/competitor-posts?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <AdminLayout pageTitle="競品情報">
      <div className="space-y-4">

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-sm text-blue-800">
          將競品的社群貼文、活動資訊貼入此處。每週一 <strong>10:00</strong> 自動由 AI 分析過去 7 天的情報，結果推送到 LINE 群組。
        </div>

        {/* 新增按鈕 */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700"
          >
            + 新增情報
          </button>
        </div>

        {/* 新增表單 */}
        {showForm && (
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h3 className="font-semibold text-neutral-800">新增競品情報</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">競品名稱 *</label>
                <input
                  className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                  placeholder="例：扭蛋王、扭轉星球"
                  value={form.competitor}
                  onChange={e => setForm(f => ({ ...f, competitor: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">來源平台</label>
                <select
                  className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white"
                  value={form.platform}
                  onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                >
                  <option value="">選擇平台</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">內容 * （貼文文字、活動說明等）</label>
              <textarea
                className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                rows={5}
                placeholder="貼入競品貼文內容..."
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">原始連結（選填）</label>
              <input
                className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                placeholder="https://..."
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={submit}
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

        {/* 情報列表 */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">載入中...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">尚無競品情報，點擊右上方「新增情報」開始記錄。</div>
        ) : (
          <div className="space-y-3">
            {posts.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-neutral-800">{p.competitor}</span>
                      {p.platform && (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700">
                          {p.platform}
                        </span>
                      )}
                      <span className="text-xs text-neutral-400">
                        {new Date(p.created_at).toLocaleDateString('zh-TW')}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap line-clamp-4">{p.content}</p>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline break-all">
                        {p.url}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => remove(p.id)}
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
