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

/**
 * 全站設定（platform_settings）
 *
 * 原本這裡還有「對象」與「關閉後」兩個下拉，2026-08-12 拿掉（老闆指定）：
 * 那兩個一改就是全站一起改，粒度太粗。現在規則固定成
 * **每次進首頁都跳**，要不要少看一次由玩家自己在彈窗上勾「今日不再顯示」。
 */
interface Rules {
  /** 最新上架彈窗：'1' 開、'0' 關（migration 537），週期同樣是一天 */
  promo_new_arrival_enabled: '0' | '1'
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
  const [rules, setRules] = useState<Rules>({ promo_new_arrival_enabled: '0' })
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
        promo_new_arrival_enabled: (d.promo_new_arrival_enabled as Rules['promo_new_arrival_enabled']) || prev.promo_new_arrival_enabled,
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
    if (!isImagePopup && !(editing.title ?? '').trim()) { toast('公告的標題不可空白', 'error'); return }
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
      // 圖片獨立成一欄（老闆指定）。原本縮圖跟說明文字擠在「內容」裡，
      // 純圖片與公告兩種版型的排版長得不一樣，一整排看下來很亂
      key: 'image', label: '圖片',
      render: p => p.image_url
        ? <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover border border-neutral-200" />
        : p.layout === 'image'
          ? <span className="text-red-500 text-xs">尚未設定</span>
          : <span className="text-neutral-300">—</span>,
    },
    {
      key: 'body', label: '內容',
      // 兩種版型共用同一組樣式（老闆指定：純圖片的小灰字要跟公告一樣）
      render: p => (
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

  /*
   * 最新上架彈窗做成表格的**置頂列**（老闆指定）：固定第一筆、不能編輯也不能刪除。
   *
   * 它跟下面那些彈窗不是同一種東西 —— 內容是即時從 products 撈最新商品組出來的，
   * 沒有可編輯的文案或圖片，所以不塞進 site_promos 當一筆資料（那還要處理
   * 「這筆不能編輯」的例外），只有一個開關存在 platform_settings。
   *
   * 用 ListTableCard 的 summaryRow：它是置頂的，而且**排序時不會被打亂**。
   * 清單空的時候也要顯示（summaryRowWhenEmpty），不然唯一的開關會跟著消失。
   */
  const newArrivalRow = (shown: ListColumn<Promo>[]) => shown.map(col => {
    /*
     * 跟一般資料列同一組 cell 樣式。
     *
     * `summaryRow` 是由呼叫端自己吐 `<td>`，元件不會幫忙套 —— 少了 `text-sm`
     * 就會繼承 16px，看起來比其他列大一號（老闆回報）。
     * `font-normal` 是為了抵銷 `<tr>` 上的 `font-semibold`（那是合計列的預設樣式）。
     */
    const cell = 'py-2 px-2 text-sm font-normal text-neutral-700'
    if (col.key === 'layout') {
      return <td key={col.key} className={cell}><Badge color="green">系統</Badge></td>
    }
    if (col.key === 'image') {
      // 最新上架的圖是即時從商品撈的，沒有可設定的縮圖
      return <td key={col.key} className={`${cell} text-neutral-300`}>—</td>
    }
    if (col.key === 'body') {
      return (
        <td key={col.key} className={cell}>
          <div className="max-w-md whitespace-normal">
            <div className="font-medium text-neutral-900">最新上架</div>
            <div className="text-neutral-500">
              進首頁時跳出最近 30 天上架的商品，點了直接進商品頁。內容自動更新，不用編輯。
            </div>
          </div>
        </td>
      )
    }
    if (col.key === 'status') {
      return (
        <td key={col.key} className={cell}>
          <Switch
            checked={rules.promo_new_arrival_enabled === '1'}
            disabled={savingRules}
            onCheckedChange={v => saveRules({ promo_new_arrival_enabled: v ? '1' : '0' })}
          />
        </td>
      )
    }
    // 排序與操作留白：這一列固定在最上面，也不給編輯／刪除
    return <td key={col.key} className={`${cell} text-neutral-300`}>—</td>
  })

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
        summaryRow={newArrivalRow}
        summaryRowWhenEmpty
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

            {/* 兩種版型都能填標題：公告必填、純圖片選填（老闆指定）。
                純圖片的標題只出現在後台清單，用來辨識這是哪一檔活動 —— 
                前台那版的文案是畫在圖裡的，不會另外疊字上去 */}
            <div>
              <label className="block text-sm text-neutral-600 mb-1">
                標題{isImagePopup ? '' : ' *'}
              </label>
              <Input value={editing.title ?? ''}
                placeholder={isImagePopup ? '選填，只顯示在後台清單' : ''}
                onChange={e => setEditing({ ...editing, title: e.target.value })} />
            </div>

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
