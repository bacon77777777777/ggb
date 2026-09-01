'use client'

import Image from 'next/image'
import Modal from './Modal'
import Badge from './ui/Badge'
import ShippingProgress from './ShippingProgress'
import MemberNo from './MemberNo'
import SelectField from './ui/SelectField'
import { logisticsSummary, deliveryMethodLabel } from '@/lib/logisticsLabels'

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
  deliveredAt?: string | null
  days: number
  hasLarge: boolean
  items: { product: string; productType: string; level: string; prizeName: string; imageUrl: string }[]
}

/**
 * 一格一組 `label：value`，外層用網格排成三欄（老闆 2026-08-26 指定的參考排法）。
 *
 * 走過兩版彎路：
 *   第一版 4 欄網格＋col-span → 取貨門市右邊空一格、物流單號孤零零掛在第四欄，
 *   欄位對不齊、眼睛要跳著找。
 *   第二版把值全串成一行 → 一行太長，運費／單號／時間全擠在一起更難讀。
 *
 * 現在 label 緊貼自己的值成一格，格子再對齊成欄 —— 掃描時每一格都是完整的一組，
 * 不用左右找對應。
 */
function Cell({ label, children, span }: {
  label: string
  children: React.ReactNode
  /** 值太長時佔滿整列（例如宅配地址） */
  span?: boolean
}) {
  return (
    <div className={`flex gap-1.5 text-[15px] leading-relaxed ${span ? 'col-span-full' : ''}`}>
      <span className="shrink-0 whitespace-nowrap text-neutral-400">{label}：</span>
      <span className="min-w-0 text-neutral-900">{children}</span>
    </div>
  )
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

  const { detail, isCvs } = logisticsSummary(order)

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
          <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <Cell label="會員">{order.userName || '—'}</Cell>
            <Cell label="會員編號"><MemberNo no={order.memberNo} uuid={order.userId} plain /></Cell>
            <Cell label="電子郵件">
              <span className="break-all">{order.user || '—'}</span>
            </Cell>
          </div>
        </Section>

        <Section title="收件與配送">
          {/*
            三排固定順序（老闆 2026-08-26 指定）：
              ① 配送方式・運費・物流單號   —— 這單怎麼寄、收多少、單號多少
              ② 收件人・收件電話・收件地址 —— 寄給誰、寄去哪
              ③ 提交・出貨・送達           —— 三個時間點並排，一眼看出卡在哪一段
          */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <Cell label="配送方式">
              <span className={`inline-block rounded px-2 py-0.5 text-sm font-medium ${
                isCvs ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
              }`}>{deliveryMethodLabel(order)}</span>
            </Cell>
            <Cell label="運費">
              <span className="font-mono tabular-nums">{order.shippingFee > 0 ? `$${order.shippingFee}` : '免運'}</span>
            </Cell>
            <Cell label="物流單號">
              <span className="font-mono tabular-nums">{order.trackingNumber || '—'}</span>
            </Cell>

            <Cell label="收件人">{order.recipientName || '—'}</Cell>
            <Cell label="收件電話">
              <span className="font-mono tabular-nums">{order.recipientPhone || '—'}</span>
            </Cell>
            <Cell label={isCvs ? '取貨門市' : '收件地址'}>
              {detail || '—'}
              {isCvs && order.storeId && (
                <span className="ml-1.5 font-mono text-sm text-neutral-400">（{order.storeId}）</span>
              )}
            </Cell>

            <Cell label="提交時間">
              <span className="font-mono tabular-nums">{order.submittedAt || '—'}</span>
              {order.status !== 'delivered' && order.status !== 'cancelled' && (
                <span className={`ml-2 text-sm tabular-nums ${order.days > 3 ? 'font-semibold text-red-500' : 'text-neutral-400'}`}>
                  等 {order.days} 天
                </span>
              )}
            </Cell>
            <Cell label="出貨日期">
              {order.shippedAt
                ? <span className="font-mono tabular-nums">{order.shippedAt}</span>
                : <span className="text-neutral-400">未出貨</span>}
            </Cell>
            <Cell label="送達日期">
              {order.deliveredAt
                ? <span className="font-mono tabular-nums">{order.deliveredAt}</span>
                : <span className="text-neutral-400">未送達</span>}
            </Cell>
          </div>
        </Section>

        <Section
          title="品項"
          right={<span className="text-sm tabular-nums text-neutral-400">共 {order.items.length} 件</span>}
        >
          {/*
            賞等標籤移到品名左邊、右邊改放數量（老闆 2026-08-26）。
            數量要成立就得先合併同品項 —— items 是一筆一件的抽獎紀錄，
            十連抽同一款會印出十行一模一樣的字。
          */}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {(() => {
              const merged: { level: string; prizeName: string; product: string; imageUrl: string; qty: number }[] = []
              for (const it of order.items) {
                const key = `${it.product}|${it.level}|${it.prizeName}`
                const hit = merged.find(m => `${m.product}|${m.level}|${m.prizeName}` === key)
                if (hit) hit.qty += 1
                else merged.push({ level: it.level, prizeName: it.prizeName, product: it.product, imageUrl: it.imageUrl, qty: 1 })
              }
              if (merged.length === 0) {
                return <p className="py-3 text-center text-[15px] text-neutral-400">這張訂單沒有品項</p>
              }
              return merged.map((it, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-neutral-50">
                  <span className="w-6 shrink-0 text-right font-mono text-sm tabular-nums text-neutral-300">{i + 1}</span>
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-neutral-100">
                    <Image src={it.imageUrl} alt={it.prizeName} fill sizes="44px" className="object-contain" unoptimized />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                        {it.level}
                      </span>
                      <span className="truncate text-[15px] leading-snug text-neutral-900">{it.prizeName}</span>
                    </div>
                    <p className="truncate text-[13px] leading-snug text-neutral-400">{it.product}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-neutral-500">×{it.qty}</span>
                </div>
              ))
            })()}
          </div>
        </Section>

      </div>
    </Modal>
  )
}
