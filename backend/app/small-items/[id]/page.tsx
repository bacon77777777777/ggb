'use client'

import AdminLayout from '@/components/AdminLayout'
import { useLog } from '@/contexts/LogContext'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import SelectField from '@/components/ui/SelectField'

export default function EditSmallItemPage() {
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams()
  const { addLog } = useLog()
  const itemId = params.id as string
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    image: null as File | null,
    imagePreview: '',
    category: '雜貨',
    description: '',
  })

  const categories = ['吊飾', '雜貨', '貼紙', '徽章', '文具', '卡片']

  useEffect(() => {
    const fetchItem = async () => {
      if (!itemId) return
      
      const res = await fetch(`/api/admin/small-items/${itemId}`, { method: 'GET' })
      if (!res.ok) return
      const payload = (await res.json()) as { item: any }
      const data = payload.item
      if (data) {
        setFormData({
          name: data.name,
          image: null,
          imagePreview: data.image_url,
          category: data.category,
          description: data.description || '',
        })
      }
    }
    
    fetchItem()
  }, [itemId])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData({
        ...formData,
        image: file,
        imagePreview: URL.createObjectURL(file)
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const uploadViaAdmin = async (file: File, fileName: string) => {
        const form = new FormData()
        form.append('file', file)
        form.append('bucket', 'products')
        form.append('path', fileName)
        const res = await fetch('/api/admin/upload', { method: 'POST', body: form })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error || '圖片上傳失敗')
        }
        const data = (await res.json()) as { publicUrl: string }
        return data.publicUrl
      }

      // 1. Upload Image if changed
      let imageUrl = formData.imagePreview
      if (formData.image) {
        const file = formData.image
        const fileExt = file.name.split('.').pop()
        const fileName = `small-item-${Date.now()}.${fileExt}`
        imageUrl = await uploadViaAdmin(file, fileName)
      }

      // 2. Update DB
      const res = await fetch(`/api/admin/small-items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          category: formData.category,
          description: formData.description,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '更新失敗')
      }

      addLog('編輯小物', '小物資源庫', `編輯小物「${formData.name}」`, 'success')
      router.push('/small-items')
    } catch (error) {
      console.error('Error updating small item:', error)
      toast('更新失敗，請重試', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminLayout
      pageTitle="編輯小物"
      breadcrumbs={[
        { label: '小物資源庫', href: '/small-items' },
        { label: '編輯小物', href: undefined }
      ]}
    >
      <div className="space-y-6">
        {/* 返回按鈕 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 bg-white border-2 border-neutral-200 rounded-full hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-neutral-200 p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              小物名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              placeholder="請輸入小物名稱"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              分類 <span className="text-red-500">*</span>
            </label>
            <SelectField
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              required
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              圖片 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-4">
              {formData.imagePreview && (
                <div className="relative w-32 h-32 bg-neutral-100 rounded-lg overflow-hidden border-2 border-neutral-200">
                  <img
                    src={formData.imagePreview}
                    alt="預覽"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full px-4 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-1.5 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              placeholder="請輸入小物描述（選填）"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-neutral-200">
            <button
              type="submit"
              className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium shadow-sm hover:shadow-md"
            >
              儲存
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
