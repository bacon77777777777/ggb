'use client'

import { AdminLayout, ListTableCard, RowAction, type ListColumn } from '@/components'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

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
  tcg:     'bg-primary/10 text-primary',
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
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()
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
      if (!res.ok) { toast(data?.error ?? '生成失敗', 'error'); return }
      const r = data.skipReasons ?? {}
      const detail = [
        r.duplicate  ? `重複${r.duplicate}` : '',
        r.noImage    ? `無圖${r.noImage}` : '',
        r.claudeReject ? `Claude拒絕${r.claudeReject}` : '',
        r.titleDup   ? `標題重複${r.titleDup}` : '',
        r.insertErr  ? `寫入錯誤${r.insertErr}` : '',
      ].filter(Boolean).join('、')
      toast(`完成！新增 ${data.written ?? 0} 篇，跳過 ${data.skipped ?? 0} 篇\n${detail || '（重複或無圖）'}`, 'success')
      fetchData()
    } catch { toast('生成失敗', 'error') } finally { setIsGenerating(false) }
  }

  // 篩選（記憶）
  const [filterStatus, setFilterStatus] = useState<string>(prefs.filterStatus ?? 'all')
  const [filterCat,    setFilterCat]    = useState<string>(prefs.filterCat    ?? 'all')
  const [searchQ,      setSearchQ]      = useState<string>(prefs.searchQ      ?? '')

  useEffect(() => { savePrefs({ filterStatus, filterCat, searchQ }) },
    [filterStatus, filterCat, searchQ])

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

  // ─── 過濾（排序交給 ListTableCard） ──────────────────────────────────────
  const filtered = useMemo(() => {
    let arr = [...news]

    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      arr = arr.filter(n => n.title.toLowerCase().includes(q) || (n.summary ?? '').toLowerCase().includes(q))
    }
    if (filterCat !== 'all')       arr = arr.filter(n => n.category === filterCat)
    if (filterStatus === 'active') arr = arr.filter(n =>  n.is_active)
    if (filterStatus === 'draft')  arr = arr.filter(n => !n.is_active)

    return arr
  }, [news, searchQ, filterCat, filterStatus])

  // ─── 上架開關（Switch 樂觀更新，失敗重抓） ───────────────────────────────
  const handleToggleActive = async (article: NewsArticle, next: boolean) => {
    setNews(prev => prev.map(n => n.id === article.id ? { ...n, is_active: next } : n))
    const res = await fetch('/api/admin/news', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ id: article.id, is_active: next }),
    })
    if (!res.ok) { fetchData(); toast('更新失敗', 'error') }
  }

  // ─── 批次操作（勾選走 ListTableCard 的 selectable）─────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set())

  const handleBatchSetActive = async (isActive: boolean) => {
    const ids = [...selectedIds]
    await fetch('/api/admin/news', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ ids, is_active: isActive }),
    })
    setNews(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, is_active: isActive } : n))
    setSelectedIds(new Set())
  }

  const handleBatchDelete = () => {
    confirm({
      title: '確認操作',
      message: `確定要刪除選取的 ${selectedIds.size} 篇文章嗎？`,
      onConfirm: async () => {
        const ids = [...selectedIds]
        await fetch('/api/admin/news', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ ids, action: 'delete' }),
        })
        setNews(prev => prev.filter(n => !selectedIds.has(n.id)))
        setSelectedIds(new Set())
      },
    })
  }

  // ─── 刪除 ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    confirm({
      title: '確認操作',
      message: "確定要刪除此文章嗎？",
      onConfirm: async () => {
      const res = await fetch('/api/admin/news', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ids: [id], action: 'delete' }),
      })
      if (res.ok) setNews(prev => prev.filter(n => n.id !== id))
      else toast('刪除失敗', 'error')
      },
    })
  }

  // ─── 編輯 / 新增 ──────────────────────────────────────────────────────────
  const handleEdit = (article: NewsArticle) => router.push(`/news/${article.id}`)
  const handleAdd  = ()                      => router.push('/news/new')

  const activeCount = news.filter(n =>  n.is_active).length
  const draftCount  = news.filter(n => !n.is_active).length

  const columns: ListColumn<NewsArticle>[] = [
    {
      key: 'image', label: '圖片',
      render: n => n.image_url
        ? <img src={n.image_url} alt="" className="w-14 h-10 object-cover rounded-lg" />
        : <div className="w-14 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-300 text-[10px] font-bold">無圖</div>,
    },
    {
      key: 'title', label: '標題',
      sortValue: n => n.title,
      render: n => (
        <div className="max-w-xs whitespace-normal">
          <div className="font-semibold text-neutral-800 line-clamp-1">{n.title}</div>
          {n.summary && (
            <div className="text-xs text-neutral-400 line-clamp-1 mt-0.5">{n.summary}</div>
          )}
          {n.source_url && (
            <a href={n.source_url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline mt-0.5 block truncate">
              來源
            </a>
          )}
        </div>
      ),
    },
    {
      key: 'category', label: '分類',
      sortValue: n => n.category,
      render: n => (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CATEGORY_COLORS[n.category] ?? 'bg-neutral-100 text-neutral-500'}`}>
          {CATEGORY_LABELS[n.category] ?? n.category}
        </span>
      ),
    },
    {
      key: 'active', label: '上架',
      sortValue: n => (n.is_active ? 1 : 0),
      render: n => (
        <Switch checked={n.is_active} onCheckedChange={next => void handleToggleActive(n, next)} />
      ),
    },
    {
      key: 'viewCount', label: '瀏覽',
      sortValue: n => n.view_count ?? 0,
      render: n => <>{n.view_count ?? 0}</>,
    },
    {
      key: 'createdAt', label: '建立時間',
      sortValue: n => new Date(n.created_at).getTime(),
      className: 'font-mono',
      render: n => <>{formatDateTime(n.created_at)}</>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: n => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => handleEdit(n)}>編輯</RowAction>
          <RowAction tone="danger" onClick={() => handleDelete(n.id)}>刪除</RowAction>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="文章管理">
      <div className="space-y-6">

        {/* ── 統計列 ── */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-500">共 {news.length} 篇</span>
          <Badge variant="success">已上架 {activeCount}</Badge>
          <Badge variant="default">下架草稿 {draftCount}</Badge>
          {filtered.length !== news.length && (
            <span className="text-neutral-400 text-xs">篩選後顯示 {filtered.length} 篇</span>
          )}
        </div>

        <ListTableCard
          pageKey="news"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage={news.length === 0 ? '尚無文章資料' : '沒有符合條件的文章'}
          defaultSortField="createdAt"
          defaultSortDirection="desc"
          searchPlaceholder="搜尋標題..."
          searchValue={searchQ}
          onSearchChange={setSearchQ}
          addButtonText="+ 新增文章"
          onAddClick={handleAdd}
          filters={[
            {
              key: 'status', label: '狀態',
              value: filterStatus, onChange: setFilterStatus,
              options: [
                { value: 'all',    label: '全部狀態' },
                { value: 'active', label: '已上架' },
                { value: 'draft',  label: '下架草稿' },
              ],
            },
            {
              key: 'category', label: '分類',
              value: filterCat, onChange: setFilterCat,
              options: [
                { value: 'all', label: '全部分類' },
                ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v })),
              ],
            },
          ]}
          toolbarChildren={
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {isGenerating ? '生成中...' : '⚡ 生成文章'}
            </button>
          }
          selectable
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          batchActions={[
            { label: '批量上架', onClick: () => void handleBatchSetActive(true), variant: 'primary' },
            { label: '批量下架', onClick: () => void handleBatchSetActive(false), variant: 'secondary' },
            { label: '批量刪除', onClick: handleBatchDelete, variant: 'danger' },
          ]}
        />

      </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
