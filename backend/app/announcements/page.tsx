'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import SelectField from '@/components/ui/SelectField'

interface Announcement {
  id: string
  title: string
  content: string
  category: '消息' | '活動' | '系統'
  is_active: boolean
  is_pinned: boolean
  published_at: string
  created_at: string
  updated_at: string
}

const CATEGORIES = ['消息', '活動', '系統'] as const

const CATEGORY_COLORS: Record<string, string> = {
  消息: 'bg-blue-100 text-primary',
  活動: 'bg-green-100 text-green-700',
  系統: 'bg-neutral-100 text-neutral-600',
}

const EMPTY_FORM = {
  title: '',
  content: '',
  category: '消息' as Announcement['category'],
  is_active: true,
  is_pinned: false,
  published_at: new Date().toISOString().slice(0, 16),
}

export default function AnnouncementsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/announcements')
      if (!res.ok) throw new Error()
      setItems(await res.json())
    } catch {
      toast('載入失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, published_at: new Date().toISOString().slice(0, 16) })
    setIsModalOpen(true)
  }

  const openEdit = (item: Announcement) => {
    setEditing(item)
    setForm({
      title: item.title,
      content: item.content,
      category: item.category,
      is_active: item.is_active,
      is_pinned: item.is_pinned,
      published_at: new Date(item.published_at).toISOString().slice(0, 16),
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { toast('請填寫標題', 'error'); return }
    setIsSaving(true)
    try {
      const payload = {
        ...form,
        published_at: new Date(form.published_at).toISOString(),
      }
      const res = editing
        ? await fetch(`/api/admin/announcements/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

      if (!res.ok) throw new Error()
      toast(editing ? '已更新' : '已新增', 'success')
      setIsModalOpen(false)
      fetchData()
    } catch {
      toast('儲存失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/admin/announcements/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast('已刪除', 'success')
      setDeleteTarget(null)
      fetchData()
    } catch {
      toast('刪除失敗', 'error')
    }
  }

  const toggleActive = async (item: Announcement) => {
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, is_active: !item.is_active }),
      })
      if (!res.ok) throw new Error()
      fetchData()
    } catch {
      toast('更新失敗', 'error')
    }
  }

  return (
    <AdminLayout pageTitle="公告管理">
      <PageCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-neutral-500">前台玩家可見的平台公告，支援置頂與分類</p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            + 新增公告
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-neutral-400">載入中...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p>目前沒有公告</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${item.is_active ? 'border-neutral-200 bg-white' : 'border-neutral-100 bg-neutral-50 opacity-60'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {item.is_pinned && (
                      <span className="text-xs font-bold text-red-500">📌 置頂</span>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category]}`}>
                      {item.category}
                    </span>
                    <span className="text-xs text-neutral-400">{formatDateTime(item.published_at)}</span>
                  </div>
                  <p className="text-sm font-semibold text-neutral-900 truncate">{item.title}</p>
                  {item.content && (
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{item.content}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(item)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${item.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                  >
                    {item.is_active ? '上架' : '下架'}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 font-semibold hover:bg-neutral-200 transition-colors"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => setDeleteTarget(item)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition-colors"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {/* Edit/Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 pt-6 pb-4 border-b border-neutral-100">
              <h2 className="text-lg font-bold text-neutral-900">
                {editing ? '編輯公告' : '新增公告'}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">標題</label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="公告標題" className="rounded-xl"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5">分類</label>
                  <SelectField
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as Announcement['category'] }))} className="rounded-xl"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </SelectField>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5">發布時間</label>
                  <Input
                    type="datetime-local"
                    value={form.published_at}
                    onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))} className="rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">內容</label>
                <Textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="公告內容（支援換行，網址會自動轉為連結）"
                  rows={6} className="rounded-xl resize-none"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-semibold text-neutral-700">立即上架</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_pinned}
                    onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-semibold text-neutral-700">置頂</span>
                </label>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {isSaving ? '儲存中...' : '儲存'}
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
            <p className="text-sm text-neutral-600 mb-6">
              確定要刪除「{deleteTarget.title}」嗎？此操作不可復原。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
