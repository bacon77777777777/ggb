'use client'

import { AdminLayout, Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import SelectField from '@/components/ui/SelectField'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'

/**
 * 促銷方案
 *
 * 目前只有「買 N 送 M」。在轉蛋平台上「買」就是「抽」，所以買五送一的意思是
 * 付 5 抽的錢、平台多送 1 抽 —— 玩家拿 6 顆、庫存扣 6，收入不打折（migration 517）。
 *
 * 適用範圍掛在分類上時，之後往那個分類丟商品會自動繼承，不必逐一設定。
 */

interface Promo {
  id: number
  name: string
  config: { buy?: number; free?: number }
  badge_text: string | null
  scope: 'product' | 'category' | 'all'
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  priority: number
  uses: number
  total_discount: number
  total_bonus: number
  promotion_targets?: { product_id: number | null; category_id: string | null }[]
}

const EMPTY = {
  name: '', buy: '5', free: '1', badgeText: '',
  scope: 'category' as 'category' | 'all',
  startsAt: '', endsAt: '', priority: '0',
  categoryIds: [] as string[],
}

/** ISO → datetime-local 輸入值（編輯預填用） */
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function PromotionsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Promo[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Promo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const load = async () => {
    try {
      const res = await fetch('/api/admin/promotions', { credentials: 'include', cache: 'no-store' })
      if (res.status === 401) { window.location.href = '/login'; return }
      const json = await res.json()
      if (Array.isArray(json)) setRows(json)
    } finally { setIsLoading(false) }
  }

  useEffect(() => {
    load()
    fetch('/api/admin/categories', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setCategories(d) }).catch(() => {})
  }, [])

  const openCreate = () => { setEditingId(null); setForm({ ...EMPTY }); setOpen(true) }

  const openEdit = (p: Promo) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      buy: String(p.config?.buy ?? 5),
      free: String(p.config?.free ?? 1),
      badgeText: p.badge_text ?? '',
      scope: p.scope === 'all' ? 'all' : 'category',
      startsAt: toLocalInput(p.starts_at),
      endsAt: toLocalInput(p.ends_at),
      priority: String(p.priority),
      categoryIds: (p.promotion_targets ?? [])
        .filter(t => t.category_id)
        .map(t => String(t.category_id)),
    })
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/promotions', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          ...form,
          buy: Number(form.buy), free: Number(form.free), priority: Number(form.priority),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '儲存失敗')
      toast(editingId ? '已儲存' : '已建立')
      setOpen(false); setForm({ ...EMPTY }); setEditingId(null); load()
    } catch (e) {
      toast(e instanceof Error ? e.message : '儲存失敗', 'error')
    } finally { setSaving(false) }
  }

  const toggle = async (p: Promo) => {
    await fetch('/api/admin/promotions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: p.id, isActive: !p.is_active }),
    })
    load()
  }

  const remove = async () => {
    if (!deleteTarget) return
    await fetch(`/api/admin/promotions?id=${deleteTarget.id}`, { method: 'DELETE', credentials: 'include' })
    setDeleteTarget(null); load(); toast('已刪除')
  }

  const filtered = rows.filter(p =>
    !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const columns: ListColumn<Promo>[] = [
    {
      key: 'name', label: '方案', className: 'font-medium text-neutral-900',
      sortValue: p => p.name,
      render: p => (
        <div>
          <div>{p.name}</div>
          <div className="mt-0.5 text-xs text-neutral-400">
            抽 {(p.config?.buy ?? 0) + (p.config?.free ?? 0)} 次收 {p.config?.buy ?? 0} 次的錢
          </div>
        </div>
      ),
    },
    { key: 'badge', label: '卡片標籤', render: p => <Badge color="primary">{p.badge_text || '—'}</Badge> },
    {
      key: 'scope', label: '適用範圍',
      render: p => {
        if (p.scope === 'all') return <div className="text-xs">全站</div>
        const targets = p.promotion_targets ?? []
        const catNames = targets
          .filter(t => t.category_id)
          .map(t => categories.find(c => c.id === t.category_id)?.name ?? '未命名分類')
        const productCount = targets.filter(t => t.product_id).length
        return (
          <div className="text-xs">
            {catNames.length > 0 && <div>分類：{catNames.join('、')}</div>}
            {productCount > 0 && <div className="text-neutral-400">＋{productCount} 檔商品（商品編輯掛入）</div>}
            {catNames.length === 0 && productCount === 0 && (
              <div className="text-neutral-400">尚未圈定對象</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'period', label: '檔期', className: 'font-mono',
      sortValue: p => (p.starts_at ? new Date(p.starts_at).getTime() : 0),
      render: p => (
        <span className="text-xs text-neutral-500">
          {p.starts_at ? formatDateTime(p.starts_at) : '即刻'} ～ {p.ends_at ? formatDateTime(p.ends_at) : '無期限'}
        </span>
      ),
    },
    {
      key: 'usage', label: '使用情形',
      sortValue: p => p.uses,
      render: p => (
        <div className="text-xs tabular-nums">
          <div>{p.uses} 次</div>
          <div className="text-neutral-400">送出 {(p.total_bonus ?? 0).toLocaleString()} 抽（值 {p.total_discount.toLocaleString()} 代幣）</div>
        </div>
      ),
    },
    {
      key: 'priority', label: '優先權',
      sortValue: p => p.priority,
      render: p => <span className="text-xs tabular-nums">{p.priority}</span>,
    },
    {
      key: 'status', label: '狀態',
      sortValue: p => (p.is_active ? 1 : 0),
      // Switch 直接切換啟停，沿用 toggle()（PATCH 後重新載入）
      render: p => <Switch checked={p.is_active} onCheckedChange={() => void toggle(p)} />,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: p => (
        <div className="flex items-center gap-2">
          <RowAction onClick={() => toggle(p)}>{p.is_active ? '停用' : '啟用'}</RowAction>
          <RowAction tone="primary" onClick={() => openEdit(p)}>編輯</RowAction>
          <RowAction tone="danger" onClick={() => setDeleteTarget(p)}>刪除</RowAction>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="促銷方案">
      <div className="space-y-6">
        <p className="text-sm text-neutral-500">
          買 N 送 M。在轉蛋平台上「買」就是「抽」—— 買五送一的意思是付 5 抽的錢多送 1 抽，
          玩家拿 6 顆、庫存扣 6，收入不打折。
        </p>

        <ListTableCard
          pageKey="promotions"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="還沒有促銷方案，點擊「新增方案」開始"
          searchPlaceholder="搜尋方案名稱..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增方案"
          onAddClick={openCreate}
        />
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editingId ? '編輯促銷方案' : '新增促銷方案'}>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-500">方案名稱 <span className="text-red-500">*</span></label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：夏日買五送一" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500">買幾抽</label>
              <Input type="number" min={1} value={form.buy} onChange={e => setForm(f => ({ ...f, buy: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500">送幾抽</label>
              <Input type="number" min={1} value={form.free} onChange={e => setForm(f => ({ ...f, free: e.target.value }))} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-neutral-400">
            玩家買滿 {Number(form.buy) || 0} 抽就多送 {Number(form.free) || 0} 抽（庫存多扣 {Number(form.free) || 0}）。買不滿不送，前台會提示還差幾抽。
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-500">卡片標籤</label>
            <Input value={form.badgeText} onChange={e => setForm(f => ({ ...f, badgeText: e.target.value }))}
              placeholder={`留空自動用「買${form.buy}送${form.free}」`} />
          </div>

          {/* 掛鉤定案：方案這邊只圈「分類」（可留空）；圈單一商品
              去商品編輯那邊勾（老闆指定，方案選商品太複雜） */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-500">適用範圍</label>
            <SelectField value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as 'category' | 'all' }))}>
              <option value="category">指定分類</option>
              <option value="all">全站</option>
            </SelectField>
            {form.scope === 'category' && (
              <p className="mt-1 text-xs text-neutral-400">
                掛在分類上之後，往那個分類丟的新商品會自動套用。
                也可以先不選 —— 之後到「商品編輯」把個別商品勾進這個方案。
              </p>
            )}
          </div>

          {form.scope === 'category' && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
              {categories.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4"
                    checked={form.categoryIds.includes(c.id)}
                    onChange={e => setForm(f => ({
                      ...f,
                      categoryIds: e.target.checked ? [...f.categoryIds, c.id] : f.categoryIds.filter(x => x !== c.id),
                    }))} />
                  {c.name}
                </label>
              ))}
              {categories.length === 0 && <p className="p-2 text-xs text-neutral-400">還沒有分類，先到「分類清單」建立</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500">開始時間</label>
              <Input type="datetime-local" value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-500">結束時間</label>
              <Input type="datetime-local" value={form.endsAt} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-neutral-400">兩個都留空就是立刻生效、不設結束。</p>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-500">優先權</label>
            <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} />
            <p className="mt-1 text-xs text-neutral-400">
              同一個商品同時符合多個方案時，取數字最大的那個。例如全站買五送一設 0、
              單檔買二送一設 10，單檔就會蓋過全站。
            </p>
          </div>

          {editingId !== null && (
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              改參數只影響之後的購買 —— 已發放的贈品記錄都留在案（結算依據），不會被改動。
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} isLoading={saving}>{editingId ? '儲存' : '建立'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="刪除這個方案？"
        message={`「${deleteTarget?.name}」會立刻停止套用。已經折抵過的記錄會留著（那是結算的依據），不受影響。`}
        confirmText="刪除"
        type="danger"
      />
    </AdminLayout>
  )
}
