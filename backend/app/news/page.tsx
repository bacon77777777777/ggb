'use client'

import { AdminLayout, PageCard, SearchToolbar, FilterTags, SortableTableHeader } from '@/components'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'

interface NewsArticle {
  id: string
  title: string
  summary: string | null
  content: string | null
  image_url: string | null
  source_url: string | null
  category: string
  tags: string[] | null
  is_active: boolean
  created_at: string
  view_count: number
}

const CATEGORY_LABELS: Record<string, string> = {
  ichiban: '一番賞',
  gacha:   '轉蛋',
  blindbox:'盒玩',
  tcg:     '卡牌',
  general: '綜合',
}

const CATEGORY_COLORS: Record<string, string> = {
  ichiban: 'bg-red-50 text-red-700',
  gacha:   'bg-orange-50 text-orange-700',
  blindbox:'bg-purple-50 text-purple-700',
  tcg:     'bg-blue-50 text-blue-700',
  general: 'bg-neutral-100 text-neutral-600',
}

const STORAGE_KEY = 'news_mgmt_prefs'

function loadPrefs() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

function savePrefs(patch: Record<string, unknown>) {
  try {
    const cur = loadPrefs()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...patch }))
  } catch (_) { /* ignore */ }
}

export default function NewsPage() {
  const prefs  = loadPrefs()
  const router = useRouter()

  const [news, setNews]               = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/admin/trigger/news-agent', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { alert(data?.error ?? '生成失敗'); return }
      alert(`完成！新增 ${data.written ?? 0} 篇，跳過 ${data.skipped ?? 0} 篇（重複或無圖）`)
      fetchData()
    } catch { alert('生成失敗') } finally { setIsGenerating(false) }
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 篩選（記憶）
  const [filterStatus, setFilterStatus] = useState<string>(prefs.filterStatus ?? 'all')
  const [filterCat,    setFilterCat]    = useState<string>(prefs.filterCat    ?? 'all')
  const [searchQ,      setSearchQ]      = useState<string>(prefs.searchQ      ?? '')

  // 排序（記憶）
  const [sortField,     setSortField]     = useState<string>(prefs.sortField     ?? 'created_at')
  const [sortDirection, setSortDirection] = useState<'asc'|'desc'>(prefs.sortDirection ?? 'desc')

  useEffect(() => { savePrefs({ filterStatus, filterCat, searchQ, sortField, sortDirection }) },
    [filterStatus, filterCat, searchQ, sortField, sortDirection])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const { data } = await supabase
      .from('news')
      .select('*')
      .order('created_at', { ascending: false })
    setNews(data ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── 過濾 + 排序 ──────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    let arr = [...news]

    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      arr = arr.filter(n => n.title.toLowerCase().includes(q) || (n.summary ?? '').toLowerCase().includes(q))
    }
    if (filterCat !== 'all')       arr = arr.filter(n => n.category === filterCat)
    if (filterStatus === 'active') arr = arr.filter(n =>  n.is_active)
    if (filterStatus === 'draft')  arr = arr.filter(n => !n.is_active)

    arr.sort((a, b) => {
      let av: any, bv: any
      if (sortField === 'title')         { av = a.title;        bv = b.title }
      else if (sortField === 'category') { av = a.category;     bv = b.category }
      else if (sortField === 'view_count') { av = a.view_count ?? 0; bv = b.view_count ?? 0 }
      else                               { av = a.created_at;   bv = b.created_at }
      if (av < bv) return sortDirection === 'asc' ? -1 :  1
      if (av > bv) return sortDirection === 'asc' ?  1 : -1
      return 0
    })
    return arr
  }, [news, searchQ, filterCat, filterStatus, sortField, sortDirection])

  const handleSort = (field: string) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDirection('desc') }
  }

  // ─── 批量選取 ─────────────────────────────────────────────────────────────
  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(sorted.map(n => n.id)) : new Set())
  }

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ─── 批量操作 ─────────────────────────────────────────────────────────────
  const handleBatchPublish = async () => {
    const ids = [...selectedIds]
    await supabase.from('news').update({ is_active: true }).in('id', ids)
    setNews(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, is_active: true } : n))
    setSelectedIds(new Set())
  }

  const handleBatchUnpublish = async () => {
    const ids = [...selectedIds]
    await supabase.from('news').update({ is_active: false }).in('id', ids)
    setNews(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, is_active: false } : n))
    setSelectedIds(new Set())
  }

  const handleBatchDelete = async () => {
    if (!confirm(`確定要刪除選取的 ${selectedIds.size} 篇文章嗎？`)) return
    const ids = [...selectedIds]
    await supabase.from('news').delete().in('id', ids)
    setNews(prev => prev.filter(n => !selectedIds.has(n.id)))
    setSelectedIds(new Set())
  }

  // ─── 上架開關 ─────────────────────────────────────────────────────────────
  const handleToggleActive = async (article: NewsArticle) => {
    const next = !article.is_active
    setNews(prev => prev.map(n => n.id === article.id ? { ...n, is_active: next } : n))
    const { error } = await supabase.from('news').update({ is_active: next }).eq('id', article.id)
    if (error) { fetchData(); alert('更新失敗') }
  }

  // ─── 刪除 ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此文章嗎？')) return
    const { error } = await supabase.from('news').delete().eq('id', id)
    if (!error) setNews(prev => prev.filter(n => n.id !== id))
    else alert('刪除失敗')
  }

  // ─── 編輯 / 新增 ──────────────────────────────────────────────────────────
  const handleEdit = (article: NewsArticle) => router.push(`/news/${article.id}`)
  const handleAdd  = ()                      => router.push('/news/new')

  const activeCount = news.filter(n =>  n.is_active).length
  const draftCount  = news.filter(n => !n.is_active).length
  const allChecked  = sorted.length > 0 && selectedIds.size === sorted.length

  return (
    <AdminLayout pageTitle="文章管理" breadcrumbs={[{ label: '文章管理', href: '/news' }]}>
      <div className="space-y-4">

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋標題..."
            searchValue={searchQ}
            onSearchChange={setSearchQ}
            showAddButton={true}
            addButtonText="+ 新增文章"
            onAddClick={handleAdd}
            showFilter={true}
            filterOptions={[
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                value: filterStatus,
                onChange: setFilterStatus,
                options: [
                  { value: 'all',    label: '全部狀態' },
                  { value: 'active', label: '已上架' },
                  { value: 'draft',  label: '下架草稿' },
                ],
              },
              {
                key: 'category',
                label: '分類',
                type: 'select',
                value: filterCat,
                onChange: setFilterCat,
                options: [
                  { value: 'all', label: '全部分類' },
                  ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v })),
                ],
              },
            ]}
            selectedCount={selectedIds.size}
            batchActions={[
              { label: '批量上架', onClick: handleBatchPublish,   variant: 'primary'   },
              { label: '批量下架', onClick: handleBatchUnpublish, variant: 'secondary' },
              { label: '批量刪除', onClick: handleBatchDelete,    variant: 'danger'    },
            ]}
            onClearSelection={() => setSelectedIds(new Set())}
          >
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {isGenerating ? '生成中...' : '⚡ 生成文章'}
            </button>
          </SearchToolbar>

          <FilterTags
            tags={[
              ...(filterStatus !== 'all' ? [{
                key: 'status',
                label: '狀態',
                value: filterStatus === 'active' ? '已上架' : '下架草稿',
                color: 'primary' as const,
                onRemove: () => setFilterStatus('all'),
              }] : []),
              ...(filterCat !== 'all' ? [{
                key: 'category',
                label: '分類',
                value: CATEGORY_LABELS[filterCat] ?? filterCat,
                color: 'primary' as const,
                onRemove: () => setFilterCat('all'),
              }] : []),
            ]}
            onClearAll={() => { setFilterStatus('all'); setFilterCat('all'); setSearchQ('') }}
          />

          {/* ── 統計列 ── */}
          <div className="flex items-center gap-3 px-4 py-2 text-sm border-b border-neutral-100">
            <span className="text-neutral-500">共 {news.length} 篇</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
              已上架 {activeCount}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-500 border border-neutral-200">
              下架草稿 {draftCount}
            </span>
            {sorted.length !== news.length && (
              <span className="text-neutral-400 text-xs">篩選後顯示 {sorted.length} 篇</span>
            )}
          </div>

          {/* ── 表格 ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-4 py-2.5 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={e => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 text-primary focus:ring-primary rounded"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 w-16">圖片</th>
                  <SortableTableHeader sortKey="title" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    標題
                  </SortableTableHeader>
                  <SortableTableHeader sortKey="category" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    分類
                  </SortableTableHeader>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">上架</th>
                  <SortableTableHeader sortKey="view_count" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    瀏覽
                  </SortableTableHeader>
                  <SortableTableHeader sortKey="created_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                    建立時間
                  </SortableTableHeader>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 sticky right-0 bg-white z-10 border-l border-neutral-100 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="px-4 py-3"><div className="w-4 h-4 bg-neutral-100 rounded animate-pulse" /></td>
                      <td className="px-3 py-3"><div className="w-14 h-10 bg-neutral-100 rounded animate-pulse" /></td>
                      <td className="px-3 py-3"><div className="h-4 bg-neutral-100 rounded animate-pulse w-64" /></td>
                      <td className="px-3 py-3"><div className="h-5 bg-neutral-100 rounded-full animate-pulse w-12" /></td>
                      <td className="px-3 py-3"><div className="h-6 bg-neutral-100 rounded-full animate-pulse w-11" /></td>
                      <td className="px-3 py-3"><div className="h-4 bg-neutral-100 rounded animate-pulse w-8" /></td>
                      <td className="px-3 py-3"><div className="h-4 bg-neutral-100 rounded animate-pulse w-32" /></td>
                      <td className="px-3 py-3 sticky right-0 bg-white border-l border-neutral-100"><div className="h-4 bg-neutral-100 rounded animate-pulse w-16" /></td>
                    </tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-neutral-400 text-sm">
                      {news.length === 0 ? '尚無文章資料' : '沒有符合條件的文章'}
                    </td>
                  </tr>
                ) : (
                  sorted.map(article => (
                    <tr key={article.id}
                      className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors group ${
                        selectedIds.has(article.id) ? 'bg-primary/5' : ''
                      }`}>
                      {/* 勾選 */}
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(article.id)}
                          onChange={() => handleSelectOne(article.id)}
                          className="w-4 h-4 text-primary focus:ring-primary rounded"
                        />
                      </td>
                      {/* 圖片 */}
                      <td className="px-3 py-2.5">
                        {article.image_url
                          ? <img src={article.image_url} alt="" className="w-14 h-10 object-cover rounded-lg" />
                          : <div className="w-14 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-300 text-[10px] font-bold">無圖</div>
                        }
                      </td>
                      {/* 標題 */}
                      <td className="px-3 py-2.5 max-w-xs">
                        <div className="font-semibold text-neutral-800 line-clamp-1">{article.title}</div>
                        {article.summary && (
                          <div className="text-xs text-neutral-400 line-clamp-1 mt-0.5">{article.summary}</div>
                        )}
                        {article.source_url && (
                          <a href={article.source_url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline mt-0.5 block truncate">
                            來源
                          </a>
                        )}
                      </td>
                      {/* 分類 */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CATEGORY_COLORS[article.category] ?? 'bg-neutral-100 text-neutral-500'}`}>
                          {CATEGORY_LABELS[article.category] ?? article.category}
                        </span>
                      </td>
                      {/* 上架開關 */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleActive(article)}
                          title={article.is_active ? '點擊下架' : '點擊上架'}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            article.is_active ? 'bg-primary' : 'bg-neutral-300'
                          }`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            article.is_active ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                      </td>
                      {/* 瀏覽數 */}
                      <td className="px-3 py-2.5 text-sm text-neutral-500 whitespace-nowrap">
                        {article.view_count ?? 0}
                      </td>
                      {/* 建立時間 */}
                      <td className="px-3 py-2.5 text-sm text-neutral-400 whitespace-nowrap font-mono">
                        {formatDateTime(article.created_at)}
                      </td>
                      {/* 操作 */}
                      <td className="px-3 py-2.5 whitespace-nowrap sticky right-0 bg-white group-hover:bg-neutral-50 border-l border-neutral-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleEdit(article)}
                            className="text-primary hover:text-primary/70 text-sm font-semibold">編輯</button>
                          <button onClick={() => handleDelete(article.id)}
                            className="text-red-400 hover:text-red-600 text-sm font-semibold">刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {sorted.length > 0 && (
            <div className="px-4 py-2 border-t border-neutral-100 text-xs text-neutral-400">
              顯示 {sorted.length} / {news.length} 篇
            </div>
          )}
        </PageCard>

      </div>
    </AdminLayout>
  )
}
