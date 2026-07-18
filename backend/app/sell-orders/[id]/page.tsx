'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AdminLayout, PageCard, Button, Input, CopyableID } from '@/components'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'
import { CardSkeleton } from '@/components/ui/Skeleton'

type OrderPayload = {
  id: number
  listing_id: number
  seller_id: string
  buyer_id: string
  item_index: number
  quantity: number
  unit_price: number
  payment_method: string
  step: number
  paid_at: string | null
  payment_proof_urls: string[] | null
  seller_confirmed_at: string | null
  tracking_number: string | null
  shipped_at: string | null
  received_at: string | null
  completed_at: string | null
  cancelled: boolean
  cancel_reason: string | null
  created_at: string
  updated_at: string
  listing?: { id: number; title?: string | null; note?: string | null; images?: string[] | null; items?: any[] | null } | null
  seller?: { id: string; name?: string | null; email?: string | null } | null
  buyer?: { id: string; name?: string | null; email?: string | null } | null
}

type MsgRow = {
  id: number
  listing_id: number
  sender_id: string
  receiver_id: string
  kind: string
  body: string | null
  created_at: string
}

const stepLabel = (step: number) => {
  if (step === 1) return '建立'
  if (step === 2) return '付款'
  if (step === 3) return '確認'
  if (step === 4) return '出貨'
  if (step === 5) return '收貨'
  return '完成'
}

export default function SellOrderDetailPage() {
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = String(params?.id || '')

  const [order, setOrder] = useState<OrderPayload | null>(null)
  const [messages, setMessages] = useState<MsgRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [cancelReason, setCancelReason] = useState('')

  const listingTitle = useMemo(() => String(order?.listing?.title || order?.listing_id || '').trim() || '販售商品', [order?.listing?.title, order?.listing_id])

  const selectedItem = useMemo(() => {
    const items = Array.isArray(order?.listing?.items) ? (order?.listing?.items as any[]) : []
    const idx = Number(order?.item_index ?? -1)
    if (!Number.isFinite(idx) || idx < 0) return null
    return items[idx] || null
  }, [order?.item_index, order?.listing?.items])

  const totalPrice = useMemo(() => {
    const qty = Math.max(1, Number(order?.quantity || 1))
    const unit = Math.max(0, Number(order?.unit_price || 0))
    return qty * unit
  }, [order?.quantity, order?.unit_price])

  const statusText = useMemo(() => {
    if (!order) return ''
    if (order.cancelled) return '已取消'
    if (order.completed_at) return '已完成'
    return '進行中'
  }, [order])

  const load = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/sell/orders/${encodeURIComponent(id)}`, { method: 'GET', credentials: 'include', cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || res.statusText || '載入失敗')
      }
      const json = (await res.json().catch(() => null)) as any
      const o = (json?.order || null) as OrderPayload | null
      setOrder(o)
      setMessages(Array.isArray(json?.messages) ? (json.messages as MsgRow[]) : [])
      setTrackingNumber(String(o?.tracking_number || ''))
      setCancelReason(String(o?.cancel_reason || ''))
    } catch (e) {
      console.error('Failed to load sell order:', e)
      setOrder(null)
      setMessages([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  const patch = async (payload: Record<string, any>) => {
    if (!id) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/sell/orders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '更新失敗')
      }
      await load()
    } catch (e) {
      console.error('Failed to patch sell order:', e)
      toast('更新失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading && !order) {
    return (
      <AdminLayout pageTitle="販售訂單">
        <CardSkeleton rows={4} />
      </AdminLayout>
    )
  }

  if (!order) {
    return (
      <AdminLayout pageTitle="販售訂單">
        <div className="p-6">
          <PageCard>
            <div className="py-10 text-center text-neutral-500">找不到此訂單</div>
            <div className="flex justify-center pb-4">
              <Button variant="secondary" onClick={() => router.push('/sell-orders')}>
                返回列表
              </Button>
            </div>
          </PageCard>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout
      pageTitle="販售訂單"
      breadcrumbs={[
        { label: '販售訂單', href: '/sell-orders' },
        { label: `#${order.id}` },
      ]}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PageCard>
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-neutral-900">訂單</div>
              <span className="text-xs font-bold text-neutral-500">{statusText}</span>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">ID</span>
                <span className="text-neutral-900 font-mono">
                  <CopyableID id={String(order.id)} />
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">金額</span>
                <span className="text-neutral-900 font-bold">{totalPrice.toLocaleString()} G</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">付款</span>
                <span className="text-neutral-900">{order.payment_method === 'transfer' ? '轉帳' : '私下'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">建立</span>
                <span className="text-neutral-900 font-mono text-xs">{formatDateTime(order.created_at)}</span>
              </div>
            </div>
          </PageCard>

          <PageCard>
            <div className="text-sm font-bold text-neutral-900">上架單</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">ID</span>
                <span className="text-neutral-900 font-mono">
                  <CopyableID id={String(order.listing_id)} />
                </span>
              </div>
              <div className="text-neutral-900 font-bold break-words">{listingTitle}</div>
              <div className="flex gap-2">
                <Link href={`/sell`} className="text-primary hover:text-blue-800 text-sm font-medium">
                  回販售管理
                </Link>
              </div>
            </div>
          </PageCard>

          <PageCard>
            <div className="text-sm font-bold text-neutral-900">品項</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="text-neutral-900 font-bold break-words">{String(selectedItem?.name || '').trim() || '品項'}</div>
              <div className="text-xs text-neutral-500">
                {[String(selectedItem?.series || '').trim(), String(selectedItem?.grade || '').trim()].filter(Boolean).join(' / ') || '—'}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">單價</span>
                <span className="text-neutral-900 font-mono">{Math.max(0, Number(order.unit_price || 0)).toLocaleString()} G</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">數量</span>
                <span className="text-neutral-900 font-mono">{Math.max(1, Number(order.quantity || 1))}</span>
              </div>
            </div>
          </PageCard>
        </div>

        <PageCard>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-neutral-900">進度</div>
            <div className="text-xs text-neutral-500">Step {order.step} / 6</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <button
                key={s}
                type="button"
                disabled={isSaving}
                onClick={() => patch({ step: s })}
                className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                  order.step === s ? 'bg-primary text-white border-primary' : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                {stepLabel(s)}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: 'paid_at', label: '付款時間', value: order.paid_at },
              { key: 'seller_confirmed_at', label: '賣家確認', value: order.seller_confirmed_at },
              { key: 'shipped_at', label: '出貨時間', value: order.shipped_at },
              { key: 'received_at', label: '收貨時間', value: order.received_at },
              { key: 'completed_at', label: '完成時間', value: order.completed_at },
            ].map((t) => (
              <div key={t.key} className="rounded-xl border border-neutral-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-bold text-neutral-700">{t.label}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => patch({ [t.key]: 'now' })}
                      className="text-xs font-bold text-primary hover:text-blue-800 disabled:opacity-50"
                    >
                      設為現在
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => patch({ [t.key]: null })}
                      className="text-xs font-bold text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs font-mono text-neutral-500">{t.value ? formatDateTime(t.value) : '—'}</div>
              </div>
            ))}
          </div>
        </PageCard>

        <PageCard>
          <div className="text-sm font-bold text-neutral-900">物流</div>
          <div className="mt-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-neutral-500 mb-1">物流單號</div>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="輸入 tracking number" />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="primary"
                disabled={isSaving}
                onClick={() => patch({ tracking_number: trackingNumber })}
              >
                儲存
              </Button>
              <Button variant="secondary" disabled={isSaving} onClick={() => patch({ tracking_number: '' })}>
                清空
              </Button>
            </div>
          </div>
        </PageCard>

        <PageCard>
          <div className="text-sm font-bold text-neutral-900">取消</div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <div className="text-xs text-neutral-500 mb-1">原因</div>
              <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="取消原因（可留空）" />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant={order.cancelled ? 'secondary' : 'danger'}
                disabled={isSaving}
                onClick={() => patch({ cancelled: !order.cancelled, cancel_reason: cancelReason })}
              >
                {order.cancelled ? '取消撤銷' : '取消訂單'}
              </Button>
            </div>
          </div>
        </PageCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PageCard>
            <div className="text-sm font-bold text-neutral-900">買家</div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="text-neutral-900 font-bold">{String(order.buyer?.name || '未知會員')}</div>
              <div className="text-xs text-neutral-500 break-all">{String(order.buyer?.email || '') || '—'}</div>
              <div className="text-xs text-neutral-500">
                <CopyableID id={String(order.buyer_id)} />
              </div>
            </div>
          </PageCard>
          <PageCard>
            <div className="text-sm font-bold text-neutral-900">賣家</div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="text-neutral-900 font-bold">{String(order.seller?.name || '未知會員')}</div>
              <div className="text-xs text-neutral-500 break-all">{String(order.seller?.email || '') || '—'}</div>
              <div className="text-xs text-neutral-500">
                <CopyableID id={String(order.seller_id)} />
              </div>
            </div>
          </PageCard>
        </div>

        <PageCard>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-neutral-900">私訊</div>
            <div className="text-xs text-neutral-500">{messages.length} 則</div>
          </div>
          <div className="mt-3 space-y-2 max-h-[360px] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="py-8 text-center text-neutral-500 text-sm">沒有訊息</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="rounded-xl border border-neutral-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-neutral-600">{m.kind === 'system' ? '系統' : '訊息'}</div>
                    <div className="text-xs font-mono text-neutral-400">{formatDateTime(m.created_at)}</div>
                  </div>
                  <div className="mt-1 text-sm text-neutral-900 break-words">{String(m.body || '').trim() || '—'}</div>
                </div>
              ))
            )}
          </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}

