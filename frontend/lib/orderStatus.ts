/**
 * 配送訂單狀態的單一來源（老闆 2026-08-26：「五種狀態＋已取消，前台有同步嗎？」）
 *
 * 有，但只同步了一半：`orders.status` 全站是同一組值（後台改、綠界 callback 改、
 * 前台讀，都是同一張表），可是**文案在前台自己內部就有三套**，同一張訂單
 * 講兩個名字：
 *
 *   status=processing → 列表徽章寫「已提交」，展開的步驟條停在「揀貨中」
 *   status=picked_up  → 徽章寫「已出貨」，卻被歸在「已提交」那個頁籤底下
 *
 * 玩家看到的是矛盾，不是進度。所以 label／顏色／第幾格／歸哪個頁籤全部收在這裡，
 * 徽章與步驟條吃同一份，改一個地方兩邊一起動。
 *
 * 用詞取玩家聽得懂的那套（已申請／揀貨中／已出貨），不是後台的營運用語
 * （已提交／處理中／物流已收取）—— 後台給廠商與管理員看，講精準；
 * 前台給玩家看，講白話。兩邊一一對應，只是換了說法。
 */

export const ORDER_STEPS = ['已申請', '揀貨中', '已出貨', '配送中', '已送達'] as const

export type OrderStatus =
  | 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled'

interface StatusMeta {
  label: string
  /** 走到第幾格（0-based，對應 ORDER_STEPS）；cancelled 不走步驟條 */
  step: number
  color: string
  bg: string
  border: string
}

const STATUS: Record<OrderStatus, StatusMeta> = {
  submitted:  { label: '已申請', step: 0, color: 'text-blue-500',      bg: 'bg-blue-50',              border: 'border-blue-100' },
  processing: { label: '揀貨中', step: 1, color: 'text-amber-500',     bg: 'bg-amber-50',             border: 'border-amber-100' },
  picked_up:  { label: '已出貨', step: 2, color: 'text-orange-500',    bg: 'bg-orange-50',            border: 'border-orange-100' },
  shipping:   { label: '配送中', step: 3, color: 'text-indigo-500',    bg: 'bg-indigo-50',            border: 'border-indigo-100' },
  delivered:  { label: '已送達', step: 4, color: 'text-accent-emerald', bg: 'bg-accent-emerald/10',   border: 'border-accent-emerald/20' },
  cancelled:  { label: '已取消', step: -1, color: 'text-red-500',      bg: 'bg-red-50',               border: 'border-red-100' },
}

/**
 * 舊資料裡有 `completed`，意思跟 `delivered` 一樣。
 * 原本步驟條的對照表沒收它，查不到就 `?? 0` —— 一張已送達的單會把進度條倒退回
 * 第一格「已申請」。這裡先正規化，別讓每個呼叫端各記一次。
 */
export function normalizeOrderStatus(status: string | null | undefined): OrderStatus {
  const s = String(status ?? '')
  if (s === 'completed') return 'delivered'
  return (s in STATUS ? s : 'submitted') as OrderStatus
}

export function orderStatusConfig(status: string | null | undefined) {
  return STATUS[normalizeOrderStatus(status)]
}

export function orderStepIndex(status: string | null | undefined): number {
  return STATUS[normalizeOrderStatus(status)].step
}

/** 訂單走完了沒 —— 已送達的最後一格要顯示「完成」，不是「進行中」 */
export function isOrderFinal(status: string | null | undefined): boolean {
  return normalizeOrderStatus(status) === 'delivered'
}

/**
 * 頁籤分組。picked_up（已出貨）原本被歸在「已申請」那籤 ——
 * 徽章都寫「已出貨」了，玩家當然去「配送中」找，結果找不到。東西已經在路上就算配送中。
 */
export const DELIVERY_TABS = [
  { id: 'all',       label: '全部',   match: () => true },
  { id: 'submitted', label: '待出貨', match: (s: OrderStatus) => s === 'submitted' || s === 'processing' },
  { id: 'shipping',  label: '配送中', match: (s: OrderStatus) => s === 'picked_up' || s === 'shipping' },
  { id: 'completed', label: '已完成', match: (s: OrderStatus) => s === 'delivered' },
  { id: 'cancelled', label: '已取消', match: (s: OrderStatus) => s === 'cancelled' },
] as const

export type DeliveryTabId = (typeof DELIVERY_TABS)[number]['id']

export function matchesDeliveryTab(tab: DeliveryTabId, status: string | null | undefined): boolean {
  const t = DELIVERY_TABS.find(x => x.id === tab)
  return t ? t.match(normalizeOrderStatus(status)) : true
}
