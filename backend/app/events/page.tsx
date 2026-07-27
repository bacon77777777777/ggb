'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'
import Link from 'next/link'

interface Event {
  id: string
  slug: string
  title: string
  bg_color: string
  accent_color: string
  is_active: boolean
  start_at: string | null
  end_at: string | null
  created_at: string
}

const PRESETS = [
  { label: '暗金', bg: '#0a0610', accent: '#ffd24a' },
  { label: '暗紫', bg: '#0a0214', accent: '#c026d3' },
  { label: '暗紅', bg: '#0f0505', accent: '#ef4444' },
  { label: '暗藍', bg: '#020b18', accent: '#38bdf8' },
]

const EMPTY_FORM = { slug: '', title: '', bg_color: '#0a0610', accent_color: '#ffd24a', is_active: true, start_at: '', end_at: '' }

export default function EventsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/events')
      if (!res.ok) throw new Error()
      setItems(await res.json())
    } catch { toast('載入失敗', 'error') }
    finally { setIsLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleCreate = async () => {
    if (!form.slug.trim() || !form.title.trim()) { toast('請填寫 Slug 和標題', 'error'); return }
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, start_at: form.start_at || null, end_at: form.end_at || null }),
      })
      if (!res.ok) { const e = await res.json(); toast(e.error || '新增失敗', 'error'); return }
      toast('已新增', 'success')
      setIsModalOpen(false)
      setForm(EMPTY_FORM)
      fetchData()
    } catch { toast('新增失敗', 'error') }
    finally { setIsSaving(false) }
  }

  const toggleActive = async (item: Event) => {
    try {
      await fetch(`/api/admin/events/${item.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, is_active: !item.is_active }),
      })
      fetchData()
    } catch { toast('更新失敗', 'error') }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await fetch(`/api/admin/events/${deleteTarget.id}`, { method: 'DELETE' })
      toast('已刪除', 'success')
      setDeleteTarget(null)
      fetchData()
    } catch { toast('刪除失敗', 'error') }
  }

  return (
    <AdminLayout pageTitle="活動 LP 管理">
      <PageCard>
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-neutral-500">建立活動 Landing Page，前台路徑：/lp/[slug]</p>
          <button onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
            + 新增活動
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-neutral-400">載入中...</div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-neutral-400 text-sm">目前沒有活動</div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${item.is_active ? 'border-neutral-200 bg-white' : 'border-neutral-100 bg-neutral-50 opacity-60'}`}>
                {/* 色塊預覽 */}
                <div className="w-10 h-10 rounded-lg flex-none border border-neutral-200 overflow-hidden relative"
                  style={{ background: item.bg_color }}>
                  <div className="absolute inset-0 opacity-60 rounded-lg"
                    style={{ background: `radial-gradient(circle at 50% 30%, ${item.accent_color}55, transparent 70%)` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-neutral-900 truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="font-mono">/lp/{item.slug}</span>
                    {item.start_at && <span>· {formatDateTime(item.start_at)} 起</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(item)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${item.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                    {item.is_active ? '上架' : '下架'}
                  </button>
                  <Link href={`/events/${item.id}/edit`}
                    className="text-xs px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 font-semibold hover:bg-neutral-200 transition-colors">
                    編輯
                  </Link>
                  <button onClick={() => setDeleteTarget(item)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition-colors">
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {/* New Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-neutral-100">
              <h2 className="text-lg font-bold text-neutral-900">新增活動</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">活動標題</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="夏日轉蛋祭" className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Slug（網址）</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-400">/lp/</span>
                  <input type="text" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    placeholder="summer-gacha-2026" className="flex-1 px-3 py-2.5 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-2">主題色</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {PRESETS.map(p => (
                    <button key={p.label} onClick={() => setForm(f => ({ ...f, bg_color: p.bg, accent_color: p.accent }))}
                      className={`rounded-xl h-12 relative overflow-hidden border-2 transition-all ${form.bg_color === p.bg ? 'border-primary scale-105' : 'border-transparent'}`}
                      style={{ background: p.bg }}>
                      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 30%, ${p.accent}66, transparent 70%)` }} />
                      <span className="absolute bottom-1 left-0 right-0 text-center text-[10px] font-bold text-white/80">{p.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-neutral-400 mb-1">背景色</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.bg_color} onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <span className="text-xs font-mono text-neutral-500">{form.bg_color}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-neutral-400 mb-1">主色</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <span className="text-xs font-mono text-neutral-500">{form.accent_color}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5">開始時間</label>
                  <input type="datetime-local" value={form.start_at} onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5">結束時間</label>
                  <input type="datetime-local" value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors">取消</button>
              <button onClick={handleCreate} disabled={isSaving}
                className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60">
                {isSaving ? '建立中...' : '建立並編輯'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-neutral-900 mb-2">確認刪除</h2>
            <p className="text-sm text-neutral-600 mb-6">刪除「{deleteTarget.title}」及其所有 sections？不可復原。</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors">取消</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">刪除</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
