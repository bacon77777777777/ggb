'use client'

import { AdminLayout, PageCard, Modal, DataTable, type Column } from '@/components'
import { Switch } from '@/components/ui'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'

interface Banner {
  id: number
  name: string
  image_url: string
  link_url: string
  sort_order: number
  is_active: boolean
  page: string
  created_at: string
}

const EMPTY_FORM = {
  name: '',
  image_url: '',
  link_url: '',
  sort_order: 0,
  is_active: true,
  page: 'challenge' as const,
  imageFile: null as File | null,
  imagePreview: '',
}

export default function ChallengeBannersPage() {
  const { toast } = useToast()
  const [banners, setBanners] = useState<Banner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const savingLock = useRef(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null)
  const [formData, setFormData] = useState(EMPTY_FORM)

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .eq('page', 'challenge')
        .order('sort_order', { ascending: true })
      if (error) throw error
      setBanners(data || [])
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner)
    setFormData({ ...EMPTY_FORM, name: banner.name || '', image_url: banner.image_url, link_url: banner.link_url || '', sort_order: banner.sort_order, is_active: banner.is_active, imagePreview: banner.image_url })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingBanner(null)
    setFormData(EMPTY_FORM)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除此輪播圖嗎？')) return
    try {
      const res = await fetch(`/api/banners/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || '刪除失敗')
      fetchData()
    } catch (error: any) {
      toast(error.message || '刪除失敗', 'error')
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData(prev => ({ ...prev, imageFile: file, imagePreview: URL.createObjectURL(file) }))
    }
  }

  const handleSubmit = async () => {
    if (savingLock.current) return
    if (!formData.name) { toast('請輸入名稱', 'warning'); return }
    savingLock.current = true
    setIsSaving(true)
    try {
      let finalImageUrl = formData.image_url

      if (formData.imageFile) {
        const file = formData.imageFile
        const fileExt = (file.name.split('.').pop() || '').trim() || 'jpg'
        const fileName = `banner-${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExt}`
        const uploadForm = new FormData()
        uploadForm.append('file', file)
        uploadForm.append('bucket', 'banners')
        uploadForm.append('path', fileName)
        const uploadRes = await fetch('/api/admin/upload', { method: 'POST', body: uploadForm })
        const uploadJson = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) throw new Error(uploadJson?.error || '圖片上傳失敗')
        finalImageUrl = String(uploadJson?.publicUrl || '')
      } else if (!finalImageUrl && !formData.imagePreview) {
        toast('請上傳圖片', 'warning'); return
      }

      const payload = { name: formData.name, image_url: finalImageUrl || formData.imagePreview, link_url: formData.link_url, sort_order: formData.sort_order, is_active: formData.is_active, page: 'challenge' }

      if (editingBanner) {
        const res = await fetch(`/api/banners/${editingBanner.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error((await res.json()).error || '更新失敗')
      } else {
        const res = await fetch('/api/banners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error((await res.json()).error || '新增失敗')
      }

      setIsModalOpen(false)
      fetchData()
    } catch (error: any) {
      toast(error.message || '儲存失敗', 'error')
    } finally {
      savingLock.current = false
      setIsSaving(false)
    }
  }

  const columns: Column<Banner>[] = [
    { key: 'name', label: '名稱', sortable: true, className: 'font-medium' },
    {
      key: 'image_url', label: '圖片',
      render: (item) => (
        <div className="relative w-32 h-16 bg-neutral-100 rounded overflow-hidden border border-neutral-200">
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        </div>
      )
    },
    {
      key: 'link_url', label: '連結',
      render: (item) => item.link_url
        ? <a href={item.link_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px] block">{item.link_url}</a>
        : <span className="text-neutral-400">-</span>
    },
    { key: 'sort_order', label: '排序', sortable: true, className: 'font-mono' },
    {
      key: 'is_active', label: '狀態',
      render: (item) => (
        <Switch checked={item.is_active} onCheckedChange={async (checked) => {
          setBanners(prev => prev.map(b => b.id === item.id ? { ...b, is_active: checked } : b))
          try {
            const res = await fetch(`/api/banners/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: checked }) })
            if (!res.ok) throw new Error()
          } catch {
            toast('更新失敗', 'error')
            setBanners(prev => prev.map(b => b.id === item.id ? { ...b, is_active: !checked } : b))
          }
        }} />
      )
    },
    { key: 'created_at', label: '建立時間', render: (item) => <span className="text-neutral-500 text-sm">{formatDateTime(item.created_at)}</span> },
    {
      key: 'actions', label: '操作',
      render: (item) => (
        <div className="flex items-center gap-2">
          <button onClick={() => handleEdit(item)} className="text-primary text-sm font-medium">編輯</button>
          <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
        </div>
      )
    },
  ]

  return (
    <AdminLayout pageTitle="挑戰頁輪播圖">
      <div className="space-y-6">
        <div className="flex justify-end">
          <button onClick={handleAdd} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">
            + 新增輪播圖
          </button>
        </div>

        <PageCard>
          <DataTable data={banners} columns={columns} keyField="id" emptyMessage="尚無挑戰頁輪播圖" />
        </PageCard>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingBanner ? '編輯輪播圖' : '新增輪播圖'}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">名稱 <span className="text-red-500">*</span></label>
              <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" placeholder="請輸入輪播圖名稱" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">圖片 <span className="text-red-500">*</span></label>
              <input type="file" accept="image/*" onChange={handleImageChange} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
              {formData.imagePreview && (
                <div className="relative w-full h-40 bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200 mt-2">
                  <img src={formData.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">連結網址（選填）</label>
              <input type="text" value={formData.link_url} onChange={e => setFormData(p => ({ ...p, link_url: e.target.value }))} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">排序</label>
                <input type="number" value={formData.sort_order} onChange={e => setFormData(p => ({ ...p, sort_order: Number(e.target.value) }))} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
              </div>
              <div className="flex items-center pt-6">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData(p => ({ ...p, is_active: e.target.checked }))} className="rounded text-primary focus:ring-primary" />
                  <span className="text-sm font-medium text-neutral-700">啟用</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t mt-6">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-neutral-50">取消</button>
              <button onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-60 min-w-[72px] text-center">
                {isSaving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  )
}
