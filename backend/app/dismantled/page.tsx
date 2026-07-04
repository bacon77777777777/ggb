'use client'

import { AdminLayout, PageCard, SearchToolbar, SortableTableHeader, StatsCard, CopyableID } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { useState, useMemo, useEffect } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

interface DismantledItem {
  id: string
  created_at: string
  product_name: string
  prize_name: string
  prize_level: string
  recycle_value: number
  user_name: string
  user_id: string
}

export default function DismantledPage() {
  const router = useRouter()
  const [items, setItems] = useState<DismantledItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const { tableDensity, setTableDensity } = useTablePrefs('dismantled', 'compact', {})

  // Fetch data from Supabase
  useEffect(() => {
    const fetchDismantledItems = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('draw_records')
          .select(`
            id,
            created_at,
            product_prizes ( name, level, recycle_value ),
            products ( name, price ),
            users ( id, name, email )
          `)
          .eq('status', 'dismantled')
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Error fetching dismantled items:', error)
          return
        }

        if (data) {
          const mappedItems: DismantledItem[] = data.map((item: any) => {
            // Re-calculate recycle value based on new rules if needed, 
            // but for admin view, showing DB value is safer, 
            // or we can replicate the logic. 
            // Given the migration 034 updates the DB value, we should trust the DB value.
            // However, for items before migration execution, the DB value might be old.
            // But since I cannot run migration, I should probably apply logic here too?
            // User requested "Show Dismantled Items", listing "Tokens Obtained".
            // If I apply logic here, it might differ from what user sees if migration isn't run.
            // But for now, let's use DB value as primary.
            
            return {
              id: item.id.toString(),
              created_at: item.created_at,
              product_name: item.products?.name || '未知系列',
              prize_name: item.product_prizes?.name || '未知獎品',
              prize_level: item.product_prizes?.level || '?',
              recycle_value: item.product_prizes?.recycle_value || 0,
              user_name: item.users?.name || item.users?.email || '未知用戶',
              user_id: item.users?.id || ''
            }
          })
          setItems(mappedItems)
        }
      } catch (err) {
        console.error('Unexpected error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDismantledItems()
  }, [])

  // Filter Data
  const filteredItems = useMemo(() => {
    let result = items

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.prize_name.toLowerCase().includes(query) ||
        item.product_name.toLowerCase().includes(query) ||
        item.user_name.toLowerCase().includes(query) ||
        item.user_id.toLowerCase().includes(query)
      )
    }

    return result
  }, [items, searchQuery])

  // Sort Data
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        case 'recycle_value':
          aValue = a.recycle_value
          bValue = b.recycle_value
          break
        default:
          aValue = a[sortField as keyof DismantledItem]
          bValue = b[sortField as keyof DismantledItem]
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

  // Density Classes
  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  return (
    <AdminLayout
      pageTitle="回收池 / 分解品管理"
      breadcrumbs={[{ label: '商品管理', href: '/products' }, { label: '回收池 / 分解品管理', href: '/dismantled' }]}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatsCard
            title="總分解數量"
            value={items.length}
          />
          <StatsCard
            title="總發放代幣"
            value={items.reduce((sum, item) => sum + item.recycle_value, 0)}
            unit="G"
          />
        </div>

        {/* Table Section */}
        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋獎項、會員名稱、UUID..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
          />

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <SortableTableHeader
                    sortKey="created_at"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    日期
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="prize_name"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    獎項名稱
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="prize_level"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    等級
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="recycle_value"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    獲得代幣(G)
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="user_name"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    會員名稱
                  </SortableTableHeader>
                  <SortableTableHeader
                    sortKey="user_id"
                    currentSortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="py-3 px-4"
                  >
                    UUID
                  </SortableTableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-neutral-500">載入中...</td>
                  </tr>
                ) : sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-neutral-500">無資料</td>
                  </tr>
                ) : (
                  sortedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                      <td className={`${getDensityClasses()} text-neutral-600 whitespace-nowrap`}>
                        {formatDateTime(item.created_at)}
                      </td>
                      <td className={`${getDensityClasses()} font-medium text-neutral-900`}>
                        <div className="flex flex-col">
                          <span>{item.prize_name}</span>
                          <span className="text-xs text-neutral-500">{item.product_name}</span>
                        </div>
                      </td>
                      <td className={`${getDensityClasses()}`}>
                        <span className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded text-xs font-medium border border-neutral-200">
                          {item.prize_level}
                        </span>
                      </td>
                      <td className={`${getDensityClasses()} font-mono text-primary font-medium`}>
                        {item.recycle_value}
                      </td>
                      <td className={`${getDensityClasses()} text-neutral-900`}>
                        {item.user_name}
                      </td>
                      <td className={`${getDensityClasses()} text-xs text-neutral-700`}>
                        <CopyableID id={item.user_id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
