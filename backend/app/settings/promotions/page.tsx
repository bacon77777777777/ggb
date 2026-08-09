'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminLayout, PageCard, DataTable, Modal, type Column } from '@/components'
import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import SelectField from '@/components/ui/SelectField'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ConfirmDialog'
import { CardSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
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

const SCOPE_LABEL: Record<Promo['scope'], string> = {
  product: '指定商品', category: '指定分類', all: '全站',
}

const EMPTY = {
  name: '', buy: '5', free: '1', badgeText: '',
  scope: 'category' as Promo['scope'],
  startsAt: '', endsAt: '', priority: '0',
  productIds: [] as number[], categoryIds: [] as string[],
}

export default function PromotionsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Promo[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [products, setProducts] = useState<{ id: number; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Promo | null>(null)

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
    fetch('/api/admin/products?limit=300', { credentials: 'include' })
      .then(r => r.json()).then(d => {
        const list = Array.isArray(d) ? d : d?.products
        if (Array.isArray(list)) setProducts(list.map((p: any) => ({ id: p.id, name: p.name })))
      }).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          buy: Number(form.buy), free: Number(form.free), priority: Number(form.priority),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '建立失敗')
      toast('已建立')
      setOpen(false); setForm({ ...EMPTY }); load()
    } catch (e) {
      toast(e instanceof Error ? e.message : '建立失敗', 'error')
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

  const columns: Column<any>[] = [
    {
      key: 'name', label: '方案', className: 'font-medium text-neutral-900',
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
      render: p => (
        <div className="text-xs">
          <div>{SCOPE_LABEL[p.scope as Promo['scope']]}</div>
          {p.scope !== 'all' && (
            <div className="text-neutral-400">{p.promotion_targets?.length ?? 0} 個對象</div>
          )}
        </div>
      ),
    },
    {
      key: 'period', label: '檔期', className: 'text-xs text-neutral-500',
      render: p => (
        <>{p.starts_at ? formatDateTime(p.starts_at) : '即刻'} ～ {p.ends_at ? formatDateTime(p.ends_at) : '無期限'}</>
      ),
    },
    {
      key: 'usage', label: '使用情形', className: 'text-xs tabular-nums',
      render: p => (
        <div>
          <div>{p.uses} 次</div>
          <div className="text-neutral-400">送出 {(p.total_bonus ?? 0).toLocaleString()} 抽（值 {p.total_discount.toLocaleString()} 代幣）</div>
        </div>
      ),
    },
    { key: 'priority', label: '優先權', className: 'tabular-nums text-xs', render: p => <>{p.priority}</> },
    {
      key: 'status', label: '狀態',
      render: p => <Badge status={p.is_active ? 'active' : 'inactive'}>{p.is_active ? '啟用' : '停用'}</Badge>,
    },
    {
      key: 'actions', label: '操作',
      render: p => (
        <div className="flex gap-2">
          <button onClick={() => toggle(p)}
            className="rounded border border-neutral-200 px-3 py-1 text-xs transition-colors hover:bg-neutral-50">
            {p.is_active ? '停用' : '啟用'}
          </button>
          <button onClick={() => setDeleteTarget(p)}
            className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 transition-colors hover:bg-red-50">
            刪除
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="促銷方案">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-500">
            買 N 送 M。在轉蛋平台上「買」就是「抽」—— 買五送一的意思是付 5 抽的錢多送 1 抽，
            玩家拿 6 顆、庫存扣 6，收入不打折。
          </p>
          <button onClick={() => setOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary/90">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增方案
          </button>
        </div>

        <PageCard noPadding>
          {isLoading ? <CardSkeleton rows={4} />
            : rows.length === 0 ? <EmptyState message="還沒有促銷方案，點擊「新增方案」開始" />
            : <div className="overflow-x-auto"><DataTable data={rows} columns={columns} keyField="id" /></div>}
        </PageCard>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="新增促銷方案">
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

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-neutral-500">適用範圍</label>
            <SelectField value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as Promo['scope'] }))}>
              <option value="category">指定分類</option>
              <option value="product">指定商品</option>
              <option value="all">全站</option>
            </SelectField>
            {form.scope === 'category' && (
              <p className="mt-1 text-xs text-neutral-400">
                掛在分類上之後，往那個分類丟的新商品會自動套用，不用一個一個設。
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

          {form.scope === 'product' && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
              {products.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4"
                    checked={form.productIds.includes(p.id)}
                    onChange={e => setForm(f => ({
                      ...f,
                      productIds: e.target.checked ? [...f.productIds, p.id] : f.productIds.filter(x => x !== p.id),
                    }))} />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
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

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} isLoading={saving}>建立</Button>
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
