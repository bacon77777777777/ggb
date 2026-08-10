'use client'

import { AdminLayout, PageCard, SearchToolbar, FilterTags, SortableTableHeader, Modal } from '@/components'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'
import { useRouter } from 'next/navigation'
import { useToast } from '@/contexts/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import ConfirmDialog from '@/components/ConfirmDialog'

/**
 * 分類清單 —— 版型以「商品管理」為基準（老闆定案的全後台列表模板）：
 * PageCard 單一容器、SearchToolbar（新增＋搜尋＋篩選＋密度＋欄位開關）、
 * FilterTags、灰底表頭＋排序箭頭、密度共用 useTablePrefs、sticky 操作欄。
 * 之後其他列表頁（促銷方案、輪播圖…）都照這一頁的組裝方式換數據。
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
  const [sortField, setSortField] = useState<string>('sort_order')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')

  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('categories', 'compact', {
    name: true,
    sortOrder: true,
    status: true,
    createdAt: true,
    operations: true,
  })

  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  const [formData, setFormData] = useState({
    name: '',
    sort_order: 0,
    is_active: true
  })

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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredCategories = useMemo(() => {
    let result = categories
    if (selectedStatus !== 'all') {
      result = result.filter(c => (selectedStatus === 'active') === c.is_active)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q))
    }
    return result
  }, [categories, selectedStatus, searchQuery])

  const sortedCategories = useMemo(() => {
    const data = [...filteredCategories]
    return data.sort((a, b) => {
      let aValue: string | number
      let bValue: string | number
      switch (sortField) {
        case 'name':
          aValue = a.name; bValue = b.name; break
        case 'sortOrder':
          aValue = a.sort_order; bValue = b.sort_order; break
        case 'status':
          aValue = a.is_active ? 1 : 0; bValue = b.is_active ? 1 : 0; break
        case 'createdAt':
          aValue = new Date(a.created_at).getTime(); bValue = new Date(b.created_at).getTime(); break
        default:
          aValue = a.sort_order; bValue = b.sort_order
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }
      return sortDirection === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
    })
  }, [filteredCategories, sortField, sortDirection])

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

      const payload = {
        name: formData.name,
        sort_order: formData.sort_order,
        is_active: formData.is_active
      }

      if (editingCategory) {
        const res = await fetch('/api/admin/categories', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ id: editingCategory.id, ...payload }),
        })
        if (!res.ok) throw new Error('更新失敗')
      } else {
        const res = await fetch('/api/admin/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(payload),
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

  return (
    <AdminLayout pageTitle="分類清單">
      <div className="space-y-6">
        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋分類名稱..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showAddButton={true}
            addButtonText="+ 新增分類"
            onAddClick={handleAdd}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showColumnToggle={true}
            columns={[
              { key: 'name', label: '分類名稱', visible: visibleColumns.name },
              { key: 'sortOrder', label: '排序', visible: visibleColumns.sortOrder },
              { key: 'status', label: '狀態', visible: visibleColumns.status },
              { key: 'createdAt', label: '建立時間', visible: visibleColumns.createdAt },
              { key: 'operations', label: '操作', visible: visibleColumns.operations },
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
            showFilter={true}
            filterOptions={[
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                value: selectedStatus,
                onChange: setSelectedStatus,
                options: [
                  { value: 'all', label: '全部狀態' },
                  { value: 'active', label: '啟用' },
                  { value: 'inactive', label: '停用' },
                ]
              },
            ]}
          />

          <FilterTags
            tags={[
              ...(selectedStatus !== 'all' ? [{
                key: 'status',
                label: '狀態',
                value: selectedStatus === 'active' ? '啟用' : '停用',
                color: 'primary' as const,
                onRemove: () => setSelectedStatus('all')
              }] : []),
            ]}
            onClearAll={() => { setSelectedStatus('all'); setSearchQuery('') }}
          />

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="border-b border-neutral-200">
                  {visibleColumns.name && (
                    <SortableTableHeader sortKey="name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      分類名稱
                    </SortableTableHeader>
                  )}
                  {visibleColumns.sortOrder && (
                    <SortableTableHeader sortKey="sortOrder" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      排序
                    </SortableTableHeader>
                  )}
                  {visibleColumns.status && (
                    <SortableTableHeader sortKey="status" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      狀態
                    </SortableTableHeader>
                  )}
                  {visibleColumns.createdAt && (
                    <SortableTableHeader sortKey="createdAt" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      建立時間
                    </SortableTableHeader>
                  )}
                  {visibleColumns.operations && (
                    <th className={`${getDensityClasses()} text-left text-xs font-semibold text-neutral-500 sticky right-0 bg-white z-20 border-l border-neutral-200 whitespace-nowrap`}>操作</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton rows={5} cols={5} />
                ) : sortedCategories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center">
                      <div className="flex flex-col items-center justify-center py-24 text-neutral-400 text-sm gap-2">
                        <span>沒有找到符合條件的分類</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedCategories.map(category => (
                    <tr key={category.id} className="border-b border-neutral-100 hover:bg-neutral-50/60 transition-colors">
                      {visibleColumns.name && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                          <span className="font-medium text-neutral-900">{category.name}</span>
                        </td>
                      )}
                      {visibleColumns.sortOrder && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-700 font-mono whitespace-nowrap`}>
                          {category.sort_order}
                        </td>
                      )}
                      {visibleColumns.status && (
                        <td className={`${getDensityClasses()} whitespace-nowrap`}>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            category.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {category.is_active ? '啟用' : '停用'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.createdAt && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-700 font-mono whitespace-nowrap`}>
                          {formatDateTime(category.created_at)}
                        </td>
                      )}
                      {visibleColumns.operations && (
                        <td className={`${getDensityClasses()} sticky right-0 bg-white z-10 border-l border-neutral-200 whitespace-nowrap`}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => router.push(`/categories/${category.id}`)}
                              className="text-neutral-600 hover:text-neutral-900 text-sm font-medium"
                            >
                              綁商品
                            </button>
                            <button
                              onClick={() => handleEdit(category)}
                              className="text-primary hover:text-primary text-sm font-medium"
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
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageCard>

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

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-primary border-neutral-300 rounded focus:ring-primary"
              />
              <label htmlFor="is_active" className="text-sm text-neutral-700">
                啟用分類
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
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
