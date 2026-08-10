'use client'

/**
 * 首頁彈窗管理 —— 輪播圖管理頁的第三個頁籤
 *
 * 底部警語列不在這裡：它的內容與出現規則寫死在前台 NoticeBar，
 * 那條專為公平性存在，做成可編輯只會被拿去放不相干的訊息。
 */

import { useEffect, useState } from 'react'
import { Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import SelectField from '@/components/ui/SelectField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import FileInput from '@/components/ui/FileInput'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import ScheduleFields from '@/components/ScheduleFields'
import { useToast } from '@/contexts/ToastContext'

interface Promo {
  id: string
  title: string | null
  body: string
  image_url: string | null
  cta_text: string | null
  cta_href: string | null
  placements: string[]
  layout: 'card' | 'image'
  is_active: boolean
  start_at: string | null
  end_at: string | null
  sort_order: number
  created_at?: string
}

/** 全站統一的投放規則（platform_settings），逐則不再各自設定 */
interface Rules {
  promo_audience: 'all' | 'logged_in' | 'logged_out'
  promo_dismiss_mode: 'always' | 'days' | 'never'
  promo_dismiss_days: string
}

const EMPTY: Omit<Promo, 'id'> = {
  title: '',
  body: '',
  image_url: '',
  cta_text: '',
  cta_href: '',
  placements: ['home'],
  layout: 'card',
  is_active: true,
  start_at: null,
  end_at: null,
  sort_order: 0,
}

export default function PopupPanel() {
  const { toast } = useToast()
  const [promos, setPromos] = useState<Promo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editing, setEditing] = useState<(Omit<Promo, 'id'> & { id?: string }) | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 排序用字串存，不直接綁 number：
  //   綁 number 時清空欄位會被 Number('') 轉成 0 又寫回去，退位鍵等於無效；
  //   而 React 對 type=number 在「數值相等」時不會覆蓋 DOM，所以 0 前面打 7 會留成 07。
  const [rules, setRules] = useState<Rules>({
    promo_audience: 'all', promo_dismiss_mode: 'always', promo_dismiss_days: '7',
  })
  const [savingRules, setSavingRules] = useState(false)
  const [dismissInput, setDismissInput] = useState('')

  // 「點擊後前往」的下拉來源。除了活動頁，也保留自行填寫——
  // 之後要導去 /challenge、/topup 這類非活動頁時才不會被鎖死
  const [events, setEvents] = useState<{ slug: string; title: string }[]>([])
  const [announcements, setAnnouncements] = useState<{ id: string; title: string }[]>([])
  /** 連結目標的種類，由現有 cta_href 反推 */
  const [linkKind, setLinkKind] = useState<'none' | 'event' | 'announcement'>('none')

  // 圖片選好後先留在本地預覽，按儲存才真的上傳，避免取消編輯留下孤兒檔
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploading, setUploading] = useState(false)

  const openEditor = (p: (Omit<Promo, 'id'> & { id?: string })) => {
    setEditing(p)
    setDismissInput(String(p.sort_order))
    setImageFile(null)
    setImagePreview(p.image_url ?? '')
    const href = p.cta_href ?? ''
    setLinkKind(
      href.startsWith('/events/') ? 'event'
        : href.startsWith('/announcements/') ? 'announcement'
        : 'none',
    )
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


  const fetchPromos = async () => {
    setIsLoading(true)
    const res = await fetch('/api/admin/promos')
    const data = await res.json()
    setPromos(data.promos ?? [])
    setIsLoading(false)
  }

  useEffect(() => { fetchPromos() }, [])

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then((d: Record<string, string>) => setRules(prev => ({
        promo_audience:     (d.promo_audience as Rules['promo_audience']) || prev.promo_audience,
        promo_dismiss_mode: (d.promo_dismiss_mode as Rules['promo_dismiss_mode']) || prev.promo_dismiss_mode,
        promo_dismiss_days: d.promo_dismiss_days || prev.promo_dismiss_days,
      })))
      .catch(() => {})
  }, [])

  const saveRules = async (patch: Partial<Rules>) => {
    const next = { ...rules, ...patch }
    setRules(next)
    setSavingRules(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    setSavingRules(false)
    toast(res.ok ? '已更新投放規則' : '儲存失敗', res.ok ? undefined : 'error')
  }

  useEffect(() => {
    fetch('/api/admin/events')
      .then(r => r.json())
      .then(d => setEvents(Array.isArray(d) ? d : (d.events ?? [])))
      .catch(() => {})
    fetch('/api/admin/announcements')
      .then(r => r.json())
      .then(d => setAnnouncements(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const save = async () => {
    if (!editing) return
    if (!editing.body.trim()) { toast(isImagePopup ? '請填圖片說明' : '內容不可空白', 'error'); return }
    if (isImagePopup && !imageFile && !editing.image_url) { toast('純圖片版需要上傳圖片', 'error'); return }

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
        sort_order: dismissInput === '' ? 0 : Number(dismissInput),
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

  const [pendingDelete, setPendingDelete] = useState<Promo | null>(null)

  const remove = async () => {
    if (!pendingDelete) return
    await fetch(`/api/admin/promos?id=${pendingDelete.id}`, { method: 'DELETE' })
    setPendingDelete(null)
    toast('已刪除')
    fetchPromos()
  }

  const isImagePopup = editing?.layout === 'image'

  // 先以建立時間排出穩定基底：ListTableCard 的排序是穩定排序，
  // 排序欄相同（兩筆同為 0）時就會落回這個次要鍵，順序不再飄
  const filteredPromos = [...promos]
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .filter(p => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (p.title ?? '').toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
    })

  const columns: ListColumn<Promo>[] = [
    {
      key: 'layout', label: '版型',
      render: p => (
        <Badge color={p.layout === 'image' ? 'blue' : 'purple'}>
          {p.layout === 'image' ? '純圖片' : '公告'}
        </Badge>
      ),
    },
    {
      key: 'body', label: '內容',
      render: p => p.layout === 'image' ? (
        <div className="flex items-center gap-2">
          {p.image_url
            ? <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover border border-neutral-200" />
            : <span className="text-red-500 text-xs">尚未設定圖片</span>}
          <span className="text-neutral-400 text-xs line-clamp-1 whitespace-normal">{p.body}</span>
        </div>
      ) : (
        <div className="max-w-md whitespace-normal">
          {p.title && <div className="font-medium text-neutral-900">{p.title}</div>}
          <div className="text-neutral-500 line-clamp-2">{p.body}</div>
        </div>
      ),
    },
    {
      key: 'sortOrder', label: '排序',
      sortValue: p => p.sort_order,
      className: 'font-mono',
      render: p => <>{p.sort_order}</>,
    },
    {
      key: 'status', label: '上架',
      sortValue: p => (p.is_active ? 1 : 0),
      render: p => <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: p => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => openEditor(p)}>編輯</RowAction>
          <RowAction tone="danger" onClick={() => setPendingDelete(p)}>刪除</RowAction>
        </div>
      ),
    },
  ]

  // 投放規則為全站共用，逐則各設一次只會讓每次新增都要重想；
  // 塞進 ListTableCard 工具列（新增鈕右側），不再另起一行
  const ruleControls = (
    <>
      <SelectField
        className="w-auto"
        value={rules.promo_audience}
        disabled={savingRules}
        onChange={e => saveRules({ promo_audience: e.target.value as Rules['promo_audience'] })}
      >
        <option value="all">對象：全部</option>
        <option value="logged_in">對象：已登入</option>
        <option value="logged_out">對象：未登入</option>
      </SelectField>

      <SelectField
        className="w-auto"
        value={rules.promo_dismiss_mode}
        disabled={savingRules}
        onChange={e => saveRules({ promo_dismiss_mode: e.target.value as Rules['promo_dismiss_mode'] })}
      >
        <option value="always">關閉後：每次都出現</option>
        <option value="days">關閉後：隔幾天</option>
        <option value="never">關閉後：不再出現</option>
      </SelectField>

      {rules.promo_dismiss_mode === 'days' && (
        <Input
          inputMode="numeric"
          fullWidth={false}
          className="w-16 text-center"
          value={rules.promo_dismiss_days}
          placeholder="天"
          onChange={e => setRules(r => ({ ...r, promo_dismiss_days: e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') }))}
          onBlur={e => saveRules({ promo_dismiss_days: e.target.value || '7' })}
        />
      )}
    </>
  )

  return (
    <>
      <ListTableCard
        pageKey="banners-popup"
        data={filteredPromos}
        columns={columns}
        keyField="id"
        isLoading={isLoading}
        emptyMessage="尚無首頁彈窗"
        defaultSortField="sortOrder"
        searchPlaceholder="搜尋標題或內容..."
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        addButtonText="+ 新增彈窗"
        onAddClick={() => openEditor({ ...EMPTY })}
        toolbarChildren={ruleControls}
      />

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? '編輯首頁彈窗' : '新增首頁彈窗'}
      >
        {editing && (
          <div className="space-y-4">
            <ScheduleFields
              startAt={editing.start_at}
              endAt={editing.end_at}
              onChange={patch => setEditing({ ...editing, ...patch })}
              unlimitedToggle
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-neutral-600 mb-1">版型</label>
                <SelectField
                  value={editing.layout}
                  onChange={e => setEditing({ ...editing, layout: e.target.value as Promo['layout'] })}
                >
                  <option value="card">公告（統一模板，只填文字）</option>
                  <option value="image">純圖片（整張圖點擊即跳轉）</option>
                </SelectField>
              </div>
              <div>
                <label className="block text-sm text-neutral-600 mb-1">排序</label>
                <Input
                  inputMode="numeric"
                  value={dismissInput}
                  placeholder="0"
                  onChange={e => onDismissChange(e.target.value)}
                />
              </div>
            </div>

            {editing.layout === 'card' && (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">標題</label>
                <Input value={editing.title ?? ''}
                  onChange={e => setEditing({ ...editing, title: e.target.value })} />
              </div>
            )}

            {isImagePopup ? (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">圖片說明</label>
                <Input value={editing.body}
                  placeholder="例：跨年五折活動"
                  onChange={e => setEditing({ ...editing, body: e.target.value })} />
                <p className="text-xs text-neutral-400 mt-1">
                  不會顯示在畫面上。圖片載入失敗時會顯示這段字，讀螢幕軟體也會念出來。
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">內容</label>
                <Textarea rows={4}
                  value={editing.body}
                  onChange={e => setEditing({ ...editing, body: e.target.value })} />
              </div>
            )}

            {isImagePopup && (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">圖片 *</label>
                <FileInput
                  accept="image/*"
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
                  圖片尺寸為 800 x 1189
                </p>
              </div>
            )}

            <div className={isImagePopup ? '' : 'grid grid-cols-2 gap-3'}>
              {!isImagePopup && (
                <div>
                  <label className="block text-sm text-neutral-600 mb-1">按鈕文字</label>
                  <Input value={editing.cta_text ?? ''}
                    onChange={e => setEditing({ ...editing, cta_text: e.target.value })} />
                </div>
              )}
              <div>
                <label className="block text-sm text-neutral-600 mb-1">
                  {isImagePopup ? '點擊後前往' : '按鈕連結'}
                </label>
                <SelectField
                  value={linkKind}
                  onChange={e => {
                    // 換種類時把目標清掉，否則會留下上一種的路徑
                    setLinkKind(e.target.value as typeof linkKind)
                    setEditing({ ...editing, cta_href: null })
                  }}
                >
                  <option value="none">不跳轉</option>
                  <option value="event">活動頁</option>
                  <option value="announcement">公告</option>
                </SelectField>
              </div>
            </div>

            {linkKind !== 'none' && (
              <div>
                <label className="block text-sm text-neutral-600 mb-1">
                  {linkKind === 'event' ? '選擇活動頁' : '選擇公告'}
                </label>
                <SelectField
                  value={editing.cta_href ?? ''}
                  onChange={e => setEditing({ ...editing, cta_href: e.target.value || null })}
                >
                  <option value="">請選擇</option>
                  {linkKind === 'event'
                    ? events.map(ev => (
                        <option key={ev.slug} value={`/events/${ev.slug}`}>{ev.title}</option>
                      ))
                    : announcements.map(a => (
                        <option key={a.id} value={`/announcements/${a.id}`}>{a.title}</option>
                      ))}
                </SelectField>
              </div>
            )}



            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>取消</Button>
              <Button onClick={save} isLoading={saving}>
                {uploading ? '上傳圖片中…' : '儲存'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={remove}
        type="danger"
        title="刪除首頁彈窗"
        message={`確定刪除「${pendingDelete?.title || pendingDelete?.body.slice(0, 16) || ''}」？`}
      />
    </>
  )
}
