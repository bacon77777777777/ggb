'use client'

import AdminLayout from '@/components/AdminLayout'
import { PageCard } from '@/components'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_LABELS: Record<string, string> = {
  ichiban:  '一番賞',
  gacha:    '轉蛋',
  blindbox: '盒玩',
  tcg:      '卡牌',
  general:  '綜合',
}

export default function NewsEditPage() {
  const router   = useRouter()
  const params   = useParams()
  const id       = params.id as string
  const isNew    = id === 'new'

  const [isLoading,   setIsLoading]   = useState(!isNew)
  const [isSaving,    setIsSaving]    = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const [form, setForm] = useState({
    title:     '',
    summary:   '',
    content:   '',
    image_url: '',
    category:  'general',
    source_url: '',
    tags:      '',
    is_active: false,
  })

  // 載入現有文章
  useEffect(() => {
    if (isNew) return
    supabase.from('news').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error || !data) { alert('找不到此文章'); router.push('/news'); return }
      setForm({
        title:      data.title ?? '',
        summary:    data.summary ?? '',
        content:    data.content ?? '',
        image_url:  data.image_url ?? '',
        category:   data.category ?? 'general',
        source_url: data.source_url ?? '',
        tags:       (data.tags ?? []).join(', '),
        is_active:  data.is_active ?? false,
      })
      setIsLoading(false)
    })
  }, [id, isNew, router])

  const handleImageUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('bucket', 'news')
      fd.append('path', `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      const res  = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { alert(data?.error ?? '上傳失敗'); return }
      setForm(f => ({ ...f, image_url: data.publicUrl }))
    } catch { alert('上傳失敗') } finally { setIsUploading(false) }
  }

  const handleSave = async (publish?: boolean) => {
    if (!form.title.trim()) { alert('請輸入標題'); return }
    setIsSaving(true)
    try {
      const payload = {
        title:      form.title.trim(),
        summary:    form.summary || null,
        content:    form.content || null,
        image_url:  form.image_url || null,
        category:   form.category,
        source_url: form.source_url || null,
        tags:       form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        is_active:  publish !== undefined ? publish : form.is_active,
      }
      if (isNew) {
        const newId = Math.floor(10000000 + Math.random() * 90000000).toString()
        const { error } = await supabase.from('news').insert([{ ...payload, id: newId }])
        if (error) { alert('儲存失敗：' + error.message); return }
      } else {
        const { error } = await supabase.from('news').update(payload).eq('id', id)
        if (error) { alert('儲存失敗：' + error.message); return }
      }
      router.push('/news')
    } finally { setIsSaving(false) }
  }

  if (isLoading) {
    return (
      <AdminLayout pageTitle={isNew ? '新增文章' : '編輯文章'}>
        <div className="flex items-center justify-center h-48 text-neutral-400">載入中...</div>
      </AdminLayout>
    )
  }

  const inputCls = "w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"

  return (
    <AdminLayout pageTitle={isNew ? '新增文章' : '編輯文章'}>
      <div className="max-w-3xl mx-auto space-y-5">

        {/* ── 標題 + 摘要 ── */}
        <PageCard>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">標題 *</label>
              <input type="text" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className={inputCls} placeholder="文章標題" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">一句話摘要</label>
              <input type="text" value={form.summary}
                onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                className={inputCls} placeholder="50 字以內，列表預覽用" />
            </div>
          </div>
        </PageCard>

        {/* ── 主圖 ── */}
        <PageCard title="主圖">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input type="text" value={form.image_url}
                onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                className={`${inputCls} flex-1`} placeholder="貼上圖片網址..." />
              <label className={`px-4 py-2.5 rounded-lg border text-sm font-medium cursor-pointer whitespace-nowrap transition-colors flex-shrink-0 ${
                isUploading ? 'bg-neutral-100 text-neutral-400 border-neutral-200' : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}>
                {isUploading ? '上傳中...' : '上傳圖片'}
                <input type="file" accept="image/*" className="hidden" disabled={isUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }} />
              </label>
            </div>
            {form.image_url && (
              <div className="relative rounded-xl overflow-hidden">
                <img src={form.image_url} alt="preview" className="w-full max-h-72 object-cover" />
                <button type="button" onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full text-xs flex items-center justify-center">
                  ✕
                </button>
              </div>
            )}
          </div>
        </PageCard>

        {/* ── 內容 ── */}
        <PageCard title="內容（HTML）">
          <textarea value={form.content ?? ''}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            className={`${inputCls} h-80 font-mono`}
            placeholder="<h2>小標</h2><p>段落...</p>" />
        </PageCard>

        {/* ── 分類 / 標籤 / 來源 ── */}
        <PageCard title="分類與標籤">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">分類</label>
              <select value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className={inputCls}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">標籤（逗號分隔）</label>
              <input type="text" value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                className={inputCls} placeholder="一番賞, 鬼滅之刃, 2026" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">來源網址</label>
              <input type="text" value={form.source_url}
                onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                className={inputCls} placeholder="https://..." />
            </div>
          </div>
        </PageCard>

        {/* ── 操作列 ── */}
        <div className="flex items-center justify-between gap-3 pb-8">
          <button onClick={() => router.push('/news')}
            className="px-5 py-2.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 text-sm font-medium">
            取消
          </button>
          <div className="flex items-center gap-3">
            {/* 上架狀態 toggle */}
            <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors">
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_active ? 'bg-primary' : 'bg-neutral-300'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm font-medium text-neutral-700">
                {form.is_active ? '上架' : '草稿'}
              </span>
            </button>
            <button onClick={() => handleSave()} disabled={isSaving}
              className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-semibold disabled:opacity-50">
              {isSaving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}
