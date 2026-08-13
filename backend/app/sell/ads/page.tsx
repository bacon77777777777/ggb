'use client'

import { AdminLayout, PageCard, StatsCard } from '@/components'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import SelectField from '@/components/ui/SelectField'
import Switch from '@/components/ui/Switch'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { TableEmpty } from '@/components/ui/EmptyState'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'
import { useEffect, useMemo, useState } from 'react'

/*
 * 廣告版位管理。
 *
 * 版位分兩種，權限完全不同（DB 的 self_serve 欄位決定）：
 *   self_serve=true   C2C 賣家在前台廣告中心自己買
 *   self_serve=false  供應商版位，只能在這頁代客開單
 * 這頁可以改價格與席次 —— 那是營運參數，改價不該推版。
 */

type Slot = {
  id: string
  name: string
  description: string
  price_per_day: number
  seats_per_day: number
  audience: string
  self_serve: boolean
  needs_keyword: boolean
  is_active: boolean
}

type Booking = {
  id: number
  slot_id: string
  listing_id: number | null
  listing_title: string | null
  buyer_id: string | null
  buyer_name: string | null
  supplier_name: string | null
  start_date: string
  days: number
  keyword: string | null
  cost: number
  status: string
  created_by: string | null
  created_at: string
}

const todayTw = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

export default function SellAdsPage() {
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()

  const [slots, setSlots] = useState<Slot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    slot_id: '',
    supplier_name: '',
    start_date: todayTw(),
    days: 7,
    cost: 0,
    keyword: '',
  })

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/sell/ads', { credentials: 'include' })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        toast(d?.error || `讀取失敗（${res.status}）`, 'error')
        return
      }
      const d = await res.json()
      setSlots(d.slots || [])
      setBookings(d.bookings || [])
    } catch {
      toast('讀取失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const supplierSlots = useMemo(() => slots.filter((s) => !s.self_serve), [slots])

  const stats = useMemo(() => {
    const active = bookings.filter((b) => b.status === 'active')
    return {
      slots: slots.filter((s) => s.is_active).length,
      running: active.filter((b) => {
        const start = new Date(`${b.start_date}T00:00:00+08:00`).getTime()
        const end = start + b.days * 86400000
        const now = Date.now()
        return now >= start && now < end
      }).length,
      bookings: active.length,
      revenue: active.reduce((s, b) => s + (b.cost || 0), 0),
    }
  }, [slots, bookings])

  const patchSlot = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/admin/sell/ads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, ...patch }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      toast(d?.error || '更新失敗', 'error')
      return
    }
    toast('已更新')
    await load()
  }

  const openBook = () => {
    setForm({
      slot_id: supplierSlots[0]?.id || '',
      supplier_name: '',
      start_date: todayTw(),
      days: 7,
      cost: (supplierSlots[0]?.price_per_day || 0) * 7,
      keyword: '',
    })
    setIsOpen(true)
  }

  const submitBooking = async () => {
    if (!form.slot_id) return toast('請選擇版位', 'error')
    if (!form.supplier_name.trim()) return toast('請填寫供應商名稱', 'error')

    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/sell/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) {
        toast(d?.error || `開單失敗（${res.status}）`, 'error')
        return
      }
      toast('已建立檔期')
      setIsOpen(false)
      await load()
    } finally {
      setIsSaving(false)
    }
  }

  const cancelBooking = (b: Booking) => {
    confirm({
      title: '取消廣告檔期',
      message: `確定要取消「${b.listing_title || b.supplier_name}」的檔期嗎？席次會立刻釋出。`,
      type: 'warning',
      onConfirm: async () => {
        const res = await fetch(`/api/admin/sell/ads?id=${b.id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) {
          const d = await res.json().catch(() => null)
          toast(d?.error || '取消失敗', 'error')
          return
        }
        toast('已取消')
        await load()
      },
    })
  }

  return (
    <AdminLayout pageTitle="廣告版位" pageSubtitle="C2C 賣家自助購買；供應商版位由這裡代客開單">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard title="開放版位" value={stats.slots} />
        <StatsCard title="投放中" value={stats.running} />
        <StatsCard title="有效檔期" value={stats.bookings} />
        <StatsCard title="累計收入（G）" value={stats.revenue.toLocaleString()} />
      </div>

      <PageCard header={<h2 className="text-base font-semibold text-neutral-900">版位型錄</h2>}>
        {(
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {['版位', '說明', '對象', '購買方式', '每日單價（G）', '每日席次', '開放'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton rows={6} cols={7} /> : slots.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-2 text-sm font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-sm text-neutral-500">{s.description}</td>
                    <td className="px-3 py-2">
                      <Badge color={s.audience === 'official' ? 'gray' : 'blue'}>
                        {s.audience === 'official' ? '官方頁' : '玩家商城'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={s.self_serve ? 'green' : 'yellow'}>
                        {s.self_serve ? '賣家自助' : '代客開單'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={s.price_per_day}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (v !== s.price_per_day) void patchSlot(s.id, { price_per_day: v })
                        }}
                        className="w-24 px-2 py-1 border border-neutral-200 rounded text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={s.seats_per_day}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (v !== s.seats_per_day) void patchSlot(s.id, { seats_per_day: v })
                        }}
                        className="w-20 px-2 py-1 border border-neutral-200 rounded text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={s.is_active}
                        onCheckedChange={(v) => void patchSlot(s.id, { is_active: v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <div className="mt-6">
        <PageCard
          header={
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">檔期</h2>
              <Button size="sm" onClick={openBook} disabled={supplierSlots.length === 0}>
                供應商代客開單
              </Button>
            </div>
          }
        >
          {(
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    {['版位', '投放對象', '買方', '檔期', '天數', '關鍵字', '金額（G）', '狀態', '操作'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <TableSkeleton rows={5} cols={9} />
                  ) : bookings.length === 0 ? (
                    <TableEmpty colSpan={9} message="還沒有任何廣告檔期" />
                  ) : (
                    bookings.map((b) => {
                      const slot = slots.find((s) => s.id === b.slot_id)
                      return (
                        <tr key={b.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="px-3 py-2 text-sm">{slot?.name || b.slot_id}</td>
                          <td className="px-3 py-2 text-sm max-w-[220px] truncate">
                            {b.listing_title || '—'}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {b.supplier_name ? (
                              <span className="text-amber-700">{b.supplier_name}</span>
                            ) : (
                              b.buyer_name || '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm whitespace-nowrap">{b.start_date}</td>
                          <td className="px-3 py-2 text-sm">{b.days}</td>
                          <td className="px-3 py-2 text-sm">{b.keyword || '—'}</td>
                          <td className="px-3 py-2 text-sm">{b.cost.toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <Badge color={b.status === 'active' ? 'green' : 'gray'}>
                              {b.status === 'active' ? '有效' : '已取消'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {b.status === 'active' && (
                              <Button size="sm" variant="secondary" onClick={() => cancelBooking(b)}>
                                取消
                              </Button>
                            )}
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
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="供應商代客開單">
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
            供應商版位不開放前台自助購買（DB 的 <code>sell_ad_purchase()</code> 會擋下）。
            價格可談，所以金額預設帶入定價後可自行改。席次一樣會檢查，不會超賣。
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">版位</label>
            <SelectField
              value={form.slot_id}
              onChange={(e) => {
                const s = supplierSlots.find((x) => x.id === e.target.value)
                setForm((f) => ({
                  ...f,
                  slot_id: e.target.value,
                  cost: (s?.price_per_day || 0) * f.days,
                }))
              }}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {supplierSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（定價 {s.price_per_day}G／天 · 每日 {s.seats_per_day} 席）
                </option>
              ))}
            </SelectField>
          </div>

          <Input
            label="供應商名稱"
            value={form.supplier_name}
            onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
            placeholder="例：BANPRESTO"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="檔期起始日"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <Input
              label="天數"
              type="number"
              value={String(form.days)}
              onChange={(e) => {
                const days = Number(e.target.value) || 1
                const s = supplierSlots.find((x) => x.id === form.slot_id)
                setForm({ ...form, days, cost: (s?.price_per_day || 0) * days })
              }}
            />
          </div>

          <Input
            label="金額（G，可談，預設為定價 × 天數）"
            type="number"
            value={String(form.cost)}
            onChange={(e) => setForm({ ...form, cost: Number(e.target.value) || 0 })}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              取消
            </Button>
            <Button onClick={submitBooking} isLoading={isSaving}>
              建立檔期
            </Button>
          </div>
        </div>
      </Modal>

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
