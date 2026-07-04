'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { useState, useMemo, useEffect } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import Link from 'next/link'
import Image from 'next/image'
import { SmallItem } from '@/types/product'
import { useLog } from '@/contexts/LogContext'
import { useRouter } from 'next/navigation'

export default function SmallItemsPage() {
  const router = useRouter()
  const { addLog } = useLog()
  const [smallItems, setSmallItems] = useState<SmallItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortField, setSortField] = useState<string>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const { tableDensity, setTableDensity } = useTablePrefs('small-items', 'compact', {})

  // Fetch data from Supabase
  useEffect(() => {
    const fetchSmallItems = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/admin/small-items', { method: 'GET' })
        if (!res.ok) return
        const data = (await res.json()) as any[]

        if (data) {
          const mappedItems: SmallItem[] = data.map((item: any) => ({
            id: item.id,
            name: item.name,
            imageUrl: item.image_url,
            category: item.category,
            level: item.level,
            description: item.description,
            createdAt: item.created_at
          }))
          setSmallItems(mappedItems)
        }
      } catch (err) {
        console.error('Unexpected error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSmallItems()
  }, [])

  // 獲取所有分類
  const categories = useMemo(() => {
    const cats = Array.from(new Set(smallItems.map(item => item.category)))
    return cats
  }, [smallItems])

  // 篩選數據
  const filteredItems = useMemo(() => {
    let result = smallItems

    // 搜尋過濾
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      )
    }

    // 分類過濾
    if (selectedCategory !== 'all') {
      result = result.filter(item => item.category === selectedCategory)
    }

    return result
  }, [smallItems, searchQuery, selectedCategory])

  // 排序處理
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'id':
          aValue = a.id
          bValue = b.id
          break
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'category':
          aValue = a.category
          bValue = b.category
          break
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
          break
        default:
          aValue = a.id
          bValue = b.id
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
  }, [filteredItems, sortField, sortDirection])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(`確定刪除「${name}」嗎？`)
    if (!confirmed) return
    const res = await fetch(`/api/admin/small-items/${id}`, { method: 'DELETE' })
    if (!res.ok) return
    setSmallItems(prev => prev.filter(item => item.id !== id))
    await addLog('delete', name, `刪除小物 ID=${id}`, 'success')
  }

  // 密度樣式
  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  return (
    <AdminLayout
      pageTitle="小物資源庫管理"
      breadcrumbs={[
        { label: '商品管理', href: '/products' },
        { label: '小物資源庫管理', href: '/small-items' }
      ]}
    >
      <div className="space-y-6">
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatsCard
            title="總小物數量"
            value={smallItems.length}
          />
          <StatsCard
            title="分類數量"
            value={categories.length}
          />
        </div>

        {/* 表格區域 */}
        <div id="list-section">
          <PageCard>
            <SearchToolbar
            searchPlaceholder="搜尋小物名稱、分類、描述..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showAddButton={true}
            addButtonText="+ 新增小物"
            onAddClick={() => router.push('/small-items/new')}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showFilter={true}
            filterOptions={[
              {
                key: 'category',
                label: '分類',
                type: 'select',
                value: selectedCategory,
                onChange: setSelectedCategory,
                options: [
                  { value: 'all', label: '全部分類' },
                  ...categories.map(cat => ({ value: cat, label: cat }))
                ]
              }
            ]}
          />

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <SortableTableHeader sortKey="id" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    ID
                  </SortableTableHeader>
                  <th className={`${getDensityClasses()} text-left text-sm font-semibold text-neutral-700`}>圖片</th>
                  <SortableTableHeader sortKey="name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    名稱
                  </SortableTableHeader>
                  <SortableTableHeader sortKey="category" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    分類
                  </SortableTableHeader>
                  <th className={`${getDensityClasses()} text-left text-sm font-semibold text-neutral-700`}>描述</th>
                  <SortableTableHeader sortKey="createdAt" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    建立時間
                  </SortableTableHeader>
                  <th className={`${getDensityClasses()} text-left text-sm font-semibold text-neutral-700 sticky right-0 bg-white z-20 border-l border-neutral-200`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={item.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className={`${getDensityClasses()} text-sm text-neutral-700 font-mono`}>
                      {item.id}
                    </td>
                    <td className={`${getDensityClasses()}`}>
                      <div className="relative w-12 h-12 bg-neutral-100 rounded-lg overflow-hidden">
                        <Image
                          src={item.imageUrl || 'https://via.placeholder.com/60'}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    </td>
                    <td className={`${getDensityClasses()} text-sm text-neutral-700 font-medium`}>
                      {item.name}
                    </td>
                    <td className={`${getDensityClasses()}`}>
                      <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                        {item.category}
                      </span>
                    </td>
                    <td className={`${getDensityClasses()} text-sm text-neutral-500`}>
                      {item.description || '-'}
                    </td>
                    <td className={`${getDensityClasses()} text-sm text-neutral-500 font-mono`}>
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td className={`${getDensityClasses()} sticky right-0 z-20 border-l border-neutral-200 bg-white group-hover:bg-neutral-50`}>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/small-items/${item.id}`}
                          className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                        >
                          編輯
                        </Link>
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageCard>
        </div>
      </div>
    </AdminLayout>
  )
}
