'use client'

import { AdminLayout, Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import PopupPanel from './PopupPanel'
import ScheduleFields from '@/components/ScheduleFields'
import { Switch } from '@/components/ui'
import SelectField from '@/components/ui/SelectField'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

const PAGE_TABS = [
  { value: 'home', label: '首頁輪播圖' },
  { value: 'challenge', label: '挑戰頁輪播圖' },
  { value: 'popup', label: '首頁彈窗' },
]

interface Banner {
  id: number
  name: string
  image_url: string
  link_url: string
  sort_order: number
  is_active: boolean
  page: string
  created_at: string
  start_at: string | null
  end_at: string | null
  event_id: string | null
}

interface PromoOption {
  id: number
  name: string
  is_active: boolean
}

export default function BannersPage() {
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()
  const [banners, setBanners] = useState<Banner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const savingLock = useRef(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null)
  const [activeTab, setActiveTab] = useState<'home' | 'challenge' | 'popup'>('home')
  const [searchQuery, setSearchQuery] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    image_url: '',
    link_url: '',
    sort_order: 0,
    is_active: true,
    page: 'home' as 'home' | 'challenge',
    start_at: null as string | null,
    end_at: null as string | null,
    event_id: null as string | null,
    imageFile: null as File | null,
    imagePreview: ''
  })

  // 促銷方案清單：連結欄可一鍵指向 /promo/<id> 促銷分類清單頁
  const [promotions, setPromotions] = useState<PromoOption[]>([])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setBanners(data || [])
    } catch (error) {
      console.error('Error fetching banners:', error)
      // For development without actual table, we might want to show empty or mock
      // toast('載入輪播圖失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetch('/api/admin/promotions', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then((list: PromoOption[]) => setPromotions((list || []).filter(p => p.is_active)))
      .catch(() => setPromotions([]))
  }, [])

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner)
    setFormData({
      name: banner.name || '',
      image_url: banner.image_url,
      link_url: banner.link_url || '',
      start_at: banner.start_at ?? null,
      end_at: banner.end_at ?? null,
      event_id: banner.event_id ?? null,
      sort_order: banner.sort_order,
      is_active: banner.is_active,
      page: (banner.page as 'home' | 'challenge') || 'home',
      imageFile: null,
      imagePreview: banner.image_url
    })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingBanner(null)
    setFormData({
      name: '',
      image_url: '',
      link_url: '',
      start_at: null,
      end_at: null,
      event_id: null,
      sort_order: 0,
      is_active: true,
      page: activeTab === 'popup' ? 'home' : activeTab,
      imageFile: null,
      imagePreview: ''
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    confirm({
      title: '確認操作',
      message: "確定要刪除此輪播圖嗎？",
      onConfirm: async () => {

      try {
        const res = await fetch(`/api/banners/${id}`, {
          method: 'DELETE',
        })
        
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || '刪除失敗')
        }

        fetchData()
      } catch (error: any) {
        console.error('Error deleting banner:', error)
        toast(error.message || '刪除失敗', 'error')
      }
      },
    })
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const previewUrl = URL.createObjectURL(file)
      setFormData({
        ...formData,
        imageFile: file,
        imagePreview: previewUrl
      })
    }
  }

  const handleSubmit = async () => {
    if (savingLock.current) return
    if (!formData.name) {
      toast('請輸入輪播圖名稱', 'warning')
      return
    }
    savingLock.current = true
    setIsSaving(true)
    try {

      let finalImageUrl = formData.image_url

      // Upload image if selected
      if (formData.imageFile) {
        const file = formData.imageFile
        const fileExt = (file.name.split('.').pop() || '').trim() || 'jpg'
        const fileName = `banner-${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExt}`

        const uploadForm = new FormData()
        uploadForm.append('file', file)
        uploadForm.append('bucket', 'banners')
        uploadForm.append('path', fileName)

        const uploadRes = await fetch('/api/admin/upload', {
          method: 'POST',
          body: uploadForm,
        })
        const uploadJson = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) {
          throw new Error(uploadJson?.error || '圖片上傳失敗')
        }
        finalImageUrl = String(uploadJson?.publicUrl || '')
      } else if (!finalImageUrl && !formData.imagePreview) {
        toast('請上傳圖片', 'warning')
        return
      }

      const payload = {
        name: formData.name,
        image_url: finalImageUrl || formData.imagePreview,
        link_url: formData.link_url,
        start_at: formData.start_at,
        end_at: formData.end_at,
        event_id: formData.event_id,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        page: formData.page,
      }

      if (editingBanner) {
        const res = await fetch(`/api/banners/${editingBanner.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || '更新失敗')
        }
      } else {
        const res = await fetch('/api/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || '新增失敗')
        }
      }

      setIsModalOpen(false)
      fetchData()
    } catch (error: any) {
      console.error('Error saving banner:', error)
      toast(error.message || '儲存失敗', 'error')
    } finally {
      savingLock.current = false
      setIsSaving(false)
    }
  }

  /** 狀態 Switch 直接切換：樂觀更新，失敗滾回 */
  const toggleActive = async (banner: Banner, checked: boolean) => {
    setBanners(prev => prev.map(b =>
      b.id === banner.id ? { ...b, is_active: checked } : b
    ))

    try {
      const res = await fetch(`/api/banners/${banner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: checked }),
      })

      if (!res.ok) {
        throw new Error('Update failed')
      }
    } catch (error) {
      console.error('Error updating banner status:', error)
      toast('更新狀態失敗', 'error')
      // Revert on error
      setBanners(prev => prev.map(b =>
        b.id === banner.id ? { ...b, is_active: !checked } : b
      ))
    }
  }

  const filteredBanners = banners.filter(b => {
    if ((b.page || 'home') !== activeTab) return false
    if (searchQuery && !(b.name || '').toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const columns: ListColumn<Banner>[] = [
    {
      key: 'name', label: '名稱',
      sortValue: b => b.name || '',
      className: 'font-medium',
      render: b => <>{b.name}</>,
    },
    {
      key: 'image', label: '圖片',
      render: b => (
        <div className="relative w-32 h-16 bg-neutral-100 rounded overflow-hidden border border-neutral-200">
          <img src={b.image_url} alt={b.name} className="w-full h-full object-cover" />
        </div>
      ),
    },
    {
      key: 'link', label: '連結',
      render: b => (
        b.link_url ? (
          <a href={b.link_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px] block">
            {b.link_url}
          </a>
        ) : <span className="text-neutral-400">-</span>
      ),
    },
    {
      key: 'sortOrder', label: '排序',
      sortValue: b => b.sort_order,
      className: 'font-mono',
      render: b => <>{b.sort_order}</>,
    },
    {
      key: 'status', label: '狀態',
      sortValue: b => (b.is_active ? 1 : 0),
      render: b => (
        <Switch checked={b.is_active} onCheckedChange={checked => void toggleActive(b, checked)} />
      ),
    },
    {
      key: 'createdAt', label: '建立時間',
      sortValue: b => new Date(b.created_at).getTime(),
      className: 'font-mono',
      render: b => <>{formatDateTime(b.created_at)}</>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: b => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => handleEdit(b)}>編輯</RowAction>
          <RowAction tone="danger" onClick={() => handleDelete(b.id)}>刪除</RowAction>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="輪播圖管理">
      <div className="space-y-6">
        {/* Page tabs（pill 頁籤保留原樣） */}
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
          {PAGE_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value as typeof activeTab); setSearchQuery('') }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'popup' ? (
          <PopupPanel />
        ) : (
          <ListTableCard
            /* key 讓 useTablePrefs 依各頁籤的 pageKey 重新掛載，密度/欄位記憶各自獨立 */
            key={activeTab}
            pageKey={`banners-${activeTab}`}
            data={filteredBanners}
            columns={columns}
            keyField="id"
            isLoading={isLoading}
            emptyMessage="尚無輪播圖資料"
            defaultSortField="sortOrder"
            searchPlaceholder="搜尋輪播圖名稱..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            addButtonText="+ 新增輪播圖"
            onAddClick={handleAdd}
          />
        )}

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingBanner ? '編輯輪播圖' : '新增輪播圖'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">名稱 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
                placeholder="請輸入輪播圖名稱"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">圖片 <span className="text-red-500">*</span></label>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
                />
                {formData.imagePreview && (
                  <div className="relative w-full h-40 bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200">
                    <img 
                      src={formData.imagePreview} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {/* Fallback URL input if needed, but file upload is preferred */}
                {/* <input
                  type="text"
                  value={formData.image_url}
                  onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-500"
                  placeholder="或輸入圖片網址..."
                /> */}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">連結促銷分類頁 (選填)</label>
              <SelectField
                value={promotions.some(p => formData.link_url === `/promo/${p.id}`)
                  ? formData.link_url
                  : ''}
                onChange={e => {
                  if (e.target.value) setFormData({ ...formData, link_url: e.target.value })
                }}
                disabled={!!formData.event_id}
              >
                <option value="">不連結促銷（自訂網址）</option>
                {promotions.map(p => (
                  <option key={p.id} value={`/promo/${p.id}`}>{p.name}</option>
                ))}
              </SelectField>
              <p className="mt-1 text-xs text-neutral-400">選擇後點擊輪播圖會進入該促銷的商品清單頁</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">連結網址 (選填)</label>
              <input
                type="text"
                value={formData.link_url}
                onChange={e => setFormData({ ...formData, link_url: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg disabled:bg-neutral-50 disabled:text-neutral-400"
                placeholder="https://..."
                disabled={!!formData.event_id}
              />
              {formData.event_id && (
                <p className="mt-1 text-xs text-neutral-400">已關聯活動，連結由系統自動指向該活動頁</p>
              )}
            </div>

            <ScheduleFields
              startAt={formData.start_at}
              endAt={formData.end_at}
              eventId={formData.event_id}
              showEventLink
              onChange={patch => setFormData(prev => ({ ...prev, ...patch }))}
            />

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">顯示頁面 <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                {PAGE_TABS.filter(t => t.value !== 'popup').map(tab => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, page: tab.value as 'home' | 'challenge' })}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      formData.page === tab.value
                        ? 'bg-primary text-white border-primary'
                        : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">排序 (數字越小越前面)</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={e => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
                />
              </div>

              <div className="flex items-center pt-6">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-neutral-700">啟用狀態</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border rounded-lg hover:bg-neutral-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 min-w-[72px] justify-center"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    儲存中
                  </>
                ) : '儲存'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
