'use client'

import { AdminLayout, PageCard, SearchToolbar, StatsCard } from '@/components'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import SelectField from '@/components/ui/SelectField'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ImageUploadField from '@/components/ui/ImageUploadField'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { TableEmpty } from '@/components/ui/EmptyState'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'
import { useEffect, useMemo, useState } from 'react'

/*
 * 官方商城（B2C）商品管理。
 *
 * 跟「商城商品」（玩家 C2C）是不同的東西，刻意分成兩頁：
 * 那頁只能審核與上下架別人的貨，這頁是平台自己的貨，要能新增與編輯。
 * 混在同一頁會讓「核准」跟「新增」兩種完全不同的動作擠在一起。
 */

type Item = { name: string; image?: string; price: number; quantity: number }

type Product = {
  id: number
  title: string
  note: string | null
  category: string | null
  price: number
  shipping_fee: number
  images: string[] | null
  items: Item[] | null
  status: string
  sold_count: number
  created_at: string
  updated_at: string
}

// 與 platform_settings.sell_category_whitelist 一致
const CATEGORIES = ['一番賞', '盒玩', '轉蛋', '卡牌', '公仔模型', '周邊商品']

const emptyDraft = () => ({
  id: 0,
  title: '',
  note: '',
  category: CATEGORIES[0],
  shipping_fee: 60,
  status: 'active',
  images: [''] as string[],
  items: [{ name: '', image: '', price: 0, quantity: 1 }] as Item[],
})

export default function ShopProductsPage() {
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()

  const [rows, setRows] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [draft, setDraft] = useState(emptyDraft())

  const fetchRows = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/shop/products', { credentials: 'include' })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        toast(d?.error || `讀取失敗（${res.status}）`, 'error')
        return
      }
      setRows(await res.json())
    } catch {
      toast('讀取失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchRows()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || String(r.category || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const stats = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      sold: rows.reduce((s, r) => s + (r.sold_count || 0), 0),
      // 庫存＝所有規格的 quantity 加總，賣完的商品前台就買不到了
      stock: rows.reduce(
        (s, r) => s + (r.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0),
        0
      ),
    }),
    [rows]
  )

  const openCreate = () => {
    setDraft(emptyDraft())
    setIsOpen(true)
  }

  const openEdit = (p: Product) => {
    setDraft({
      id: p.id,
      title: p.title,
      note: p.note || '',
      category: p.category || CATEGORIES[0],
      shipping_fee: p.shipping_fee ?? 60,
      status: p.status,
      images: (p.images || []).length ? [...(p.images as string[])] : [''],
      items: (p.items || []).length
        ? (p.items as Item[]).map((i) => ({ ...i, image: i.image || '' }))
        : [{ name: '', image: '', price: 0, quantity: 1 }],
    })
    setIsOpen(true)
  }

  const save = async () => {
    const items = draft.items
      .map((i) => ({ ...i, name: i.name.trim(), price: Number(i.price) || 0, quantity: Number(i.quantity) || 0 }))
      .filter((i) => i.name && i.price > 0)

    if (!draft.title.trim()) return toast('請填寫商品名稱', 'error')
    if (items.length === 0) return toast('至少要有一個規格（含名稱與售價）', 'error')

    setIsSaving(true)
    try {
      const payload = {
        id: draft.id || undefined,
        title: draft.title.trim(),
        note: draft.note,
        category: draft.category,
        shipping_fee: draft.shipping_fee,
        status: draft.status,
        images: draft.images.filter(Boolean),
        items,
      }
      const res = await fetch('/api/admin/shop/products', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) {
        toast(d?.error || `儲存失敗（${res.status}）`, 'error')
        return
      }
      toast(draft.id ? '已更新' : '已新增')
      setIsOpen(false)
      await fetchRows()
    } catch {
      toast('儲存失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleStatus = async (p: Product) => {
    const next = p.status === 'active' ? 'removed' : 'active'
    const res = await fetch('/api/admin/shop/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: p.id, status: next }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      toast(d?.error || '更新失敗', 'error')
      return
    }
    toast(next === 'active' ? '已上架' : '已下架')
    await fetchRows()
  }

  const remove = (p: Product) => {
    confirm({
      title: '刪除官方商品',
      message: `確定要刪除「${p.title}」嗎？此動作無法復原。`,
      type: 'danger',
      onConfirm: async () => {
        const res = await fetch(`/api/admin/shop/products?id=${p.id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        const d = await res.json().catch(() => null)
        if (!res.ok) {
          toast(d?.error || '刪除失敗', 'error')
          return
        }
        toast('已刪除')
        await fetchRows()
      },
    })
  }

  const setItem = (idx: number, patch: Partial<Item>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }))

  return (
    <AdminLayout pageTitle="官方商品" pageSubtitle="吉吉比自營（B2C，走綠界收款，與玩家商城分開）">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard title="商品總數" value={stats.total} />
        <StatsCard title="上架中" value={stats.active} />
        <StatsCard title="總庫存" value={stats.stock} />
        <StatsCard title="累計售出" value={stats.sold} />
      </div>

      <PageCard>
        <SearchToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜尋商品名稱、類別…"
          showAddButton
          addButtonText="新增官方商品"
          onAddClick={openCreate}
        />

        {(
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {['主圖', '商品名稱', '類別', '價格', '運費', '庫存', '已售', '狀態', '建立時間', '操作'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton rows={5} cols={10} />
                ) : filtered.length === 0 ? (
                  <TableEmpty colSpan={10} message="還沒有官方商品，點右上角新增" />
                ) : (
                  filtered.map((p) => {
                    const stock = (p.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0)
                    const img = (p.images || [])[0] || (p.items || [])[0]?.image || ''
                    return (
                      <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-3 py-2">
                          {img ? (
                            <img src={img} alt="" className="w-10 h-10 rounded object-cover" />
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm max-w-[260px] truncate">{p.title}</td>
                        <td className="px-3 py-2 text-sm">{p.category || '—'}</td>
                        <td className="px-3 py-2 text-sm">NT${p.price.toLocaleString()}</td>
                        <td className="px-3 py-2 text-sm">{p.shipping_fee ? p.shipping_fee : '免運'}</td>
                        <td className={`px-3 py-2 text-sm ${stock === 0 ? 'text-red-600 font-semibold' : ''}`}>
                          {stock}
                        </td>
                        <td className="px-3 py-2 text-sm">{p.sold_count}</td>
                        <td className="px-3 py-2">
                          <Badge color={p.status === 'active' ? 'green' : 'gray'}>
                            {p.status === 'active' ? '上架中' : '已下架'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-sm text-neutral-500 whitespace-nowrap">
                          {formatDateTime(p.created_at)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                              編輯
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => toggleStatus(p)}>
                              {p.status === 'active' ? '下架' : '上架'}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => remove(p)}>
                              刪除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={draft.id ? '編輯官方商品' : '新增官方商品'}>
        <div className="space-y-4">
          <Input
            label="商品名稱"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="例：官方福袋 盒玩隨機 5 入 保證不重複"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">類別</label>
              <SelectField
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </SelectField>
            </div>
            <Input
              label="運費（0 = 免運）"
              type="number"
              value={String(draft.shipping_fee)}
              onChange={(e) => setDraft({ ...draft, shipping_fee: Number(e.target.value) || 0 })}
            />
          </div>

          <Textarea
            label="商品說明"
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            rows={3}
          />

          <div>
            <p className="text-sm font-medium text-neutral-700 mb-2">商品圖</p>
            <div className="space-y-2">
              {draft.images.map((url, i) => (
                <ImageUploadField
                  key={i}
                  value={url}
                  folder="products"
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, images: d.images.map((x, xi) => (xi === i ? v : x)) }))
                  }
                />
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => setDraft((d) => ({ ...d, images: [...d.images, ''] }))}
            >
              + 加一張圖
            </Button>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-700 mb-2">
              規格與庫存
              <span className="ml-2 text-xs font-normal text-neutral-400">
                卡片標價會取最低價的規格
              </span>
            </p>
            <div className="space-y-3">
              {draft.items.map((it, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={it.name}
                      onChange={(e) => setItem(i, { name: e.target.value })}
                      placeholder="規格名稱，例：隨機 5 入"
                    />
                    {draft.items.length > 1 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDraft((d) => ({ ...d, items: d.items.filter((_, xi) => xi !== i) }))
                        }
                      >
                        移除
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="售價 NT$"
                      type="number"
                      value={String(it.price)}
                      onChange={(e) => setItem(i, { price: Number(e.target.value) || 0 })}
                    />
                    <Input
                      label="庫存"
                      type="number"
                      value={String(it.quantity)}
                      onChange={(e) => setItem(i, { quantity: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <ImageUploadField
                    label="規格圖（選填）"
                    value={it.image || ''}
                    folder="products"
                    onChange={(v) => setItem(i, { image: v })}
                  />
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() =>
                setDraft((d) => ({ ...d, items: [...d.items, { name: '', image: '', price: 0, quantity: 1 }] }))
              }
            >
              + 加一個規格
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">狀態</label>
            <SelectField
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="active">上架中</option>
              <option value="removed">下架</option>
            </SelectField>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              取消
            </Button>
            <Button onClick={save} isLoading={isSaving}>
              {draft.id ? '儲存' : '新增'}
            </Button>
          </div>
        </div>
      </Modal>

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
