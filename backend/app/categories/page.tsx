'use client'

import { AdminLayout, Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import Switch from '@/components/ui/Switch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'
import { useRouter } from 'next/navigation'
import { useToast } from '@/contexts/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

/**
 * 分類清單 —— 後台列表定版樣板（ListTableCard）的第一個使用者。
 * 版型基準是商品管理；要改所有列表頁的長相去改 ListTableCard，
 * 這裡只負責數據、欄位定義與彈窗。
 * 狀態欄用 Switch 直接切換啟停（老闆指定，彈窗裡不再放啟用勾選）。
 */

interface Category {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export default function CategoriesPage() {
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')

  const [formData, setFormData] = useState({ name: '', sort_order: 0 })

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setCategories(data || [])
    } catch (error: unknown) {
      console.error('Error fetching categories:', error)
      toast(`載入分類失敗: ${error instanceof Error ? error.message : ''}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filtered = categories.filter(c => {
    if (selectedStatus !== 'all' && (selectedStatus === 'active') !== c.is_active) return false
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setFormData({ name: category.name, sort_order: category.sort_order })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingCategory(null)
    setFormData({ name: '', sort_order: 0 })
    setIsModalOpen(true)
  }

  /** 狀態 Switch 直接切換：樂觀更新，失敗滾回 */
  const toggleActive = async (category: Category, next: boolean) => {
    setCategories(prev => prev.map(c => c.id === category.id ? { ...c, is_active: next } : c))
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: category.id, is_active: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setCategories(prev => prev.map(c => c.id === category.id ? { ...c, is_active: !next } : c))
      toast('切換失敗，請重試一次', 'error')
    }
  }

  const handleDelete = async (category: Category) => {
    const { count, error } = await supabase
      .from('product_categories')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', category.id)
    const productCount = error ? 0 : (count || 0)
    if (productCount > 0) {
      toast(`這個分類底下還有 ${productCount} 個商品，先把商品移出去或改掛到別的分類才能刪除。`, 'error')
      return
    }

    confirm({
      title: '確認操作',
      message: "確定要刪除此分類嗎？",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/categories?id=${category.id}`, { method: 'DELETE', credentials: 'include' })
          if (!res.ok) throw new Error('刪除失敗')
          fetchData()
        } catch (error) {
          console.error('Error deleting category:', error)
          toast('刪除失敗', 'error')
        }
      },
    })
  }

  const handleSubmit = async () => {
    try {
      if (!formData.name) {
        toast('請輸入分類名稱', 'warning')
        return
      }

      if (editingCategory) {
        const res = await fetch('/api/admin/categories', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ id: editingCategory.id, ...formData }),
        })
        if (!res.ok) throw new Error('更新失敗')
      } else {
        // 新分類預設啟用（啟用與否在表格上用 Switch 管）
        const res = await fetch('/api/admin/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ ...formData, is_active: true }),
        })
        if (!res.ok) throw new Error('新增失敗')
      }

      setIsModalOpen(false)
      fetchData()
    } catch (error) {
      console.error('Error saving category:', error)
      toast('儲存失敗', 'error')
    }
  }

  const columns: ListColumn<Category>[] = [
    {
      key: 'name', label: '分類名稱',
      sortValue: c => c.name,
      render: c => <span className="font-medium text-neutral-900">{c.name}</span>,
    },
    {
      key: 'sortOrder', label: '排序',
      sortValue: c => c.sort_order,
      className: 'font-mono',
      render: c => <>{c.sort_order}</>,
    },
    {
      key: 'status', label: '狀態',
      sortValue: c => (c.is_active ? 1 : 0),
      render: c => (
        <Switch checked={c.is_active} onCheckedChange={next => void toggleActive(c, next)} />
      ),
    },
    {
      key: 'createdAt', label: '建立時間',
      sortValue: c => new Date(c.created_at).getTime(),
      className: 'font-mono',
      render: c => <>{formatDateTime(c.created_at)}</>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: c => (
        <div className="flex items-center gap-2">
          <RowAction onClick={() => router.push(`/categories/${c.id}`)}>綁商品</RowAction>
          <RowAction tone="primary" onClick={() => handleEdit(c)}>編輯</RowAction>
          <RowAction tone="danger" onClick={() => handleDelete(c)}>刪除</RowAction>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="分類清單">
      <div className="space-y-6">
        <ListTableCard
          pageKey="categories"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="沒有找到符合條件的分類"
          defaultSortField="sortOrder"
          searchPlaceholder="搜尋分類名稱..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增分類"
          onAddClick={handleAdd}
          filters={[
            {
              key: 'status', label: '狀態',
              value: selectedStatus, onChange: setSelectedStatus,
              options: [
                { value: 'all', label: '全部狀態' },
                { value: 'active', label: '啟用' },
                { value: 'inactive', label: '停用' },
              ],
            },
          ]}
        />

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingCategory ? '編輯分類' : '新增分類'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                分類名稱
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="請輸入分類名稱"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                排序 (數字越小越前面)
              </label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                儲存
              </button>
            </div>
          </div>
        </Modal>
      </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
