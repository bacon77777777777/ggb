'use client'

/**
 * 抽籤販售管理（老闆 2026-08-31）
 *
 * 限量商品不走「先搶先贏」，改成：開放登記（花積分當入場券）→ 截止 → 到時間
 * 統一開獎並公開名單 → 中籤者付 G 幣。資料在 lottery_events / lottery_entries
 * （migration 652/653），商品沿用 products。
 *
 * ## 這頁刻意做的兩件事
 *
 * 1. **階段是算出來的，不是選出來的。** 表格的「階段」欄由時間欄位現算
 *    （登記中／待開獎／已開獎…），後台不能直接改階段 —— 能改的只有
 *    草稿／發布／取消。存狀態機的話，cron 漏跑一次就跟時鐘對不上。
 * 2. **一發布就把承諾值定下來。** 發布時後端會呼叫 ensure_lottery_commitment，
 *    seed 當場產生、只公布它的 sha256。等開獎才產 seed 等於沒有事前承諾，
 *    玩家沒辦法證明我們不是看完名單才決定的。
 */

import { useEffect, useState } from 'react'
import { AdminLayout, Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import SelectField from '@/components/ui/SelectField'
import Switch from '@/components/ui/Switch'
import Badge from '@/components/ui/Badge'
import DateTimePicker from '@/components/DateTimePicker'
import { useToast } from '@/contexts/ToastContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

interface LotteryEvent {
  id: number
  product_id: number
  title: string | null
  brand: string | null
  entry_points: number
  per_user_entries: number
  winners_count: number
  backup_count: number
  price_tokens: number
  pay_deadline_hours: number
  register_start_at: string
  register_end_at: string
  draw_at: string
  drawn_at: string | null
  commitment: string | null
  show_entry_count: boolean
  status: 'draft' | 'published' | 'cancelled'
  phase: string
  counts: { entries: number; won: number; paid: number }
  product: { id: number; name: string; image_url: string | null; type: string; price: number } | null
}

/** 階段的顯示。文字要讓人一眼知道「現在該做什麼」，不是內部代碼 */
const PHASE: Record<string, { label: string; color: 'gray' | 'blue' | 'green' | 'orange' | 'red' }> = {
  draft:        { label: '草稿',     color: 'gray' },
  upcoming:     { label: '尚未開始', color: 'blue' },
  registering:  { label: '登記中',   color: 'green' },
  pending_draw: { label: '待開獎',   color: 'orange' },
  drawn:        { label: '已開獎',   color: 'gray' },
  cancelled:    { label: '已取消',   color: 'red' },
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString('sv-SE').replace('T', ' ') : '—')

const EMPTY_FORM = {
  product_id: '',
  title: '',
  brand: '',
  entry_points: '20',
  per_user_entries: '1',
  winners_count: '10',
  backup_count: '5',
  price_tokens: '350',
  pay_deadline_hours: '48',
  register_start_at: '',
  register_end_at: '',
  draw_at: '',
  show_entry_count: false,
}

export default function LotteryPage() {
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()
  const [events, setEvents] = useState<LotteryEvent[]>([])
  const [products, setProducts] = useState<{ id: number; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<LotteryEvent | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState<LotteryEvent | null>(null)
  const [entries, setEntries] = useState<any[]>([])

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/lottery')
      const data = await res.json()
      setEvents(data.events ?? [])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    // 商品下拉：只列上架中的，草稿商品掛檔期沒有意義
    fetch('/api/admin/products?status=active&limit=500')
      .then(r => r.json())
      .then(d => setProducts((d.products ?? d.data ?? []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => setProducts([]))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (e: LotteryEvent) => {
    setEditing(e)
    setForm({
      product_id: String(e.product_id),
      title: e.title ?? '',
      brand: e.brand ?? '',
      entry_points: String(e.entry_points),
      per_user_entries: String(e.per_user_entries),
      winners_count: String(e.winners_count),
      backup_count: String(e.backup_count),
      price_tokens: String(e.price_tokens),
      pay_deadline_hours: String(e.pay_deadline_hours),
      register_start_at: e.register_start_at,
      register_end_at: e.register_end_at,
      draw_at: e.draw_at,
      show_entry_count: e.show_entry_count,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.product_id) return toast('請選擇商品', 'error')
    if (!form.register_start_at || !form.register_end_at || !form.draw_at) {
      return toast('登記期間與開獎時間都要填', 'error')
    }
    setSaving(true)
    try {
      const url = editing ? `/api/admin/lottery/${editing.id}` : '/api/admin/lottery'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, product_id: Number(form.product_id) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast(editing ? '已更新' : '已建立（草稿）')
      setShowForm(false)
      load()
    } catch (e: any) {
      toast(e.message ?? '儲存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (e: LotteryEvent, status: 'draft' | 'published' | 'cancelled') => {
    const res = await fetch(`/api/admin/lottery/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    if (!res.ok) return toast(data.error ?? '操作失敗', 'error')
    toast(status === 'published' ? '已發布，承諾值已產生' : status === 'cancelled' ? '已取消' : '已收回草稿')
    load()
  }

  const doDraw = (e: LotteryEvent) => {
    confirm({
      title: '確認開獎',
      message: `「${e.title || e.product?.name}」共 ${e.counts.entries} 人登記，正取 ${e.winners_count} 名、備取 ${e.backup_count} 名。\n\n開獎後名單與 seed 會公開，且無法重來。確定嗎？`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/lottery/${e.id}/draw`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) return toast(data.error ?? '開獎失敗', 'error')
        toast(`開獎完成：${data.result.entries} 人登記、正取 ${data.result.winners}、備取 ${data.result.backups}`)
        load()
      },
    })
  }

  const remove = (e: LotteryEvent) => {
    confirm({
      title: '確認刪除',
      message: `刪除檔期「${e.title || e.product?.name}」？`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/lottery/${e.id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) return toast(data.error ?? '刪除失敗', 'error')
        toast('已刪除')
        load()
      },
    })
  }

  const viewEntries = async (e: LotteryEvent) => {
    setViewing(e)
    const res = await fetch(`/api/admin/lottery/${e.id}/entries`)
    const data = await res.json()
    setEntries(data.entries ?? [])
  }

  /* 已經打過的品牌，給表單的 datalist 用 —— 不另外開一張品牌表 */
  const knownBrands = [...new Set(events.map(e => e.brand).filter((b): b is string => !!b))].sort()

  const filtered = events.filter(e => {
    if (phaseFilter !== 'all' && e.phase !== phaseFilter) return false
    if (search) {
      const hay = `${e.title ?? ''} ${e.product?.name ?? ''}`.toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  })

  const columns: ListColumn<LotteryEvent>[] = [
    {
      key: 'event', label: '檔期',
      sortValue: e => e.title ?? e.product?.name ?? '',
      render: e => (
        <div className="flex items-center gap-3">
          {e.product?.image_url
            ? <img src={e.product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-neutral-100 shrink-0" />
            : <div className="w-10 h-10 rounded-lg bg-neutral-100 shrink-0 flex items-center justify-center">🎟️</div>}
          <div className="min-w-0">
            <div className="font-semibold text-neutral-900 truncate">{e.title || e.product?.name || `#${e.id}`}</div>
            <div className="text-xs text-neutral-400 truncate">{e.product?.name ?? '（商品已移除）'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'phase', label: '階段',
      sortValue: e => e.phase,
      render: e => {
        const p = PHASE[e.phase] ?? { label: e.phase, color: 'gray' as const }
        return (
          <div className="space-y-1">
            <Badge color={p.color}>{p.label}</Badge>
            {/* 承諾值：發布時就該有。沒有代表這一檔的公平性說法站不住腳 */}
            {e.status === 'published' && !e.commitment && (
              <div className="text-[11px] text-red-600">⚠ 尚無承諾值</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'entries', label: '登記 / 名額',
      sortValue: e => e.counts.entries,
      render: e => (
        <div className="text-sm">
          <span className="font-bold text-neutral-900">{e.counts.entries}</span>
          <span className="text-neutral-400"> 人登記</span>
          <div className="text-xs text-neutral-400">
            正取 {e.winners_count}｜備取 {e.backup_count}
            {e.counts.paid > 0 && <span className="text-green-600">｜已付 {e.counts.paid}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'cost', label: '入場 / 中籤價',
      className: 'text-sm',
      render: e => (
        <>
          <div className="text-neutral-700">{e.entry_points} P<span className="text-neutral-400 text-xs"> 入場</span></div>
          <div className="text-neutral-700">{e.price_tokens.toLocaleString()} G<span className="text-neutral-400 text-xs"> 中籤價</span></div>
        </>
      ),
    },
    {
      key: 'time', label: '登記期間 / 開獎',
      className: 'text-xs text-neutral-500 whitespace-nowrap font-mono',
      sortValue: e => e.register_start_at,
      render: e => (
        <>
          <div>{fmt(e.register_start_at)}</div>
          <div>~ {fmt(e.register_end_at)}</div>
          <div className="text-neutral-700">開獎 {fmt(e.drawn_at ?? e.draw_at)}</div>
        </>
      ),
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: e => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => viewEntries(e)}>名單</RowAction>
          {e.status === 'draft' && <RowAction onClick={() => setStatus(e, 'published')}>發布</RowAction>}
          {e.status === 'published' && !e.drawn_at && e.phase === 'pending_draw' && (
            <RowAction tone="primary" onClick={() => doDraw(e)}>立即開獎</RowAction>
          )}
          {!e.drawn_at && <RowAction onClick={() => openEdit(e)}>編輯</RowAction>}
          {e.status === 'published' && !e.drawn_at && (
            <RowAction tone="danger" onClick={() => setStatus(e, 'cancelled')}>取消</RowAction>
          )}
          {e.counts.entries === 0 && <RowAction tone="danger" onClick={() => remove(e)}>刪除</RowAction>}
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="抽籤販售管理">
      <div className="space-y-4">
        <ListTableCard
          pageKey="lottery_events"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage={search ? '找不到符合的檔期' : '尚無抽籤檔期，點「新增檔期」建立'}
          searchPlaceholder="搜尋檔期或商品名稱..."
          searchValue={search}
          onSearchChange={setSearch}
          addButtonText="+ 新增檔期"
          onAddClick={openCreate}
          filters={[{
            key: 'phase', label: '階段', value: phaseFilter, onChange: setPhaseFilter,
            options: [
              { value: 'all', label: '全部階段' },
              ...Object.entries(PHASE).map(([v, p]) => ({ value: v, label: p.label })),
            ],
          }]}
        />
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? '編輯檔期' : '新增抽籤檔期'}>
        <div className="space-y-4">
          {/* SelectField 是包過樣式的原生 select：沒有 label／options prop，選項走 children */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">商品 *</label>
            <SelectField
              value={form.product_id}
              onChange={e => setForm(p => ({ ...p, product_id: e.target.value }))}
            >
              <option value="">請選擇商品</option>
              {products.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </SelectField>
          </div>
          <Input
            label="檔期標題"
            placeholder="留空就用商品名稱"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          />

          {/*
            品牌（migration 665）。前台列表的分類頁籤照這欄分組。
            用 <datalist> 而不是下拉：既有的品牌可以點選，也能直接打新的 ——
            開一張品牌維護表為了一個字串太重，而每次都要重打又容易打成
            「寶可夢」「寶可夢 」「Pokemon」三種。
          */}
          <div>
            <Input
              label="品牌 / IP"
              list="lottery-brands"
              placeholder="寶可夢、遊戲王、NBA…（可挑既有的或直接輸入新的）"
              value={form.brand}
              onChange={e => setForm(p => ({ ...p, brand: e.target.value }))}
            />
            <datalist id="lottery-brands">
              {knownBrands.map(b => <option key={b} value={b} />)}
            </datalist>
            <p className="mt-1 text-xs text-neutral-400">
              前台列表照這欄分頁籤；留空的檔期會歸在「其他」。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="入場積分 *" type="number" value={form.entry_points}
              onChange={e => setForm(p => ({ ...p, entry_points: e.target.value }))} />
            <Input label="每人可登記次數" type="number" value={form.per_user_entries}
              onChange={e => setForm(p => ({ ...p, per_user_entries: e.target.value }))} />
            <Input label="正取名額 *" type="number" value={form.winners_count}
              onChange={e => setForm(p => ({ ...p, winners_count: e.target.value }))} />
            <Input label="備取名額" type="number" value={form.backup_count}
              onChange={e => setForm(p => ({ ...p, backup_count: e.target.value }))} />
            <Input label="中籤價 (G) *" type="number" value={form.price_tokens}
              onChange={e => setForm(p => ({ ...p, price_tokens: e.target.value }))} />
            <Input label="付款期限 (小時)" type="number" value={form.pay_deadline_hours}
              onChange={e => setForm(p => ({ ...p, pay_deadline_hours: e.target.value }))} />
          </div>

          <DateTimePicker label="登記開始 *" value={form.register_start_at}
            onChange={v => setForm(p => ({ ...p, register_start_at: v }))} />
          <DateTimePicker label="登記截止 *" value={form.register_end_at}
            onChange={v => setForm(p => ({ ...p, register_end_at: v }))} />
          <DateTimePicker label="開獎時間 *" value={form.draw_at}
            onChange={v => setForm(p => ({ ...p, draw_at: v }))} />

          <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5">
            <div className="min-w-0 pr-4">
              <div className="text-sm text-neutral-900">登記期間公開人數</div>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">
                建議關閉。「只有 3 人登記」的畫面會勸退後面的人，開獎後再公布
                「XXX 人搶 {form.winners_count || 'N'} 組」才是要的標題。
              </p>
            </div>
            <Switch checked={form.show_entry_count}
              onCheckedChange={v => setForm(p => ({ ...p, show_entry_count: v }))} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>取消</Button>
            <Button onClick={save} isLoading={saving}>{editing ? '儲存' : '建立草稿'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!viewing} onClose={() => setViewing(null)}
             title={`登記名單 — ${viewing?.title || viewing?.product?.name || ''}`}>
        <div className="space-y-3">
          {viewing?.commitment && (
            <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs">
              <div className="text-neutral-500">開獎承諾值（登記期間就公布，開獎後可用 seed 驗算）</div>
              <div className="font-mono break-all text-neutral-700">{viewing.commitment}</div>
            </div>
          )}
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left text-xs text-neutral-500">
                  <th className="py-2">名次</th><th>序號</th><th>玩家</th><th>狀態</th><th>付款期限</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(en => (
                  <tr key={en.id} className="border-b border-neutral-50">
                    <td className="py-2 font-mono">{en.rank ?? '—'}</td>
                    <td className="font-mono text-neutral-500">#{en.entry_no}</td>
                    <td className="truncate">{en.user?.name ?? en.user?.email ?? '—'}</td>
                    <td>{en.status}</td>
                    <td className="font-mono text-xs text-neutral-500">{fmt(en.pay_deadline)}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-neutral-400">尚無登記</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
