'use client'

import { AdminLayout, PageCard, Modal, DataTable, type Column } from '@/components'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'

interface NewsArticle {
  id: string
  title: string
  summary: string
  content: string
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

const FRONTEND_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ggb.com.tw'

export default function NewsPage() {
  const [news, setNews]               = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingNews, setEditingNews] = useState<NewsArticle | null>(null)
  const [filterCat, setFilterCat]     = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [formData, setFormData] = useState({
    title:     '',
    summary:   '',
    content:   '',
    image_url: '',
    category:  'general',
    is_active: false,
  })

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setNews(data || [])
    } catch (err) {
      console.error('Error fetching news:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = news.filter(n => {
    if (filterCat !== 'all' && n.category !== filterCat) return false
    if (filterStatus === 'active'  && !n.is_active) return false
    if (filterStatus === 'draft'   &&  n.is_active) return false
    return true
  })

  const handleEdit = (article: NewsArticle) => {
    setEditingNews(article)
    setFormData({
      title:     article.title,
      summary:   article.summary || '',
      content:   article.content || '',
      image_url: article.image_url || '',
      category:  article.category || 'general',
      is_active: article.is_active,
    })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingNews(null)
    setFormData({ title: '', summary: '', content: '', image_url: '', category: 'general', is_active: false })
    setIsModalOpen(true)
  }

  const handleToggleActive = async (article: NewsArticle) => {
    const { error } = await supabase
      .from('news')
      .update({ is_active: !article.is_active })
      .eq('id', article.id)
    if (!error) fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此文章嗎？')) return
    const { error } = await supabase.from('news').delete().eq('id', id)
    if (!error) fetchData()
    else alert('刪除失敗')
  }

  const handleSubmit = async () => {
    if (!formData.title) { alert('請輸入標題'); return }
    const payload = {
      title:     formData.title,
      summary:   formData.summary || null,
      content:   formData.content,
      image_url: formData.image_url || null,
      category:  formData.category,
      is_active: formData.is_active,
    }
    let error: any
    if (editingNews) {
      ;({ error } = await supabase.from('news').update(payload).eq('id', editingNews.id))
    } else {
      const id = Math.floor(10000000 + Math.random() * 90000000).toString()
      ;({ error } = await supabase.from('news').insert([{ ...payload, id }]))
    }
    if (error) { alert('儲存失敗：' + error.message); return }
    setIsModalOpen(false)
    fetchData()
  }

  const columns: Column<NewsArticle>[] = [
    {
      key: 'image_url',
      label: '圖片',
      render: (item) => item.image_url
        ? <img src={item.image_url} alt="" className="w-14 h-10 object-cover rounded" />
        : <div className="w-14 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs">無圖</div>
    },
    {
      key: 'title',
      label: '標題',
      sortable: true,
      render: (item) => (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{item.title}</div>
          {item.summary && <div className="text-xs text-gray-400 truncate mt-0.5">{item.summary}</div>}
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline truncate block mt-0.5">
              來源
            </a>
          )}
        </div>
      )
    },
    {
      key: 'category',
      label: '分類',
      render: (item) => (
        <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700">
          {CATEGORY_LABELS[item.category] ?? item.category}
        </span>
      )
    },
    {
      key: 'is_active',
      label: '狀態',
      render: (item) => (
        <button onClick={() => handleToggleActive(item)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            item.is_active
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}>
          {item.is_active ? '已上架' : '下架'}
        </button>
      )
    },
    {
      key: 'created_at',
      label: '建立時間',
      sortable: true,
      render: (item) => <span className="text-gray-400 text-xs">{formatDateTime(item.created_at)}</span>
    },
    {
      key: 'actions',
      label: '操作',
      render: (item) => (
        <div className="flex items-center gap-2">
          <button onClick={() => handleEdit(item)} className="text-blue-500 hover:text-blue-700 text-sm">編輯</button>
          <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 text-sm">刪除</button>
        </div>
      )
    },
  ]

  const draftCount  = news.filter(n => !n.is_active).length
  const activeCount = news.filter(n =>  n.is_active).length

  return (
    <AdminLayout pageTitle="文章管理" breadcrumbs={[{ label: '文章管理', href: '/news' }]}>
      <div className="space-y-4">

        {/* 統計 + 篩選 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">共 {news.length} 篇</span>
            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">已上架 {activeCount}</span>
            <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">下架草稿 {draftCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="text-sm border rounded px-2 py-1">
              <option value="all">全部狀態</option>
              <option value="active">已上架</option>
              <option value="draft">下架</option>
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="text-sm border rounded px-2 py-1">
              <option value="all">全部分類</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button onClick={handleAdd}
              className="px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm">
              + 新增文章
            </button>
          </div>
        </div>

        {draftCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
            有 {draftCount} 篇下架草稿（含 AI 自動採集），審閱後點「下架」按鈕切換為上架。
          </div>
        )}

        <PageCard>
          <DataTable
            data={filtered}
            columns={columns}
            keyField="id"
            emptyMessage="尚無文章資料"
          />
        </PageCard>

        {/* 編輯 Modal */}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
          title={editingNews ? '編輯文章' : '新增文章'}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
              <input type="text" value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="文章標題" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">一句話摘要</label>
              <input type="text" value={formData.summary}
                onChange={e => setFormData({ ...formData, summary: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="50 字以內摘要（列表預覽用）" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
                <select value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">主圖 URL</label>
                <input type="text" value={formData.image_url}
                  onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="https://..." />
              </div>
            </div>

            {formData.image_url && (
              <img src={formData.image_url} alt="preview"
                className="w-full h-32 object-cover rounded-lg border" />
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">內容（HTML）</label>
              <textarea value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-48 font-mono text-sm"
                placeholder="<p>文章內容...</p>" />
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded text-primary" />
                <span className="text-sm font-medium text-gray-700">立即上架至前台</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleSubmit}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark">儲存</button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  )
}
