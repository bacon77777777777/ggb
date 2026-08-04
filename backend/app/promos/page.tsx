'use client'

/**
 * 推廣素材管理 —— 首頁彈窗與底部警語列
 *
 * 首波內容是公平性推廣，但機制是通用的：活動推廣、公告都用同一張表，
 * 差在 kind（彈窗／警語列）與 placements（出現在哪些頁）。
 */

import { useEffect, useState } from 'react'
import { AdminLayout, PageCard, Modal } from '@/components'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import ScheduleFields from '@/components/ScheduleFields'
import { useToast } from '@/contexts/ToastContext'

interface Promo {
  id: string
  kind: 'popup' | 'notice'
  title: string | null
  body: string
  image_url: string | null
  cta_text: string | null
  cta_href: string | null
  placements: string[]
  audience: 'all' | 'logged_in' | 'logged_out'
  layout: 'card' | 'image'
  is_active: boolean
  start_at: string | null
  end_at: string | null
  dismiss_mode: 'always' | 'days' | 'never'
  dismiss_days: number
  sort_order: number
}

const INPUT = 'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm'

const KIND_LABEL: Record<Promo['kind'], string> = {
  popup:  '首頁彈窗',
  notice: '底部警語列',
}

const PLACEMENT_OPTIONS = [
  { value: 'home',      label: '首頁' },
  { value: 'item_fair', label: '一番賞／抽卡／自製賞內頁' },
]

const AUDIENCE_LABEL: Record<Promo['audience'], string> = {
  all:        '全部',
  logged_in:  '已登入',
  logged_out: '未登入',
}

const EMPTY: Omit<Promo, 'id'> = {
  kind: 'popup',
  title: '',
  body: '',
  image_url: '',
  cta_text: '',
  cta_href: '',
  placements: ['home'],
  audience: 'all',
  layout: 'card',
  is_active: true,
  start_at: null,
  end_at: null,
  dismiss_mode: 'days',
  dismiss_days: 7,
  sort_order: 0,
}

export default function PromosPage() {
  const { toast } = useToast()
  const [promos, setPromos] = useState<Promo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editing, setEditing] = useState<(Omit<Promo, 'id'> & { id?: string }) | null>(null)
  const [saving, setSaving] = useState(false)

  // 天數用字串存，不直接綁 number：
  //   綁 number 時清空欄位會被 Number('') 轉成 0 又寫回去，退位鍵等於無效；
  //   而 React 對 type=number 在「數值相等」時不會覆蓋 DOM，所以 0 前面打 7 會留成 07。
  const [dismissInput, setDismissInput] = useState('')

  // 「點擊後前往」的下拉來源。除了活動頁，也保留自行填寫——
  // 之後要導去 /challenge、/topup 這類非活動頁時才不會被鎖死
  const [events, setEvents] = useState<{ slug: string; title: string }[]>([])
  const [customHref, setCustomHref] = useState(false)

  // 圖片選好後先留在本地預覽，按儲存才真的上傳，避免取消編輯留下孤兒檔
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploading, setUploading] = useState(false)

  const openEditor = (p: (Omit<Promo, 'id'> & { id?: string })) => {
    setEditing(p)
    setDismissInput(String(p.dismiss_days))
    setImageFile(null)
    setImagePreview(p.image_url ?? '')
    const href = p.cta_href ?? ''
    setCustomHref(!!href && !href.startsWith('/events/'))
  }

  const onPickImage = (file: File | null) => {
    setImageFile(file)
    setImagePreview(file ? URL.createObjectURL(file) : (editing?.image_url ?? ''))
  }

  /** 回傳最終要存的圖片網址；沒選新檔就沿用舊的 */
  const uploadIfNeeded = async (): Promise<string | null> => {
    if (!imageFile) return editing?.image_url || null
    const ext = (imageFile.name.split('.').pop() || '').trim() || 'png'
    const form = new FormData()
    form.append('file', imageFile)
    form.append('bucket', 'promos')
    form.append('path', `promo-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`)
    const res = await fetch('/api/admin/upload', { method: 'POST', body: form })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || '圖片上傳失敗')
    return String(json?.publicUrl || '')
  }

  // 只留數字，去掉前導零（07 → 7），但保留單獨的 0 與清空中的狀態
  const onDismissChange = (raw: string) =>
    setDismissInput(raw.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))

  const dismissDays = dismissInput === '' ? 0 : Number(dismissInput)

  const fetchPromos = async () => {
    setIsLoading(true)
    const res = await fetch('/api/admin/promos')
    const data = await res.json()
    setPromos(data.promos ?? [])
    setIsLoading(false)
  }

  useEffect(() => { fetchPromos() }, [])

  useEffect(() => {
    fetch('/api/admin/events')
      .then(r => r.json())
      .then(d => setEvents(Array.isArray(d) ? d : (d.events ?? [])))
      .catch(() => {})
  }, [])

  const save = async () => {
    if (!editing) return
    if (!editing.body.trim()) { toast(isImagePopup ? '請填圖片說明' : '內容不可空白', 'error'); return }
    if (isImagePopup && !imageFile && !editing.image_url) { toast('純圖片版需要上傳圖片', 'error'); return }
    if (editing.dismiss_mode === 'days' && dismissDays < 1) { toast('請填要隔幾天再出現', 'error'); return }

    setSaving(true)
    let imageUrl: string | null
    try {
      setUploading(true)
      imageUrl = await uploadIfNeeded()
    } catch (e: any) {
      setUploading(false); setSaving(false)
      toast(e?.message || '圖片上傳失敗', 'error'); return
    }
    setUploading(false)

    const res = await fetch('/api/admin/promos', {
      method: editing.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editing,
        dismiss_days: dismissDays,
        title:     editing.title || null,
        image_url: imageUrl,
        cta_text:  editing.cta_text || null,
        cta_href:  editing.cta_href || null,
      }),
    })
    setSaving(false)
    if (!res.ok) { toast((await res.json()).error ?? '儲存失敗', 'error'); return }
    toast(editing.id ? '已更新' : '已新增')
    setEditing(null)
    fetchPromos()
  }

  const toggleActive = async (p: Promo) => {
    await fetch('/api/admin/promos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
    })
    fetchPromos()
  }

  const remove = async (p: Promo) => {
    if (!confirm(`確定刪除「${p.title || p.body.slice(0, 16)}」？`)) return
    await fetch(`/api/admin/promos?id=${p.id}`, { method: 'DELETE' })
    toast('已刪除')
    fetchPromos()
  }

  const isImagePopup = editing?.kind === 'popup' && editing.layout === 'image'

  const togglePlacement = (v: string) => {
    if (!editing) return
    const has = editing.placements.includes(v)
    setEditing({
      ...editing,
      placements: has ? editing.placements.filter(x => x !== v) : [...editing.placements, v],
    })
  }

  return (
    <AdminLayout pageTitle="推廣素材">
      <PageCard>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-neutral-500">
            首頁彈窗與底部警語列的內容。玩家關閉後，依「再出現間隔」的天數才會再跳。
          </p>
          <button
            onClick={() => openEditor({ ...EMPTY })}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
          >
            新增
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-neutral-400 py-8 text-center">載入中…</p>
        ) : promos.length === 0 ? (
          <p className="text-sm text-neutral-400 py-8 text-center">尚無推廣素材</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-left text-neutral-600">
                  <th className="px-3 py-2 font-medium">類型</th>
                  <th className="px-3 py-2 font-medium">內容</th>
                  <th className="px-3 py-2 font-medium">出現位置</th>
                  <th className="px-3 py-2 font-medium">對象</th>
                  <th className="px-3 py-2 font-medium">再出現</th>
                  <th className="px-3 py-2 font-medium">上架</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {promos.map(p => (
                  <tr key={p.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-3 py-2.5">
                      <Badge color={p.kind === 'popup' ? 'purple' : 'gray'}>{KIND_LABEL[p.kind]}</Badge>
                      {p.kind === 'popup' && p.layout === 'image' && (
                        <span className="ml-1"><Badge color="blue">純圖片</Badge></span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-md">
                      {p.kind === 'popup' && p.layout === 'image' ? (
                        <div className="flex items-center gap-2">
                          {p.image_url
                            ? <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover border border-neutral-200" />
                            : <span className="text-red-500 text-xs">尚未設定圖片</span>}
                          <span className="text-neutral-400 text-xs">{p.body}</span>
                        </div>
                      ) : (
                        <>
                          {p.title && <div className="font-medium text-neutral-900">{p.title}</div>}
                          <div className="text-neutral-500 line-clamp-2">{p.body}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600">
                      {p.placements.map(v => PLACEMENT_OPTIONS.find(o => o.value === v)?.label ?? v).join('、') || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600">{AUDIENCE_LABEL[p.audience]}</td>
                    <td className="px-3 py-2.5 text-neutral-600">
                      {p.dismiss_mode === 'always' ? '每次都出現'
                        : p.dismiss_mode === 'never' ? '關閉後不再出現'
                        : `${p.dismiss_days} 天`}
                    </td>
                    <td className="px-3 py-2.5">
                      <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => openEditor(p)} className="text-primary hover:underline mr-3">編輯</button>
                      <button onClick={() => remove(p)} className="text-red-500 hover:underline">刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? '編輯推廣素材' : '新增推廣素材'}
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-neutral-600 mb-1">類型</label>
                <select
                  className={INPUT}
                  value={editing.kind}
                  onChange={e => setEditing({ ...editing, kind: e.target.value as Promo['kind'] })}
                >
                  <option value="popup">首頁彈窗</option>
                  <option value="notice">底部警語列</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-neutral-600 mb-1">對象</label>
                <select
                  className={INPUT}
                  value={editing.audience}
                  onChange={e => setEditing({ ...editing, audience: e.target.value as Promo['audience'] })}
                >
                  <option value="all">全部</option>
                  <option value="logged_in">已登入</option>
                  <option value="logged_out">未登入（拉新）</option>
                </select>
              </div>
            </div>

            {editing.kind === 'popup' && (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">版型</label>
                <select
                  className={INPUT}
                  value={editing.layout}
                  onChange={e => setEditing({ ...editing, layout: e.target.value as Promo['layout'] })}
                >
                  <option value="card">卡片（圖＋標題＋內文＋按鈕）</option>
                  <option value="image">純圖片（整張圖點擊即跳轉）</option>
                </select>
              </div>
            )}

            {editing.kind === 'popup' && editing.layout === 'card' && (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">標題</label>
                <input className={INPUT} value={editing.title ?? ''}
                  onChange={e => setEditing({ ...editing, title: e.target.value })} />
              </div>
            )}

            {isImagePopup ? (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">圖片說明</label>
                <input className={INPUT} value={editing.body}
                  placeholder="例：跨年五折活動"
                  onChange={e => setEditing({ ...editing, body: e.target.value })} />
                <p className="text-xs text-neutral-400 mt-1">
                  不會顯示在畫面上。圖片載入失敗時會顯示這段字，讀螢幕軟體也會念出來。
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">內容</label>
                <textarea className={INPUT} rows={editing.kind === 'popup' ? 4 : 2}
                  value={editing.body}
                  onChange={e => setEditing({ ...editing, body: e.target.value })} />
                <p className="text-xs text-neutral-400 mt-1">
                  寫給玩家看的話，不要出現路徑、欄位名或內部代號。
                </p>
              </div>
            )}

            {editing.kind === 'popup' && (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">
                  圖片{isImagePopup ? ' *' : '（選填）'}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className={INPUT}
                  onChange={e => onPickImage(e.target.files?.[0] ?? null)}
                />
                {imagePreview && (
                  <div className="mt-2 relative inline-block">
                    <img
                      src={imagePreview}
                      alt="預覽"
                      className="max-h-48 rounded-lg border border-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(''); setEditing({ ...editing, image_url: null }) }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-neutral-900 text-white text-xs leading-none"
                      aria-label="移除圖片"
                    >
                      ×
                    </button>
                  </div>
                )}
                <p className="text-xs text-neutral-400 mt-1">
                  {isImagePopup
                    ? '整張圖直接顯示，比例不限。建議寬度 1080 以上，文案畫在圖裡。'
                    : '顯示在標題上方，會裁切成 4:3。建議 1080 x 810。'}
                </p>
              </div>
            )}

            <div className={isImagePopup ? '' : 'grid grid-cols-2 gap-3'}>
              {!isImagePopup && (
                <div>
                  <label className="block text-sm text-neutral-600 mb-1">按鈕文字</label>
                  <input className={INPUT} value={editing.cta_text ?? ''}
                    onChange={e => setEditing({ ...editing, cta_text: e.target.value })} />
                </div>
              )}
              <div>
                <label className="block text-sm text-neutral-600 mb-1">
                  {isImagePopup ? '點擊後前往' : '按鈕連結'}
                </label>
                <select
                  className={INPUT}
                  value={customHref ? '__custom__' : (editing.cta_href ?? '')}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '__custom__') { setCustomHref(true); return }
                    setCustomHref(false)
                    setEditing({ ...editing, cta_href: v || null })
                  }}
                >
                  <option value="">不跳轉</option>
                  {events.map(ev => (
                    <option key={ev.slug} value={`/events/${ev.slug}`}>
                      {ev.title}（/events/{ev.slug}）
                    </option>
                  ))}
                  <option value="__custom__">其他頁面（自行填寫）</option>
                </select>
                {customHref && (
                  <input
                    className={`${INPUT} mt-2`}
                    placeholder="/challenge"
                    value={editing.cta_href ?? ''}
                    onChange={e => setEditing({ ...editing, cta_href: e.target.value || null })}
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm text-neutral-600 mb-1">出現位置</label>
              <div className="flex flex-wrap gap-2">
                {PLACEMENT_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => togglePlacement(o.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      editing.placements.includes(o.value)
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-neutral-600 mb-1">玩家按下叉叉後</label>
              <div className="flex gap-2">
                <select
                  className={INPUT}
                  value={editing.dismiss_mode}
                  onChange={e => setEditing({ ...editing, dismiss_mode: e.target.value as Promo['dismiss_mode'] })}
                >
                  <option value="always">每次進來都出現</option>
                  <option value="days">隔幾天再出現</option>
                  <option value="never">不再出現</option>
                </select>
                {editing.dismiss_mode === 'days' && (
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${INPUT} max-w-[110px]`}
                    value={dismissInput}
                    placeholder="天數"
                    onChange={e => onDismissChange(e.target.value)}
                  />
                )}
              </div>
            </div>

            <ScheduleFields
              startAt={editing.start_at}
              endAt={editing.end_at}
              onChange={patch => setEditing({ ...editing, ...patch })}
              unlimitedToggle
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                {uploading ? '上傳圖片中…' : saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
