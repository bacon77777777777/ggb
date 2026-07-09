'use client'

import { AdminLayout, PageCard, SortableTableHeader, Modal } from '@/components'
import { useState, useEffect, useCallback, useMemo } from 'react'
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
  } catch {}
}

export default function NewsPage() {
  const prefs = loadPrefs()

  const [news, setNews]               = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingNews, setEditingNews] = useState<NewsArticle | null>(null)

  // 篩選（記憶）
  const [filterStatus, setFilterStatus] = useState<string>(prefs.filterStatus ?? 'all')
  const [filterCat,    setFilterCat]    = useState<string>(prefs.filterCat    ?? 'all')
  const [searchQ,      setSearchQ]      = useState<string>(prefs.searchQ      ?? '')

  // 排序（記憶）
  const [sortField,     setSortField]     = useState<string>(prefs.sortField     ?? 'created_at')
  const [sortDirection, setSortDirection] = useState<'asc'|'desc'>(prefs.sortDirection ?? 'desc')

  const [formData, setFormData] = useState({
    title:     '',
    summary:   '',
    content:   '',
    image_url: '',
    category:  'general',
    is_active: false,
  })

  // 篩選/排序變更時寫入 localStorage
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
    if (filterCat !== 'all')    arr = arr.filter(n => n.category === filterCat)
    if (filterStatus === 'active') arr = arr.filter(n =>  n.is_active)
    if (filterStatus === 'draft')  arr = arr.filter(n => !n.is_active)

    arr.sort((a, b) => {
      let av: any, bv: any
      if (sortField === 'title')      { av = a.title;       bv = b.title }
      else if (sortField === 'category') { av = a.category; bv = b.category }
      else if (sortField === 'view_count') { av = a.view_count ?? 0; bv = b.view_count ?? 0 }
      else                            { av = a.created_at;  bv = b.created_at }
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
  const handleEdit = (article: NewsArticle) => {
    setEditingNews(article)
    setFormData({
      title:     article.title,
      summary:   article.summary ?? '',
      content:   article.content ?? '',
      image_url: article.image_url ?? '',
      category:  article.category ?? 'general',
      is_active: article.is_active,
    })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingNews(null)
    setFormData({ title: '', summary: '', content: '', image_url: '', category: 'general', is_active: false })
    setIsModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.title.trim()) { alert('請輸入標題'); return }
    const payload = {
      title:     formData.title.trim(),
      summary:   formData.summary || null,
      content:   formData.content || null,
      image_url: formData.image_url || null,
      category:  formData.category,
      is_active: formData.is_active,
    }
    if (editingNews) {
      const { error } = await supabase.from('news').update(payload).eq('id', editingNews.id)
      if (error) { alert('儲存失敗：' + error.message); return }
    } else {
      const id = Math.floor(10000000 + Math.random() * 90000000).toString()
      const { error } = await supabase.from('news').insert([{ ...payload, id }])
      if (error) { alert('儲存失敗：' + error.message); return }
    }
    setIsModalOpen(false)
    fetchData()
  }

  const draftCount  = news.filter(n => !n.is_active).length
  const activeCount = news.filter(n =>  n.is_active).length

  return (
    <AdminLayout pageTitle="文章管理" breadcrumbs={[{ label: '文章管理', href: '/news' }]}>
      <div className="space-y-4">

        {/* ── 頂部統計 + 篩選工具列 ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-500">共 {news.length} 篇</span>
            <button
              onClick={() => setFilterStatus(s => s === 'active' ? 'all' : 'active')}
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                filterStatus === 'active'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
              }`}>
              已上架 {activeCount}
            </button>
            <button
              onClick={() => setFilterStatus(s => s === 'draft' ? 'all' : 'draft')}
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                filterStatus === 'draft'
                  ? 'bg-neutral-600 text-white border-neutral-600'
                  : 'bg-neutral-100 text-neutral-500 border-neutral-200 hover:bg-neutral-200'
              }`}>
              下架草稿 {draftCount}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 關鍵字搜尋 */}
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="搜尋標題..."
              className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {/* 分類篩選 */}
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none">
              <option value="all">全部分類</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {/* 清除篩選 */}
            {(filterStatus !== 'all' || filterCat !== 'all' || searchQ) && (
              <button
                onClick={() => { setFilterStatus('all'); setFilterCat('all'); setSearchQ('') }}
                className="text-xs text-neutral-400 hover:text-neutral-600 border border-neutral-200 rounded-lg px-2 py-1.5">
                清除篩選
              </button>
            )}
            <button onClick={handleAdd}
              className="px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-semibold">
              + 新增文章
            </button>
          </div>
        </div>

        {/* AI 草稿提示橫幅 */}
        {draftCount > 0 && filterStatus !== 'active' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-700 flex items-center gap-2">
            <span>⚠️</span>
            <span>有 <strong>{draftCount}</strong> 篇下架草稿（含 AI 自動採集），審閱後點上架開關切換至前台顯示。</span>
          </div>
        )}

        {/* ── 表格 ── */}
        <PageCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
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
                    <td colSpan={7} className="py-16 text-center text-neutral-400 text-sm">
                      {news.length === 0 ? '尚無文章資料' : '沒有符合條件的文章'}
                    </td>
                  </tr>
                ) : (
                  sorted.map(article => (
                    <tr key={article.id}
                      className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors group">
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

        {/* ── 編輯 / 新增 Modal ── */}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
          title={editingNews ? '編輯文章' : '新增文章'}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">標題 *</label>
              <input type="text" value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="文章標題" />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">一句話摘要</label>
              <input type="text" value={formData.summary}
                onChange={e => setFormData({ ...formData, summary: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="50 字以內摘要（列表預覽用）" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">分類</label>
                <select value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">主圖 URL</label>
                <input type="text" value={formData.image_url}
                  onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="https://..." />
              </div>
            </div>

            {formData.image_url && (
              <img src={formData.image_url} alt="preview"
                className="w-full h-32 object-cover rounded-lg border border-neutral-200" />
            )}

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">內容（HTML）</label>
              <textarea value={formData.content ?? ''}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg h-48 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="<p>文章內容...</p>" />
            </div>

            <div className="flex items-center gap-3 py-2 px-3 bg-neutral-50 rounded-lg">
              <button
                type="button"
                onClick={() => setFormData(f => ({ ...f, is_active: !f.is_active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.is_active ? 'bg-primary' : 'bg-neutral-300'
                }`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  formData.is_active ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <span className="text-sm font-medium text-neutral-700">
                {formData.is_active ? '立即上架至前台' : '儲存為下架草稿'}
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100">
              <button onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 text-sm">取消</button>
              <button onClick={handleSubmit}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-semibold">儲存</button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  )
}
