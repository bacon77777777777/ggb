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
  const router = useRouter()
  const params = useParams()
  const id     = params.id as string
  const isNew  = id === 'new'

  const [isLoading,   setIsLoading]   = useState(!isNew)
  const [isSaving,    setIsSaving]    = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const [form, setForm] = useState({
    title:      '',
    summary:    '',
    content:    '',
    image_url:  '',
    category:   'general',
    source_url: '',
    tags:       '',
    is_active:  false,
  })

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

  const handleSave = async () => {
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
        is_active:  form.is_active,
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
  const labelCls = "block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5"

  return (
    <AdminLayout pageTitle={isNew ? '新增文章' : '編輯文章'}>
      <div className="flex gap-5 items-start pb-8">

        {/* ── 左欄：主內容 ── */}
        <div className="flex-1 min-w-0 space-y-4">

          <PageCard>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>標題 *</label>
                <input type="text" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className={inputCls} placeholder="文章標題" />
              </div>
              <div>
                <label className={labelCls}>一句話摘要</label>
                <input type="text" value={form.summary}
                  onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                  className={inputCls} placeholder="50 字以內，列表預覽用" />
              </div>
            </div>
          </PageCard>

          <PageCard title="內容（HTML）">
            <textarea value={form.content ?? ''}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              className={`${inputCls} font-mono`}
              style={{ minHeight: '420px', resize: 'vertical' }}
              placeholder="<h2>小標</h2><p>段落...</p>" />
          </PageCard>

        </div>

        {/* ── 右欄：設定 sidebar ── */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* 發布操作 */}
          <PageCard>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-neutral-700">狀態</span>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className="flex items-center gap-2">
                  <div className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${form.is_active ? 'bg-primary' : 'bg-neutral-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className={`text-sm font-semibold ${form.is_active ? 'text-primary' : 'text-neutral-400'}`}>
                    {form.is_active ? '上架' : '草稿'}
                  </span>
                </button>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => router.push('/news')}
                  className="flex-1 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 text-sm font-medium text-neutral-600">
                  取消
                </button>
                <button onClick={handleSave} disabled={isSaving}
                  className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-semibold disabled:opacity-50">
                  {isSaving ? '儲存中...' : '儲存'}
                </button>
              </div>
            </div>
          </PageCard>

          {/* 主圖 */}
          <PageCard title="主圖">
            <div className="space-y-2">
              <div className="flex gap-2">
                <input type="text" value={form.image_url}
                  onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                  className={`${inputCls} flex-1 text-xs`} placeholder="貼上圖片網址..." />
                <label className={`px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap transition-colors flex-shrink-0 ${
                  isUploading ? 'bg-neutral-100 text-neutral-400 border-neutral-200' : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}>
                  {isUploading ? '...' : '上傳'}
                  <input type="file" accept="image/*" className="hidden" disabled={isUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }} />
                </label>
              </div>
              {form.image_url ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img src={form.image_url} alt="preview" className="w-full object-cover" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 hover:bg-black/70 text-white rounded-full text-xs flex items-center justify-center">
                    ✕
                  </button>
                </div>
              ) : (
                <div className="w-full h-32 rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center text-neutral-300 text-xs">
                  無主圖
                </div>
              )}
            </div>
          </PageCard>

          {/* 分類 */}
          <PageCard title="分類與標籤">
            <div className="space-y-3">
              <div>
                <label className={labelCls}>分類</label>
                <select value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className={inputCls}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>標籤（逗號分隔）</label>
                <input type="text" value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  className={inputCls} placeholder="一番賞, 鬼滅之刃" />
              </div>
              <div>
                <label className={labelCls}>來源網址</label>
                <input type="text" value={form.source_url}
                  onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                  className={`${inputCls} text-xs`} placeholder="https://..." />
              </div>
            </div>
          </PageCard>

        </div>
      </div>
    </AdminLayout>
  )
}
