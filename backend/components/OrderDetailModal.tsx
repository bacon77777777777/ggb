'use client'

import Image from 'next/image'
import Modal from './Modal'
import Badge from './ui/Badge'
import ShippingProgress from './ShippingProgress'
import MemberNo from './MemberNo'
import SelectField from './ui/SelectField'
import { logisticsSummary } from '@/lib/logisticsLabels'

/**
 * 配送詳情彈窗（老闆 2026-08-26：「畫面留空一堆，改成彈窗，密度密集一點」）
 *
 * 取代原本的 /orders/[id] 整頁。彈窗不只是少跳一次頁 ——
 * 出貨人員一天要開幾十次詳情，跳頁再返回會把捲動位置、篩選、勾選全部弄丟，
 * 每次回來都要重新找到剛才那一列。關掉彈窗，一切都還在原位。
 *
 * 密度的關鍵是不要用 `flex justify-between` 排 label/value ——
 * 那會把兩者推到卡片兩端，中間留一大條空白（原本詳情頁的主要問題）。
 * 改成 label 在上、值在下的堆疊，兩三欄並排。
 *
 * 資料直接吃列表已經撈好的那筆，不再打一次 API：欄位一模一樣，
 * 而且點開就有，不用等載入。
 */

export interface OrderDetailData {
  id: number
  orderId: string
  status: string
  userId: string
  memberNo?: number | null
  user: string
  userName: string
  recipientName: string
  recipientPhone: string
  address: string
  trackingNumber: string
  shippingFee: number
  logisticsType: string
  logisticsSubtype: string
  storeName: string
  storeId: string
  date: string
  submittedAt: string
  shippedAt: string | null
  days: number
  hasLarge: boolean
  items: { product: string; productType: string; level: string; prizeName: string; imageUrl: string }[]
}

/** label 在上、值在下 —— 密度的關鍵，不要用 justify-between */
function Field({ label, children, className = '' }: {
  label: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <div className="text-[11px] leading-tight text-neutral-400">{label}</div>
      <div className="mt-0.5 text-sm leading-snug text-neutral-900">{children}</div>
    </div>
  )
}

function Section({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="border-t border-neutral-100 px-5 py-3 first:border-t-0">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

const STATUS_OPTIONS = [
  { value: 'submitted',  label: '已提交' },
  { value: 'processing', label: '處理中' },
  { value: 'picked_up',  label: '物流已收取' },
  { value: 'shipping',   label: '配送中' },
  { value: 'delivered',  label: '已送達' },
  { value: 'cancelled',  label: '已取消' },
]

const STATUS_TEXT: Record<string, string> =
  Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]))

export default function OrderDetailModal({
  order, isOpen, onClose, onStatusChange, onPrintLabel, onPrintSlip, onGenerateLabel, readOnly = false,
}: {
  order: OrderDetailData | null
  isOpen: boolean
  onClose: () => void
  onStatusChange?: (status: string) => void
  onPrintLabel?: () => void
  onPrintSlip?: () => void
  onGenerateLabel?: () => void
  /** 廠商帳號只看得到，不能操作 */
  readOnly?: boolean
}) {
  if (!order) return null

  const { channel, detail, isCvs } = logisticsSummary(order)
  const canLabel = order.status === 'submitted' ||
    (!order.trackingNumber && (order.status === 'processing' || order.status === 'picked_up'))
  const printable = order.status !== 'submitted' && order.status !== 'cancelled'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base tabular-nums">{order.orderId}</span>
          <Badge status={order.status}>{STATUS_TEXT[order.status] ?? order.status}</Badge>
          {order.hasLarge && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">大件</span>
          )}
        </span>
      }
      footer={readOnly ? null : (
        <div className="flex items-center justify-between gap-3">
          <div className="w-44">
            {/* 切換狀態原本孤零零掛在頁面右上角，跟其他操作分家。收進 footer 一起 */}
            <SelectField
              compact
              aria-label="切換配送狀態"
              value={order.status}
              onChange={e => onStatusChange?.(e.target.value)}
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </SelectField>
          </div>
          <div className="flex items-center gap-2">
            {order.status !== 'cancelled' && (
              <button
                onClick={onPrintSlip}
                className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-200"
              >
                列印明細
              </button>
            )}
            {printable && (
              <button
                onClick={onPrintLabel}
                className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-200"
              >
                列印物流單
              </button>
            )}
            {canLabel && (
              <button
                onClick={onGenerateLabel}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
              >
                開配送單
              </button>
            )}
          </div>
        </div>
      )}
    >
      <div className="-mx-6 -my-4">
        {/* 進度：細版，一行高，不再是五個 40px 大圓橫跨整個畫面 */}
        <Section title="配送進度">
          <ShippingProgress
            status={order.status as never}
            submittedAt={order.submittedAt}
            shippedAt={order.shippedAt}
            showTitle={false}
            compact
          />
        </Section>

        <Section title="收件與配送">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Field label="收件人">{order.recipientName || '—'}</Field>
            <Field label="聯絡電話">
              <span className="font-mono tabular-nums">{order.recipientPhone || '—'}</span>
            </Field>
            <Field label="配送方式">
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                isCvs ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
              }`}>{channel}</span>
            </Field>
            <Field label="運費">
              <span className="font-mono tabular-nums">{order.shippingFee > 0 ? `$${order.shippingFee}` : '免運'}</span>
            </Field>
            <Field label={isCvs ? '取貨門市' : '收件地址'} className="col-span-2 sm:col-span-3">
              {detail || '—'}
              {isCvs && order.storeId && (
                <span className="ml-1 font-mono text-xs text-neutral-400">（{order.storeId}）</span>
              )}
            </Field>
            <Field label="物流單號">
              <span className="font-mono tabular-nums">{order.trackingNumber || '—'}</span>
            </Field>
            <Field label="提交日期">
              <span className="font-mono tabular-nums" title={order.submittedAt}>{order.date || '—'}</span>
              {order.status !== 'delivered' && order.status !== 'cancelled' && (
                <span className={`ml-1.5 text-xs tabular-nums ${order.days > 3 ? 'font-semibold text-red-500' : 'text-neutral-400'}`}>
                  等 {order.days} 天
                </span>
              )}
            </Field>
            <Field label="出貨時間" className="col-span-2 sm:col-span-3">
              <span className="font-mono tabular-nums">{order.shippedAt || '—'}</span>
            </Field>
          </div>
        </Section>

        <Section
          title="品項"
          right={<span className="text-xs tabular-nums text-neutral-400">共 {order.items.length} 件</span>}
        >
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {order.items.length === 0 ? (
              <p className="py-3 text-center text-sm text-neutral-400">這張訂單沒有品項</p>
            ) : order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-neutral-50">
                <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-300">{i + 1}</span>
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-neutral-100">
                  <Image src={it.imageUrl} alt={it.prizeName} fill sizes="36px" className="object-cover" unoptimized />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-tight text-neutral-900">{it.prizeName}</p>
                  <p className="truncate text-xs leading-tight text-neutral-400">{it.product}</p>
                </div>
                <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                  {it.level}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="玩家">
          {/* 三個欄位一行講完，原本是右側整張獨立卡片 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-neutral-900">{order.userName || '—'}</span>
            <MemberNo no={order.memberNo} uuid={order.userId} />
            <span className="text-neutral-500">{order.user}</span>
          </div>
        </Section>
      </div>
    </Modal>
  )
}
