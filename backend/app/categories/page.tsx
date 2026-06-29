'use client'

import { AdminLayout, PageCard, Modal, DataTable, type Column } from '@/components'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'
import { useRouter } from 'next/navigation'

interface Category {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  products?: { count: number }[]
}

export default function CategoriesPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [sortField, setSortField] = useState<string>('sort_order')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  
  const [formData, setFormData] = useState({
    name: '',
    sort_order: 0,
    is_active: true
  })

  const fetchData = async () => {
    try {
      setIsLoading(true)
      // 暫時移除 products(count) 避免因關聯或權限問題導致查詢失敗
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
      
      if (error) throw error
      setCategories(data || [])
    } catch (error: any) {
      console.error('Error fetching categories:', error)
      alert(`載入菜單失敗: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedCategories = useMemo(() => {
    const data = [...categories]
    return data.sort((a, b) => {
      let aValue: any
      let bValue: any
      switch (sortField) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'sort_order':
          aValue = a.sort_order
          bValue = b.sort_order
          break
        case 'is_active':
          aValue = a.is_active ? 1 : 0
          bValue = b.is_active ? 1 : 0
          break
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        default:
          aValue = a.sort_order
          bValue = b.sort_order
      }
      if (typeof aValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      } else {
        return sortDirection === 'asc'
          ? aValue - bValue
          : bValue - aValue
      }
    })
  }, [categories, sortField, sortDirection])

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      sort_order: category.sort_order,
      is_active: category.is_active
    })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingCategory(null)
    setFormData({
      name: '',
      sort_order: 0,
      is_active: true
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (category: Category) => {
    const { count, error } = await supabase
      .from('menu_products')
      .select('*', { count: 'exact', head: true })
      .eq('menu_id', category.id)
    const productCount = error ? 0 : (count || 0)
    if (productCount > 0) {
      alert(`此菜單下仍有 ${productCount} 個商品，無法刪除。\n請先移除或轉移該菜單下的商品。`)
      return
    }

    if (!confirm('確定要刪除此分類嗎？')) return

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', category.id)

      if (error) throw error
      fetchData()
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('刪除失敗')
    }
  }

  const handleSubmit = async () => {
    try {
      if (!formData.name) {
        alert('請輸入分類名稱')
        return
      }

      const payload = {
        name: formData.name,
        sort_order: formData.sort_order,
        is_active: formData.is_active
      }

      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editingCategory.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('categories')
          .insert([payload])

        if (error) throw error
      }

      setIsModalOpen(false)
      fetchData()
    } catch (error) {
      console.error('Error saving category:', error)
      alert('儲存失敗')
    }
  }

  const columns: Column<Category>[] = [
    {
      key: 'name',
      label: '菜單名稱',
      sortable: true,
      className: 'align-middle',
      render: (category: Category) => <span className="font-medium text-neutral-900">{category.name}</span>
    },
    {
      key: 'sort_order',
      label: '排序',
      sortable: true,
      className: 'align-middle',
      render: (category: Category) => <span>{category.sort_order}</span>
    },
    {
      key: 'is_active',
      label: '狀態',
      className: 'align-middle',
      render: (category: Category) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          category.is_active 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {category.is_active ? '啟用' : '停用'}
        </span>
      )
    },
    {
      key: 'created_at',
      label: '建立時間',
      sortable: true,
      className: 'align-middle whitespace-nowrap',
      render: (category: Category) => <span className="text-neutral-700 text-sm font-mono">{formatDateTime(category.created_at)}</span>
    },
    {
      key: 'actions',
      label: '操作',
      sticky: true,
      className: 'align-middle',
      render: (category: Category) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/categories/${category.id}`)}
            className="text-neutral-600 hover:text-neutral-900 text-sm font-medium"
          >
            綁商品
          </button>
          <button
            onClick={() => handleEdit(category)}
            className="text-blue-500 hover:text-blue-700 text-sm font-medium"
          >
            編輯
          </button>
          <button
            onClick={() => handleDelete(category)}
            className="text-red-500 hover:text-red-700 text-sm font-medium"
          >
            刪除
          </button>
        </div>
      )
    }
  ]

  return (
    <AdminLayout
      pageTitle="菜單管理"
      breadcrumbs={[
        { label: '菜單管理', href: undefined }
      ]}
    >
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-neutral-800">菜單列表</h2>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增菜單
          </button>
        </div>

        <PageCard>
          <DataTable
            data={sortedCategories}
            columns={columns}
            keyField="id"
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            emptyMessage="沒有找到符合條件的菜單"
          />
        </PageCard>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingCategory ? '編輯菜單' : '新增菜單'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                菜單名稱
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="請輸入菜單名稱"
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
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-primary border-neutral-300 rounded focus:ring-primary"
              />
              <label htmlFor="is_active" className="text-sm text-neutral-700">
                啟用菜單
              </label>
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
    </AdminLayout>
  )
}
