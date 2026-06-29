'use client'

import { AdminLayout, PageCard, Modal, DataTable, type Column } from '@/components'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'

interface NewsArticle {
  id: string
  title: string
  content: string
  is_active: boolean
  created_at: string
  view_count: number
}

const FRONTEND_URL = 'http://localhost:3001'

export default function NewsPage() {
  const [news, setNews] = useState<NewsArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingNews, setEditingNews] = useState<NewsArticle | null>(null)
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    is_active: true
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
    } catch (error) {
      console.error('Error fetching news:', error)
      // alert('載入文章失敗')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const generateId = () => {
    return Math.floor(10000000 + Math.random() * 90000000).toString()
  }

  const handleEdit = (article: NewsArticle) => {
    setEditingNews(article)
    setFormData({
      title: article.title,
      content: article.content || '',
      is_active: article.is_active
    })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingNews(null)
    setFormData({
      title: '',
      content: '',
      is_active: true
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此文章嗎？')) return

    try {
      const { error } = await supabase
        .from('news')
        .delete()
        .eq('id', id)

      if (error) throw error
      fetchData()
    } catch (error) {
      console.error('Error deleting news:', error)
      alert('刪除失敗')
    }
  }

  const handleSubmit = async () => {
    try {
      if (!formData.title) {
        alert('請輸入標題')
        return
      }

      const payload = {
        title: formData.title,
        content: formData.content,
        is_active: formData.is_active
      }

      if (editingNews) {
        const { error } = await supabase
          .from('news')
          .update(payload)
          .eq('id', editingNews.id)

        if (error) throw error
      } else {
        const newId = generateId()
        // Check for collision (optional but good practice, though unlikely with 8 digits and low volume)
        // For now we assume uniqueness
        const { error } = await supabase
          .from('news')
          .insert([{ ...payload, id: newId }])

        if (error) throw error
      }

      setIsModalOpen(false)
      fetchData()
    } catch (error) {
      console.error('Error saving news:', error)
      alert('儲存失敗')
    }
  }

  const columns: Column<NewsArticle>[] = [
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      render: (item) => <span className="font-mono text-gray-500">{item.id}</span>
    },
    {
      key: 'title',
      label: '標題',
      sortable: true,
      render: (item) => (
        <div>
          <div className="font-medium text-gray-900">{item.title}</div>
          <a 
            href={`${FRONTEND_URL}/news/${item.id}`} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-xs text-blue-500 hover:underline mt-1 block"
          >
            {`${FRONTEND_URL}/news/${item.id}`}
          </a>
        </div>
      )
    },
    {
      key: 'is_active',
      label: '狀態',
      render: (item) => (
        <span className={`px-2 py-1 rounded text-xs ${
          item.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {item.is_active ? '發布' : '草稿'}
        </span>
      )
    },
    {
      key: 'created_at',
      label: '發布時間',
      sortable: true,
      render: (item) => <span className="text-gray-500 text-sm">{formatDateTime(item.created_at)}</span>
    },
    {
      key: 'actions',
      label: '操作',
      render: (item) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(item)}
            className="text-blue-500 hover:text-blue-700 text-sm font-medium"
          >
            編輯
          </button>
          <button
            onClick={() => handleDelete(item.id)}
            className="text-red-500 hover:text-red-700 text-sm font-medium"
          >
            刪除
          </button>
        </div>
      )
    }
  ]

  return (
    <AdminLayout pageTitle="文章管理" breadcrumbs={[{ label: '文章管理', href: '/news' }]}>
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            + 新增文章
          </button>
        </div>

        <PageCard>
          <DataTable
            data={news}
            columns={columns}
            keyField="id"
            emptyMessage="尚無文章資料"
          />
        </PageCard>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingNews ? '編輯文章' : '新增文章'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">標題</label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="輸入文章標題..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">內容</label>
              <textarea
                value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-40"
                placeholder="輸入文章內容..."
              />
            </div>

            <div className="flex items-center pt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium text-gray-700">立即發布</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t mt-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
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
