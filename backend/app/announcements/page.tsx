'use client'

import { AdminLayout, ListTableCard, RowAction, type ListColumn } from '@/components'
import Switch from '@/components/ui/Switch'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCat, setFilterCat] = useState('all')

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

  const filtered = items.filter(a => {
    if (filterStatus !== 'all' && (filterStatus === 'active') !== a.is_active) return false
    if (filterCat !== 'all' && a.category !== filterCat) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!a.title.toLowerCase().includes(q) && !(a.content ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

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

  /** 上架 Switch 直接切換：樂觀更新，失敗滾回 */
  const toggleActive = async (item: Announcement, next: boolean) => {
    setItems(prev => prev.map(a => a.id === item.id ? { ...a, is_active: next } : a))
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, is_active: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setItems(prev => prev.map(a => a.id === item.id ? { ...a, is_active: !next } : a))
      toast('更新失敗', 'error')
    }
  }

  const columns: ListColumn<Announcement>[] = [
    {
      key: 'title', label: '標題',
      sortValue: a => a.title,
      render: a => (
        <div className="max-w-xs whitespace-normal">
          <p className="text-sm font-semibold text-neutral-900 line-clamp-1">{a.title}</p>
          {a.content && (
            <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{a.content}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category', label: '分類',
      sortValue: a => a.category,
      render: a => (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[a.category]}`}>
          {a.category}
        </span>
      ),
    },
    {
      key: 'pinned', label: '置頂',
      sortValue: a => (a.is_pinned ? 1 : 0),
      render: a => a.is_pinned
        ? <span className="text-xs font-bold text-red-500">📌 置頂</span>
        : <span className="text-neutral-300">—</span>,
    },
    {
      key: 'status', label: '上架',
      sortValue: a => (a.is_active ? 1 : 0),
      render: a => (
        <Switch checked={a.is_active} onCheckedChange={next => void toggleActive(a, next)} />
      ),
    },
    {
      key: 'publishedAt', label: '發布時間',
      sortValue: a => new Date(a.published_at).getTime(),
      className: 'font-mono',
      render: a => <>{formatDateTime(a.published_at)}</>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: a => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => openEdit(a)}>編輯</RowAction>
          <RowAction tone="danger" onClick={() => setDeleteTarget(a)}>刪除</RowAction>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="公告管理">
      <div className="space-y-6">
        <ListTableCard
          pageKey="announcements"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage={items.length === 0 ? '目前沒有公告' : '沒有符合條件的公告'}
          searchPlaceholder="搜尋公告標題、內容..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增公告"
          onAddClick={openAdd}
          filters={[
            {
              key: 'status', label: '狀態',
              value: filterStatus, onChange: setFilterStatus,
              options: [
                { value: 'all', label: '全部狀態' },
                { value: 'active', label: '上架中' },
                { value: 'inactive', label: '已下架' },
              ],
            },
            {
              key: 'category', label: '分類',
              value: filterCat, onChange: setFilterCat,
              options: [
                { value: 'all', label: '全部分類' },
                ...CATEGORIES.map(c => ({ value: c, label: c })),
              ],
            },
          ]}
        />
      </div>

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
