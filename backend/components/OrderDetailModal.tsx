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

/**
 * 一行一組：label 固定窄欄靠左，值緊接著。
 *
 * 第一版用 4 欄網格＋col-span，結果取貨門市右邊空一格、物流單號孤零零掛在第四欄、
 * 最後一行右半整片空白 —— 欄位對不齊，眼睛得跳著找（老闆 2026-08-26：
 * 「收件與配送下的欄位排列很難閱讀」）。
 *
 * 改成所有 label 靠左對齊，掃描路徑變成一條直線，也不會再有空洞。
 * 同一組的東西用「·」串在同一行，不各佔一格。
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5">
      <div className="w-16 shrink-0 text-sm leading-relaxed text-neutral-400">{label}</div>
      <div className="min-w-0 flex-1 text-[15px] leading-relaxed text-neutral-900">{children}</div>
    </div>
  )
}

/** 同一行裡的分隔點 */
function Dot() {
  return <span className="mx-2 text-neutral-300">·</span>
}

function Section({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="border-t border-neutral-100 px-6 py-4 first:border-t-0">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-neutral-500">{title}</h3>
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
  order, isOpen, onClose, onStatusChange, readOnly = false,
}: {
  order: OrderDetailData | null
  isOpen: boolean
  onClose: () => void
  onStatusChange?: (status: string) => void
  /** 廠商帳號只看得到，不能操作 */
  readOnly?: boolean
}) {
  if (!order) return null

  const { channel, detail, isCvs } = logisticsSummary(order)

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
        <div className="flex items-center justify-between gap-4">
          {/*
            列印留在列表的操作欄，彈窗不再重複放一次（老闆 2026-08-26：「這邊不要有列印兩個按鈕」）。
            這裡只做一件事：改狀態。下拉用一般尺寸 —— `compact` 是給表格內嵌用的，
            放在這裡會小到看不清楚。
          */}
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap text-sm text-neutral-500">切換狀態</span>
            <div className="w-48">
              <SelectField
                aria-label="切換配送狀態"
                value={order.status}
                onChange={e => onStatusChange?.(e.target.value)}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SelectField>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-200"
          >
            關閉
          </button>
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

        {/* 用戶擺在收件資訊之前（老闆 2026-08-26）—— 先知道是誰的單，再看寄去哪 */}
        <Section title="用戶">
          <Row label="會員">
            <span>{order.userName || '—'}</span>
            <Dot />
            <MemberNo no={order.memberNo} uuid={order.userId} />
            <Dot />
            <span className="text-neutral-500">{order.user}</span>
          </Row>
        </Section>

        <Section title="收件與配送">
          <Row label="收件人">
            {order.recipientName || '—'}
            <Dot />
            <span className="font-mono tabular-nums">{order.recipientPhone || '—'}</span>
          </Row>
          <Row label="配送">
            <span className={`mr-2 inline-block rounded px-2 py-0.5 text-sm font-medium ${
              isCvs ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
            }`}>{channel}</span>
            {detail || '—'}
            {isCvs && order.storeId && (
              <span className="ml-1.5 font-mono text-sm text-neutral-400">（{order.storeId}）</span>
            )}
          </Row>
          <Row label="單據">
            <span className="font-mono tabular-nums">{order.shippingFee > 0 ? `運費 $${order.shippingFee}` : '免運'}</span>
            <Dot />
            <span className="text-neutral-500">單號</span>{' '}
            <span className="font-mono tabular-nums">{order.trackingNumber || '—'}</span>
          </Row>
          <Row label="時間">
            <span className="text-neutral-500">提交</span>{' '}
            <span className="font-mono tabular-nums" title={order.submittedAt}>{order.date || '—'}</span>
            {order.status !== 'delivered' && order.status !== 'cancelled' && (
              <span className={`ml-2 text-sm tabular-nums ${order.days > 3 ? 'font-semibold text-red-500' : 'text-neutral-400'}`}>
                （等 {order.days} 天）
              </span>
            )}
            <Dot />
            <span className="text-neutral-500">出貨</span>{' '}
            <span className="font-mono tabular-nums">{order.shippedAt || '—'}</span>
          </Row>
        </Section>

        <Section
          title="品項"
          right={<span className="text-sm tabular-nums text-neutral-400">共 {order.items.length} 件</span>}
        >
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {order.items.length === 0 ? (
              <p className="py-3 text-center text-sm text-neutral-400">這張訂單沒有品項</p>
            ) : order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-neutral-50">
                <span className="w-6 shrink-0 text-right font-mono text-sm tabular-nums text-neutral-300">{i + 1}</span>
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-neutral-100">
                  <Image src={it.imageUrl} alt={it.prizeName} fill sizes="44px" className="object-cover" unoptimized />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] leading-snug text-neutral-900">{it.prizeName}</p>
                  <p className="truncate text-[13px] leading-snug text-neutral-400">{it.product}</p>
                </div>
                <span className="shrink-0 rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                  {it.level}
                </span>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </Modal>
  )
}
