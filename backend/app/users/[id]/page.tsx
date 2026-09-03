'use client'

import AdminLayout from '@/components/AdminLayout'
import { zipFromAddress } from '@/lib/twZip'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/Modal'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'
import { CardSkeleton } from '@/components/ui/Skeleton'
import SelectField from '@/components/ui/SelectField'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import { DataTable, type Column, PageCard } from '@/components'
import Tooltip from '@/components/ui/Tooltip'
import { SettingsShell, SettingsNav, SectionHead, SettingsRow } from '@/components/settings/SettingsSection'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { isSyntheticEmail, realEmail } from '@/lib/syntheticEmail'

// Define interfaces for local state
interface User {
  id: string // UUID
  userId: string
  inviteCode: string | null
  name: string
  email: string
  phone: string
  tokens: number
  registerDate: string
  lastLoginDate: string
  status: 'active' | 'inactive'
  totalOrders: number
  totalSpent: number
  totalDraws: number
  address?: string
  recipientName?: string
  recipientPhone?: string
  isSuspicious?: boolean
  suspiciousReason?: string | null
  disabledReason?: string | null
  disabledBy?: string | null
  gender?: string | null
  birthday?: string | null
  lineBound?: boolean
  points?: number
  totalReferrals?: number
  referrer?: { id: string; name: string; inviteCode: string | null } | null
  lineUserId?: string | null
}

interface OrderItem {
  id: number
  price: number
  product_id: number
  product_prize_id: number
  product: { name: string } | null
  prize: { name: string; level: string } | null
}

interface Order {
  id: number
  orderId: string
  status: string
  submittedAt: string
  items: OrderItem[]
  date: string // fallback for sort
}

interface Draw {
  id: number
  drawId: string
  date: string
  product: string
  prize: string
  amount: number
  ticketNumber: number
  product_id: number
}

interface Recharge {
  id: number
  orderId: string
  amount: number
  bonus: number
  totalTokens: number
  tokenDenomination: number
  status: string
  time: string
}

interface WarehouseItem {
  id: number
  product: string
  prize: string
  drawDate: string
  count: number
}

/**
 * 左側分區。版型與「功能開關」「回收價格設定」共用同一組元件
 * （老闆 2026-08-31：會員詳情也改成左右分）。
 *
 * 順序是老闆指定的：先「這個人是誰」（基本／安全／綁定），
 * 再「他做過什麼」（倉庫／配送／抽獎／兩個帳本／回收）。
 */
type SectionKey =
  | 'basic' | 'security' | 'binding'
  | 'warehouse' | 'orders' | 'draws' | 'recharges' | 'points' | 'dismantled'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'basic',      label: '基本設置' },
  { key: 'security',   label: '安全設置' },
  { key: 'binding',    label: '帳號綁定' },
  { key: 'warehouse',  label: '會員倉庫' },
  // 原本叫「訂單記錄」。這裡列的是配送單（orders），不是儲值訂單 ——
  // 兩種都叫訂單，客服問「他那筆訂單呢」時會找錯地方
  { key: 'orders',     label: '配送紀錄' },
  { key: 'draws',      label: '抽獎紀錄' },
  { key: 'recharges',  label: '代幣流動' },
  { key: 'points',     label: '積分流動' },
  { key: 'dismantled', label: '回收紀錄' },
]

const SECTION_INFO: Partial<Record<SectionKey, string>> = {
  warehouse:  '還在倉庫、尚未申請配送的品項。已申請配送的會移到「配送紀錄」那一單底下。',
  orders:     '玩家申請配送後產生的出貨單，含物流狀態與追蹤號。跟儲值訂單無關。',
  draws:      '每一抽的紀錄，含籤號與獎項。公平性驗證比對的就是這裡的籤號。',
  recharges:  '代幣帳本：儲值、抽獎、回收退、行銷贈點、測試全部在內。最右邊是每一筆之後的累計餘額。',
  points:     '積分帳本（migration 646~651）：簽到、任務、邀請、LINE 綁定、積分抽獎、抽籤登記。所有加減點都走 grant_points／spend_points，不可直接改欄位。',
  dismantled: '玩家把品項回收換成代幣的紀錄。',
}

/**
 * 「捲到底再載一批」的哨兵（跟商品管理同一套做法，老闆 2026-08-31 指定）。
 *
 * 為什麼不用上一頁／下一頁：這幾張表是客服在查東西時往下掃，
 * 翻頁按鈕會打斷視線、而且要記得自己在第幾頁。捲到底自己長出來比較順。
 *
 * 回傳的 ref 掛在列表最後面那個空 div 上，看得到就多切一批。
 */
function useLoadMoreOnScroll(onMore: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const io = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) onMore() },
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onMore, enabled])
  return ref
}

/** 捲到底載更多的提示條。四張表共用，樣式跟商品管理一致 */
function LoadMoreSentinel({ innerRef, loading }: {
  // React 19 的 useRef<T>(null) 給的是 RefObject<T | null>，直接丟給 ref 型別不合
  innerRef: React.Ref<HTMLDivElement>
  loading?: boolean
}) {
  return (
    <div ref={innerRef} className="py-6 text-center">
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-neutral-500">
          <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
          <span className="text-sm">載入中...</span>
        </div>
      ) : <div className="h-4" />}
    </div>
  )
}

/**
 * 唯讀的資料列。版型節奏跟 SettingsRow 一致（左標題右內容、列與列之間一條細線），
 * 但右欄放的是值不是控制項，而且多一顆複製鈕。
 *
 * 原本這些資料是包在兩張白卡裡、用三欄格線排的 —— 白卡疊在白卡上（PageCard 本身
 * 就是白的），加上複製圖示浮在值旁邊，整片看起來很雜。改成一列一件事之後，
 * 欄位再多也只是往下長，不會互相擠。
 */
function InfoRow({ label, desc, copy, field, copiedField, onCopy, children }: {
  label: string
  desc?: string
  /** 有值才出現複製鈕 —— 空白欄位放一顆按不出東西的鈕只是噪音 */
  copy?: string
  field?: string
  copiedField?: string | null
  onCopy?: (text: string, field: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0 sm:w-40 sm:shrink-0">
        <div className="text-sm text-neutral-500">{label}</div>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{desc}</p>}
      </div>
      <div className="flex min-w-0 flex-1 items-start gap-2 text-sm sm:justify-end sm:text-right">
        {children}
        {copy && field && onCopy && (
          <button
            onClick={() => onCopy(copy, field)}
            className="mt-px shrink-0 rounded p-1 transition-colors hover:bg-neutral-100"
            title="複製"
          >
            {copiedField === field ? (
              <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * 頭像網址。
 *
 * `users.avatar_url` 存的是**前台**的路徑（`/images/avatar/29.webp`，八款預設頭像之一，
 * 由 handle_new_user() 隨機配）。後台是另一個部署，那些檔案不在這裡 ——
 * 直接拿來當 src 會 404，畫面上是一個破圖。
 * 外部網址（R2 上傳的）原樣回傳。
 */
const FRONTEND_URL = (process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://www.ggb.com.tw').replace(/\/$/, '')
function avatarSrc(url?: string | null) {
  if (!url) return `${FRONTEND_URL}/images/avatar/01.webp`
  if (/^(https?:|blob:|data:)/.test(url)) return url
  return `${FRONTEND_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * 表單欄位：標題在上、控制項在下（版型照 Ant Design Pro 的個人設定頁）。
 *
 * 唯讀欄位一律用 disabled 的輸入框而不是純文字：兩者的高度、對齊、圓角一致，
 * 整欄掃下來是一條直線；混排的話會像排版壞掉。
 *
 * 沒有 `hint`：欄位底下鋪長句灰字會把表單拉得很長、又搶走輸入框的注意力
 * （老闆 2026-08-31）。要解釋的東西一律收進區塊標題旁的提示圓點。
 */
function Field({ label, children }: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm text-neutral-600">{label}</label>
      {children}
    </div>
  )
}

/** 上方的統計小卡。數字自己算，不從 API 多要一支 */
function StatsRow({ stats }: { stats: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map(s => (
        <div key={s.label} className="rounded-xl border border-neutral-100 bg-white px-4 py-3.5">
          <div className="text-xs text-neutral-400">{s.label}</div>
          <div className="mt-1 font-mono text-xl font-bold text-neutral-900">{s.value}</div>
          {s.sub && <div className="mt-0.5 text-[11px] text-neutral-400">{s.sub}</div>}
        </div>
      ))}
    </div>
  )
}

export default function UserDetailPage() {
  /*
   * 帳本的時間格式（老闆 2026-08-31 指定）：`2026-08-14 03:36:35`
   *
   * 用 `sv-SE`：那個地區的預設格式剛好就是 ISO 風格的 24 小時制，
   * 不用自己拼字串補零。原本的 zh-TW 會給「08/31 上午07:49」——
   * 對帳時看不到年份，而且上午／下午比 24 小時制難掃。
   * 不指定時區＝用瀏覽器本地時間（台灣），跟後台其他頁一致。
   */
  const fmtLedgerTime = (v: string) =>
    v ? new Date(v).toLocaleString('sv-SE').replace('T', ' ') : '-'

  /*
   * 積分帳本的欄位。型別標籤的字要跟 point_ledger 的 CHECK constraint 對齊
   * （migration 646），加新來源時兩邊一起改；沒對到的會原樣顯示代碼，
   * 不會壞掉但看得出來漏了。
   */
  const POINT_TYPE_MAP: Record<string, { label: string; cls: string }> = {
    opening:        { label: '期初結轉', cls: 'bg-neutral-100 text-neutral-600' },
    check_in:       { label: '簽到',     cls: 'bg-green-50 text-green-700' },
    task:           { label: '任務',     cls: 'bg-green-50 text-green-700' },
    referral:       { label: '邀請',     cls: 'bg-green-50 text-green-700' },
    line_bonus:     { label: 'LINE 綁定', cls: 'bg-green-50 text-green-700' },
    worship:        { label: '膜拜',     cls: 'bg-green-50 text-green-700' },
    draw:           { label: '積分抽獎', cls: 'bg-rose-50 text-rose-700' },
    lottery_entry:  { label: '抽籤登記', cls: 'bg-rose-50 text-rose-700' },
    lottery_refund: { label: '抽籤退點', cls: 'bg-amber-50 text-amber-700' },
    manual:         { label: '手動調整', cls: 'bg-orange-50 text-orange-600' },
    correction:     { label: '帳務更正', cls: 'bg-orange-50 text-orange-600' },
  }

  /*
   * 兩個帳本的欄位骨架刻意做成一樣（老闆 2026-08-31）：
   *
   *   時間 → 類型 → 說明 →（該幣別專屬欄）→ 操作者 → 異動 → 累計餘額
   *
   * **累計餘額永遠是最右邊那一欄** —— 對帳時眼睛沿著右緣往下掃就好，
   * 不必在兩個頁籤之間重新找欄位在哪。
   * 代幣多了「面額／贈送」兩欄（只有儲值才有值），其餘完全對齊。
   */
  /* 配送狀態的中文。cancelled 原本沒進這張表，畫面就直接印出英文代碼 */
  const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
    submitted:  { label: '已提交', cls: 'bg-yellow-100 text-yellow-700' },
    processing: { label: '處理中', cls: 'bg-blue-100 text-primary' },
    picked_up:  { label: '物流已收取', cls: 'bg-blue-100 text-primary' },
    shipping:   { label: '配送中', cls: 'bg-purple-100 text-purple-700' },
    delivered:  { label: '已送達', cls: 'bg-green-100 text-green-700' },
    cancelled:  { label: '已取消', cls: 'bg-neutral-100 text-neutral-600' },
  }

  const orderColumns: Column<any>[] = [
    {
      key: 'orderId', label: '訂單編號',
      render: (o: any) => (
        <Link href={`/orders/${o.id}`} className="font-mono text-sm text-primary hover:underline">
          {o.orderId}
        </Link>
      ),
    },
    {
      key: 'status', label: '狀態',
      render: (o: any) => {
        const m = ORDER_STATUS[o.status] ?? { label: o.status, cls: 'bg-neutral-100 text-neutral-600' }
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>
      },
    },
    {
      key: 'items', label: '件數',
      className: 'text-right font-mono',
      render: (o: any) => `${o.items?.length ?? 0} 件`,
    },
    {
      key: 'submittedAt', label: '提交時間',
      className: 'font-mono text-xs text-neutral-500 whitespace-nowrap',
      render: (o: any) => o.submittedAt || '—',
    },
  ]

  const drawColumns: Column<any>[] = [
    { key: 'product', label: '商品', className: 'text-neutral-900', render: (d: any) => d.product },
    {
      key: 'prize', label: '賞等',
      render: (d: any) => (
        <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
          {d.prize}
        </span>
      ),
    },
    {
      key: 'ticketNumber', label: '籤號',
      className: 'font-mono text-xs',
      // 轉蛋／盒玩沒有籤號（走 play_gacha），顯示破折號而不是 000
      render: (d: any) => d.ticketNumber ? String(d.ticketNumber).padStart(3, '0') : '—',
    },
    { key: 'amount', label: '金額 (G)', className: 'text-right font-mono', render: (d: any) => Number(d.amount).toLocaleString() },
    { key: 'drawId', label: '交易編號', className: 'font-mono text-xs text-neutral-400', render: (d: any) => d.drawId || '—' },
    { key: 'date', label: '時間', className: 'font-mono text-xs text-neutral-500 whitespace-nowrap', render: (d: any) => d.date },
  ]

  const warehouseColumns: Column<any>[] = [
    { key: 'product', label: '商品', className: 'text-neutral-900', render: (i: any) => i.product },
    {
      key: 'prize', label: '賞等',
      render: (i: any) => (
        <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
          {i.prize || '—'}
        </span>
      ),
    },
    { key: 'count', label: '數量', className: 'text-right font-mono', render: (i: any) => `x${i.count}` },
    {
      key: 'status', label: '狀態',
      render: () => (
        <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
          未提交配送
        </span>
      ),
    },
    { key: 'drawDate', label: '獲得時間', className: 'font-mono text-xs text-neutral-500 whitespace-nowrap', render: (i: any) => i.drawDate || '—' },
  ]

  const dismantledColumns: Column<any>[] = [
    { key: 'product', label: '商品', className: 'text-neutral-900', render: (i: any) => i.product },
    {
      key: 'prize', label: '賞等',
      render: (i: any) => (
        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
          {i.prize || '—'}
        </span>
      ),
    },
    { key: 'date', label: '回收時間', className: 'font-mono text-xs text-neutral-500 whitespace-nowrap', render: (i: any) => i.date },
  ]

  const pointColumns: Column<any>[] = [
    {
      key: 'created_at',
      label: '時間',
      className: 'text-neutral-500 whitespace-nowrap font-mono text-xs',
      render: (row: any) => fmtLedgerTime(row.created_at),
    },
    {
      key: 'type',
      label: '類型',
      render: (row: any) => {
        const meta = POINT_TYPE_MAP[row.type] ?? { label: row.type, cls: 'bg-neutral-100 text-neutral-600' }
        return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${meta.cls}`}>{meta.label}</span>
      },
    },
    {
      key: 'reason',
      label: '說明',
      className: 'text-neutral-700 max-w-[280px] truncate',
      render: (row: any) => row.reason || '—',
    },
    {
      key: 'created_by',
      label: '操作者',
      className: 'text-neutral-500 text-xs whitespace-nowrap',
      // 玩家自己的行為（簽到、抽獎）沒有操作者，用「系統」比空白清楚
      render: (row: any) => row.created_by || '系統',
    },
    {
      key: 'delta',
      label: '異動 (P)',
      className: 'text-right font-mono whitespace-nowrap',
      render: (row: any) => (
        <span className={row.delta > 0 ? 'text-green-600' : 'text-rose-600'}>
          {row.delta > 0 ? '+' : ''}{Number(row.delta).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'balance_after',
      label: '累計餘額',
      className: 'text-right font-mono text-neutral-700',
      render: (row: any) => Number(row.balance_after).toLocaleString(),
    },
  ]

  /*
   * 代幣帳本。骨架與 pointColumns 一致（見上方註解），多「面額／贈送」兩欄。
   *
   * 原本每一格的 render 裡都複製了一份完整的 typeMap／statusMap／meta ——
   * 七格就七份，而且每一格只用得到其中一兩個值。改動時只會改到其中一份，
   * 剩下六份繼續用舊的。抽成外面的常數。
   */
  const TOKEN_TYPE_MAP: Record<string, { label: string; cls: string }> = {
    recharge:  { label: '儲值',     cls: 'bg-green-50 text-green-700' },
    draw:      { label: '抽獎',     cls: 'bg-rose-50 text-rose-700' },
    dismantle: { label: '回收退',   cls: 'bg-amber-50 text-amber-700' },
    manual:    { label: '行銷贈點', cls: 'bg-orange-50 text-orange-600' },
    marketing: { label: '行銷贈點', cls: 'bg-orange-50 text-orange-600' },
    test:      { label: '測試',     cls: 'bg-neutral-100 text-neutral-500' },
  }
  const TOKEN_STATUS_MAP: Record<string, string> = { pending: '處理中', failed: '失敗', success: '' }
  // 未成功的儲值：VIEW 給的 delta 是 0，金額欄一律顯示破折號而不是 0，免得被當成真的入帳
  const isTokenPending = (row: any) => row.type === 'recharge' && row.status !== 'success'

  const idColumns: Column<any>[] = [
    {
      key: 'created_at',
      label: '時間',
      className: 'text-neutral-500 whitespace-nowrap font-mono text-xs',
      render: (row: any) => fmtLedgerTime(row.created_at),
    },
    {
      key: 'type',
      label: '類型',
      render: (row: any) => {
        const meta = TOKEN_TYPE_MAP[row.type] ?? { label: row.type, cls: 'bg-neutral-100 text-neutral-600' }
        return (
          <>
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${meta.cls}`}>{meta.label}</span>
            {isTokenPending(row) && (
              <Badge variant="warning" className="ml-1">{TOKEN_STATUS_MAP[row.status] ?? row.status}</Badge>
            )}
            {row.status === 'failed' && <Badge variant="danger" className="ml-1">失敗</Badge>}
          </>
        )
      },
    },
    {
      key: 'description',
      label: '說明',
      className: 'text-neutral-700 max-w-[280px] truncate',
      render: (row: any) => row.description || '—',
    },
    {
      key: 'recharge_amount',
      label: '面額 / 贈送',
      className: 'text-right font-mono text-neutral-600 text-xs whitespace-nowrap',
      /*
       * 儲值才有的兩個數字，合成一欄（老闆 2026-08-31）。
       *
       * 拆成「面額」「贈送」兩欄的話，PROD 5,434 列裡只有 53 列填得出東西
       * （贈送 > 0 的只有 52 列），其餘 99% 都是兩個破折號 —— 兩欄全空還把
       * 「說明」擠窄了。合成一欄資訊不減：面額是玩家付的本金、贈送是平台加碼，
       * 相加就是「異動」。財務要分開看是因為前者是收入、後者是行銷成本。
       *
       * 未完成的儲值一律破折號：VIEW 對非 success 的 delta 給 0，但面額與贈送
       * 照樣有值 —— 玩家一毛都沒進帳，畫面卻擺著兩個看起來像入帳的金額。
       * 跟「異動」「累計餘額」同一個判斷，三欄口徑一致。
       */
      render: (row: any) => {
        if (row.recharge_amount == null || isTokenPending(row)) return '—'
        const base = Number(row.recharge_amount).toLocaleString()
        const bonus = Number(row.recharge_bonus ?? 0)
        return bonus > 0
          ? <>{base}<span className="text-green-600"> +{bonus.toLocaleString()}</span></>
          : base
      },
    },
    {
      key: 'created_by',
      label: '操作者',
      className: 'text-neutral-500 text-xs whitespace-nowrap',
      // 只有手動調整（token_adjustments）有操作者，其餘是玩家自己的行為（migration 655）
      render: (row: any) => row.created_by || '系統',
    },
    {
      key: 'delta',
      label: '異動 (G)',
      className: 'text-right font-mono whitespace-nowrap',
      render: (row: any) =>
        isTokenPending(row)
          ? '—'
          : <span className={row.delta > 0 ? 'text-green-600' : 'text-rose-600'}>
              {row.delta > 0 ? '+' : ''}{Number(row.delta).toLocaleString()}
            </span>,
    },
    {
      key: 'balance_after',
      label: '累計餘額',
      className: 'text-right font-mono text-neutral-700',
      render: (row: any) =>
        !isTokenPending(row) && row.balance_after !== null ? Number(row.balance_after).toLocaleString() : '—',
    },
  ]

  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  // 凍結已併進停用（migration 660），只剩兩態
  const [userStatus, setUserStatus] = useState<'active' | 'inactive'>('active')
  const [newPassword, setNewPassword] = useState('')
  const [activeTab, setActiveTab] = useState<SectionKey>('basic')
  const [userDismantled, setUserDismantled] = useState<any[]>([])

  /* 四張純前端表格（倉庫／配送／抽獎／回收）的「已顯示幾筆」。切換分頁時歸零 */
  const [listCount, setListCount] = useState(30)
  const moreRef = useLoadMoreOnScroll(
    useCallback(() => setListCount(c => c + 30), []),
    true,
  )


  /*
   * 基本設置的表單。管理員代會員編輯（客服現場處理用）。
   *
   * 跟 `user` 分開存：`user` 是伺服器回來的那一份，表單是使用者正在改的那一份。
   * 直接改 `user` 的話就沒有東西可以比對「有沒有未儲存的變更」，
   * 存檔失敗時也回不去原本的值。
   */
  const EMPTY_FORM = {
    name: '', email: '', phone: '', gender: '', birthday: '',
    recipient_name: '', recipient_phone: '', address: '', avatar_url: '',
  }
  const [form, setForm] = useState(EMPTY_FORM)
  const [formBase, setFormBase] = useState(EMPTY_FORM)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const setField = (k: keyof typeof EMPTY_FORM, v: string) => setForm(p => ({ ...p, [k]: v }))
  const profileDirty = JSON.stringify(form) !== JSON.stringify(formBase) || !!avatarFile


  // Data states
  const [userOrders, setUserOrders] = useState<Order[]>([])
  const [userDraws, setUserDraws] = useState<Draw[]>([])
  /* draw_records 的原始列。統計要 tokens_spent／points_used，那兩欄在 mapping 時被丟掉了 */
  const [rawDraws, setRawDraws] = useState<any[]>([])

  const [userRecharges, setUserRecharges] = useState<Recharge[]>([])
  const [userWarehouse, setUserWarehouse] = useState<WarehouseItem[]>([])

  // 代幣帳本
  const [ledger, setLedger] = useState<any[]>([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerPages, setLedgerPages] = useState(1)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerLoaded, setLedgerLoaded] = useState(false)
  // 對帳健檢：false ＝ users.tokens 跟帳本加總對不上（有人繞過 token_adjustments 直改）
  const [ledgerReconciled, setLedgerReconciled] = useState(true)

  /*
   * 積分帳本（point_ledger，migration 646~651）
   *
   * 跟代幣那份分開存：兩者的分頁位置、載入狀態互不相干，共用一組 state 會
   * 在切換頁籤時互相蓋掉頁碼。`reconciled` 是健檢 —— false 代表有人繞過
   * grant_points/spend_points 直接改了 users.points，要立刻查。
   */
  const [pLedger, setPLedger] = useState<any[]>([])
  const [pLedgerTotal, setPLedgerTotal] = useState(0)
  const [pLedgerPage, setPLedgerPage] = useState(1)
  const [pLedgerPages, setPLedgerPages] = useState(1)
  const [pLedgerLoading, setPLedgerLoading] = useState(false)
  const [pLedgerLoaded, setPLedgerLoaded] = useState(false)
  const [pLedgerReconciled, setPLedgerReconciled] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users/${userId}`, { method: 'GET' })
        if (!res.ok) {
          const err = await res.json().catch(() => null)
          console.error('Error fetching user:', err?.error || res.statusText)
          setLoading(false)
          return
        }
        const payload = (await res.json()) as { user: any; orders: any[]; draws: any[]; recharges: any[]; referrer?: { id: string; name: string; invite_code: string | null } | null }
        const userData = payload.user
        const ordersData = payload.orders
        const drawsData = payload.draws
        const rechargesData = payload.recharges

        const mappedUser: User = {
          id: userData.id,
          userId: userData.user_id ? `M${String(1000000 + userData.user_id)}` : userData.id,
          inviteCode: userData.invite_code,
          name: userData.name,
          email: userData.email,
          phone: userData.phone || '',
          tokens: userData.tokens,
          registerDate: formatDateTime(userData.created_at),
          lastLoginDate: userData.last_login_at ? formatDateTime(userData.last_login_at) : '',
          status: userData.status,
          totalOrders: userData.orders?.[0]?.count || 0,
          totalSpent: userData.total_spent,
          totalDraws: userData.total_draws,
          address: userData.address,
          recipientName: userData.recipient_name,
          recipientPhone: userData.recipient_phone,
          isSuspicious:   userData.is_suspicious ?? false,
          suspiciousReason: userData.suspicious_reason ?? null,
          disabledReason: userData.disabled_reason ?? null,
          disabledBy:     userData.disabled_by ?? null,
          gender:         userData.gender ?? null,
          birthday:       userData.birthday ?? null,
          lineBound:      Boolean(userData.line_user_id),
          points:         typeof userData.points === 'number' ? userData.points : 0,
          totalReferrals: typeof userData.total_referrals === 'number' ? userData.total_referrals : 0,
          lineUserId:     userData.line_user_id ?? null,
          referrer:       payload.referrer
            ? { id: payload.referrer.id, name: payload.referrer.name, inviteCode: payload.referrer.invite_code }
            : null,
        }
        setUser(mappedUser)
        const nextForm = {
          name: userData.name ?? '',
          email: userData.email ?? '',
          phone: userData.phone ?? '',
          gender: userData.gender ?? '',
          // <input type="date"> 只吃 YYYY-MM-DD，帶時間的字串它會整個不顯示
          birthday: (userData.birthday ?? '').slice(0, 10),
          recipient_name: userData.recipient_name ?? '',
          recipient_phone: userData.recipient_phone ?? '',
          address: userData.address ?? '',
          avatar_url: userData.avatar_url ?? '',
        }
        setForm(nextForm)
        setFormBase(nextForm)
        setUserStatus(mappedUser.status)

        let mappedOrders: Order[] = []
        if (ordersData) {
          mappedOrders = ordersData.map((o: any) => ({
            id: o.id,
            orderId: o.order_number,
            status: o.status,
            submittedAt: formatDateTime(o.submitted_at || o.created_at),
            date: o.created_at,
            items: o.items || []
          }))
          setUserOrders(mappedOrders)
        }

        let mappedDraws: Draw[] = []
        if (drawsData) {
          mappedDraws = drawsData.map((d: any) => {
            let drawIdStr = d.id.toString()
            try {
              const dateStr = d.created_at
              const dateObj = new Date(dateStr)
              const year = dateObj.getFullYear().toString().slice(-2)
              const month = String(dateObj.getMonth() + 1).padStart(2, '0')
              const day = String(dateObj.getDate()).padStart(2, '0')
              const suffix = ((d.id * 1367) % 10000).toString().padStart(4, '0')
              drawIdStr = `TX${year}${month}${day}${suffix}`
            } catch (e) {
              console.error('Error formatting draw ID:', e)
            }
            
            return {
              id: d.id,
              drawId: drawIdStr,
              date: formatDateTime(d.created_at),
              product: d.product?.name || 'Unknown Product',
              prize: d.prize_level,
              amount: d.product?.price || 0,
              ticketNumber: d.ticket_number,
              product_id: d.product_id
            }
          })
          setUserDraws(mappedDraws)
          setRawDraws(drawsData)

          // 回收紀錄
          const dismantled = drawsData
            .filter((d: any) => d.status === 'dismantled')
            .map((d: any) => ({
              id: d.id,
              product: d.product?.name || '—',
              prize: d.prize_level || '—',
              date: formatDateTime(d.created_at),
            }))
          setUserDismantled(dismantled)
        }

        if (rechargesData) {
          const statusMap: Record<string, string> = {
            'success': '成功',
            'pending': '處理中',
            'failed': '失敗'
          }
          
          const mappedRecharges: Recharge[] = rechargesData.map((r: any) => ({
            id: r.id,
            orderId: r.order_number,
            amount: r.amount,
            bonus: r.bonus || 0,
            totalTokens: r.amount + (r.bonus || 0), // Assuming 1:1 + bonus
            tokenDenomination: r.amount,
            status: statusMap[r.status] || r.status,
            time: formatDateTime(r.created_at)
          }))
          setUserRecharges(mappedRecharges)
        }

        // 5. Calculate Warehouse (Unclaimed Prizes)
        // Count submitted items
        const submittedItemsCount = new Map<string, number>()
        mappedOrders.forEach(order => {
          if (['submitted', 'processing', 'picked_up', 'shipping', 'delivered'].includes(order.status)) {
            order.items.forEach(item => {
              // Key: product_id-prize_level. Fallback to name if id missing (legacy compat)
              const key = item.product_id ? `${item.product_id}-${item.prize?.level ?? ''}` : `${item.product?.name ?? ''}-${item.prize?.level ?? ''}`
              submittedItemsCount.set(key, (submittedItemsCount.get(key) || 0) + 1)
            })
          }
        })

        // Count owned items from draws
        const drawItemsMap = new Map<string, { product: string, prize: string, drawDate: string, count: number }>()
        
        // We use the raw drawsData for accurate timestamp comparison if needed, but mappedDraws is fine
        // Using mappedDraws which has formatted date string, might need raw date for sort. 
        // Let's use the index or just formatted date string for now.
        
        mappedDraws.forEach(draw => {
          const key = draw.product_id ? `${draw.product_id}-${draw.prize}` : `${draw.product}-${draw.prize}`
          
          if (!drawItemsMap.has(key)) {
            drawItemsMap.set(key, {
              product: draw.product,
              prize: draw.prize,
              drawDate: draw.date,
              count: 0
            })
          }
          const item = drawItemsMap.get(key)!
          item.count += 1
          // Keep the latest date
          if (draw.date > item.drawDate) { 
             // Note: String comparison of formatted dates might be wrong if format is not ISO.
             // formatDateTime usually returns readable string. 
             // Ideally we should use raw timestamp. But for display it's ok.
             item.drawDate = draw.date 
          }
        })

        const warehouseItems: WarehouseItem[] = []
        let idCounter = 1
        
        drawItemsMap.forEach((item, key) => {
          const submitted = submittedItemsCount.get(key) || 0
          const remaining = item.count - submitted
          
          if (remaining > 0) {
            warehouseItems.push({
              id: idCounter++,
              product: item.product,
              prize: item.prize,
              drawDate: item.drawDate,
              count: remaining
            })
          }
        })

        // Sort by date desc (approximation with formatted string)
        warehouseItems.sort((a, b) => b.drawDate.localeCompare(a.drawDate))
        setUserWarehouse(warehouseItems)

      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchData()
    }
  }, [userId])

  const fetchPointLedger = async (page = 1) => {
    if (!userId) return
    setPLedgerLoading(true)
    try {
      const res = await fetch(`/api/admin/point-ledger?userId=${userId}&page=${page}`)
      const data = await res.json()
      // 同 fetchLedger：第一頁覆蓋、之後累加
      setPLedger(prev => page === 1 ? (data.ledger ?? []) : [...prev, ...(data.ledger ?? [])])
      setPLedgerTotal(data.total ?? 0)
      setPLedgerPage(page)
      setPLedgerPages(data.pages ?? 1)
      setPLedgerReconciled(data.reconciled !== false)
    } finally {
      setPLedgerLoading(false)
      setPLedgerLoaded(true)
    }
  }

  /*
   * 代幣帳本：改成「捲到底再載一頁」（老闆 2026-08-31）。
   *
   * 這支是伺服器分頁（一頁 50 筆），所以載更多是**把下一頁接在後面**，
   * 不是像那四張純前端表格那樣多切幾筆。第一頁時覆蓋、之後累加 ——
   * 覆蓋是給重新整理用的，累加是給捲動用的。
   */
  const fetchLedger = async (page = 1) => {
    if (!userId) return
    setLedgerLoading(true)
    try {
      const res = await fetch(`/api/admin/token-ledger?userId=${userId}&page=${page}`)
      const data = await res.json()
      setLedger(prev => page === 1 ? (data.ledger ?? []) : [...prev, ...(data.ledger ?? [])])
      setLedgerTotal(data.total ?? 0)
      setLedgerPage(page)
      setLedgerPages(data.pages ?? 1)
      setLedgerReconciled(data.reconciled !== false)
    } finally {
      setLedgerLoading(false)
      setLedgerLoaded(true)
    }
  }

  /*
   * 統計小卡的五個數字。
   *
   * 「總消費」把積分換算成代幣一起算（4 積分 = 1 G，跟 play_gacha／play_ichiban
   * 裡的匯率一致）—— 同一個玩家有時用 G、有時用積分抽，分開列會讓兩邊都偏低，
   * 看不出他實際花了多少。用 rawDraws（draw_records 原始列）而不是 userDraws，
   * 後者為了畫表格已經把 tokens_spent／points_used 丟掉了。
   *
   * 「已完成配送」只算 delivered：submitted／shipping 還沒到玩家手上，
   * cancelled 更不能算。
   */
  const stats = useMemo(() => {
    const spentG = rawDraws.reduce((sum, d) => {
      const pts = Number(d.points_used ?? 0)
      if (pts > 0) return sum + pts / 4
      // G 幣抽獎：tokens_spent 是實收（促銷／折價券後），舊資料沒有才退回商品定價
      const g = d.tokens_spent != null ? Number(d.tokens_spent) : Number(d.product?.price ?? 0)
      return sum + g
    }, 0)
    const delivered = userOrders.filter(o => o.status === 'delivered').length
    return [
      { label: '總消費', value: Math.round(spentG).toLocaleString(), sub: 'G（積分已換算）' },
      { label: '抽獎次數', value: userDraws.length.toLocaleString(), sub: '次' },
      { label: '已完成配送', value: delivered.toLocaleString(), sub: `共 ${userOrders.length} 單` },
      { label: '積分餘額', value: Number(user?.points ?? 0).toLocaleString(), sub: 'P' },
      { label: '代幣餘額', value: Number(user?.tokens ?? 0).toLocaleString(), sub: 'G' },
    ]
  }, [rawDraws, userOrders, userDraws.length, user?.points, user?.tokens])

  /** 代會員儲存基本資料。頭像有換就先上傳，拿到網址再一起送 */
  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      let avatarUrl = form.avatar_url
      if (avatarFile) {
        const ext = (avatarFile.name.split('.').pop() || '').trim() || 'jpg'
        const fd = new FormData()
        fd.append('file', avatarFile)
        fd.append('bucket', 'avatars')
        fd.append('path', `u-${userId}-${Date.now()}.${ext}`)
        const up = await fetch('/api/admin/upload', { method: 'POST', body: fd })
        const upJson = await up.json().catch(() => ({}))
        if (!up.ok) throw new Error(upJson?.error || '頭像上傳失敗')
        avatarUrl = String(upJson?.publicUrl || '')
      }

      const body: Record<string, unknown> = { ...form, avatar_url: avatarUrl }
      // email 是鎖住的（改 users.email 不會同步 Auth 的登入信箱），別送回去覆蓋
      delete body.email

      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '儲存失敗')

      const next = { ...form, avatar_url: avatarUrl }
      setForm(next)
      setFormBase(next)
      setAvatarFile(null)
      setAvatarPreview('')
      setUser(prev => prev ? { ...prev, name: next.name, phone: next.phone } : prev)
      toast('已儲存')
    } catch (e: any) {
      toast(e?.message ?? '儲存失敗', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  /*
   * 直接覆寫密碼。走的是 Supabase Auth 的 admin API（後端），當場生效。
   * 存完把輸入框清掉 —— 密碼留在畫面上，下一個經過的人就看到了。
   */
  const savePassword = async () => {
    const pwd = newPassword.trim()
    if (pwd.length < 6) return toast('密碼至少 6 碼', 'error')
    setSavingPassword(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || '重置密碼失敗')
      toast(`密碼已更新：${pwd}（記得交給玩家，離開這頁就看不到了）`)
      setNewPassword('')
    } catch (e: any) {
      toast(e?.message ?? '重置密碼失敗', 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  /*
   * 兩支帳本各自的哨兵。它們是伺服器分頁，所以「載更多」＝抓下一頁。
   * `enabled` 帶上「還沒載入中」與「還有下一頁」—— 少了它，觀察器會在
   * 同一次可見期間連續觸發，一路把所有頁都抓下來。
   */
  const tokenMoreRef = useLoadMoreOnScroll(
    useCallback(() => { if (!ledgerLoading) fetchLedger(ledgerPage + 1) }, [ledgerLoading, ledgerPage]),
    activeTab === 'recharges' && ledgerPage < ledgerPages && !ledgerLoading,
  )
  const pointMoreRef = useLoadMoreOnScroll(
    useCallback(() => { if (!pLedgerLoading) fetchPointLedger(pLedgerPage + 1) }, [pLedgerLoading, pLedgerPage]),
    activeTab === 'points' && pLedgerPage < pLedgerPages && !pLedgerLoading,
  )

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    // 換分頁就把「已顯示幾筆」歸零，不然切過去會直接是上一張表捲到的位置
    setListCount(30)
    if (tab === 'recharges' && !ledgerLoaded) fetchLedger(1)
    if (tab === 'points' && !pLedgerLoaded) fetchPointLedger(1)
  }

  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('複製失敗:', err)
    }
  }

  const getStatusText = (status: string) => {
    if (status === 'active') return '啟用'
    return '停用'
  }

  // 更新使用者狀態
  /*
   * 停用／凍結／標記可疑／手動補幣搬到「會員管理」列表的「⋯」選單了
   * （老闆 2026-08-31）。客服的動線是「在列表找到人 → 處理」，
   * 為了停用一個帳號先點進詳情頁太繞。這裡不留第二個入口。
   */

  if (loading) {
    return (
      <AdminLayout
        pageTitle="會員詳情"
        breadcrumbs={[
        { label: '會員管理', href: '/users' },
        { label: '詳情', href: undefined }
      ]}
      >
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
      </AdminLayout>
    )
  }

  if (!user) {
    return (
      <AdminLayout 
        pageTitle="會員詳情"
        breadcrumbs={[
          { label: '會員管理', href: '/users' },
          { label: '詳情', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <p className="text-neutral-500">找不到此會員</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout 
      pageTitle="會員詳情"
      breadcrumbs={[
          { label: '會員管理', href: '/users' },
          {
            /* 停用徽章掛在名字前面：一進頁面就知道這個帳號現在進不來 */
            label: (
              <span className="inline-flex items-center gap-1.5">
                {userStatus === 'inactive' && (
                  <Tooltip content={`操作者：${user.disabledBy || '未知'}\n說明：${user.disabledReason || '（未填寫）'}`}>
                    <span className="inline-flex shrink-0 cursor-help rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                      停用
                    </span>
                  </Tooltip>
                )}
                {user.isSuspicious && (
                  <Tooltip content={`說明：${user.suspiciousReason || '（未填寫）'}`}>
                    <span className="inline-flex shrink-0 cursor-help rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                      可疑
                    </span>
                  </Tooltip>
                )}
                <span>{user.name} ({user.inviteCode || '-'})</span>
              </span>
            ),
            href: undefined,
          }
      ]}
    >
      <div className="space-y-6">
      {/*
        統計小卡。放在左右分的上面（老闆 2026-08-31 附圖）——
        這五個數字是「先看一眼就知道這個會員是誰」的東西，
        埋進分頁裡就要點兩下才看得到。

        「總消費」把積分換算成代幣一起算（4 積分 = 1 G，跟 play_gacha 的匯率一致）：
        同一個玩家有時用 G、有時用積分抽，分開列會讓兩邊都看起來偏低，
        判斷不出他實際花了多少。
      */}
      <StatsRow stats={stats} />

      <PageCard>
        <SettingsShell nav={<SettingsNav sections={SECTIONS} value={activeTab} onChange={handleTabChange} />}>

          {activeTab === 'basic' && (
            <>
              <SectionHead
                title="基本設置"
                info="管理員可以代會員修改這裡的資料（客服現場處理用）。灰底不能點的欄位是系統產生或牽動登入的東西：電子郵件是登入帳號，users.email 改了不會同步 Supabase Auth 的登入信箱，玩家會用舊信箱登入卻看到新信箱 —— 真要換信箱得連 Auth 一起改，請開工單。"
              />

              {/* 左表單右頭像，版型照參考圖 */}
              <div className="flex flex-col gap-8 lg:flex-row">
                <div className="min-w-0 flex-1 space-y-4 lg:max-w-xl">
                  <Field label="暱稱">
                    <Input value={form.name} onChange={e => setField('name', e.target.value)} />
                  </Field>

                  <Field label="電子郵件">
                    <Input value={realEmail(form.email) ?? ''} placeholder={isSyntheticEmail(form.email) ? 'LINE 快速帳號，尚未綁定信箱' : ''} disabled />
                  </Field>

                  <Field label="電話">
                    <Input value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="09xxxxxxxx" />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="性別">
                      <SelectField value={form.gender} onChange={e => setField('gender', e.target.value)}>
                        <option value="">未設定</option>
                        <option value="male">男</option>
                        <option value="female">女</option>
                        <option value="other">其他</option>
                      </SelectField>
                    </Field>
                    <Field label="生日">
                      <Input type="date" value={form.birthday} onChange={e => setField('birthday', e.target.value)} />
                    </Field>
                  </div>

                  <div className="pt-2 text-sm font-medium text-neutral-900">收件資訊</div>
                  <Field label="收件人">
                    <Input value={form.recipient_name} onChange={e => setField('recipient_name', e.target.value)} />
                  </Field>
                  <Field label="收件人電話">
                    <Input value={form.recipient_phone} onChange={e => setField('recipient_phone', e.target.value)} />
                  </Field>
                  {/* 郵遞區號由地址即時推導、只掛在標籤上 —— 輸入值保持乾淨，儲存不會夾帶 */}
                  <Field label={`收件地址${zipFromAddress(form.address) ? `（${zipFromAddress(form.address)}）` : ''}`}>
                    <Input value={form.address} onChange={e => setField('address', e.target.value)} />
                  </Field>

                  <div className="pt-2 text-sm font-medium text-neutral-900">系統資料</div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="邀請碼"><Input value={user.inviteCode ?? '—'} disabled /></Field>
                    <Field label="成功邀請數"><Input value={String(user.totalReferrals ?? 0)} disabled /></Field>
                  </div>
                  <Field label="用戶 ID"><Input value={user.userId} disabled className="font-mono text-xs" /></Field>
                  <Field label="註冊時間"><Input value={user.registerDate || '—'} disabled /></Field>

                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={saveProfile} isLoading={savingProfile}>更新基本資料</Button>
                    {profileDirty && <span className="text-xs text-amber-600">有未儲存的變更</span>}
                  </div>
                </div>

                {/* 頭像 */}
                <div className="lg:w-64 lg:shrink-0">
                  <div className="mb-3 text-sm text-neutral-500">頭像</div>
                  <div className="flex flex-col items-center gap-4">
                    {/*
                      用原生 <img> 不用 next/image：頭像可能是 blob:（剛選好還沒上傳的預覽）
                      或前台網域的靜態檔，next/image 兩種都要另外設定 remotePatterns。

                      ⚠️ 這裡**不要**寫 `eslint-disable-next-line @next/next/no-img-element`
                      —— 後台的 ESLint 沒有載 Next.js plugin，停用一條不存在的規則會直接
                      讓 production build 失敗（「Definition for rule ... was not found」），
                      而本機 `tsc --noEmit` 完全看不出來。
                    */}
                    <img
                      src={avatarPreview || avatarSrc(form.avatar_url)}
                      alt=""
                      className="h-36 w-36 rounded-full border border-neutral-100 object-cover"
                    />
                    <label className="cursor-pointer rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50">
                      更換頭像
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          setAvatarFile(f)
                          setAvatarPreview(URL.createObjectURL(f))
                        }}
                      />
                    </label>
                    {avatarFile && (
                      <p className="text-center text-xs text-amber-600">
                        已選好圖，按「更新基本資料」才會存上去
                      </p>
                    )}
                  </div>
                </div>
              </div>

            </>
          )}

          {activeTab === 'security' && (
            <>
              <SectionHead
                title="安全設置"
                info="密碼是直接覆寫、當場生效，不是寄重設信 —— 客服在線上處理時玩家往往收不到信，寄信等於把問題丟回去。至少 6 碼；存好之後記得把密碼交給玩家，離開這一頁就看不到了。改完會發一則站內通知，並寫進稽核軌跡。"
              />

              <div className="max-w-xl space-y-4">
                <Field label="設定新密碼">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="輸入新密碼"
                      className="flex-1"
                    />
                    <Button variant="secondary" onClick={() => {
                      // 用 base64url 而不是自己拼字元表：不會出現看起來一樣的 0/O、1/l
                      const pwd = Array.from(crypto.getRandomValues(new Uint8Array(9)))
                        .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12)
                      setNewPassword(pwd)
                    }}>產生隨機密碼</Button>
                  </div>
                </Field>

                <div className="flex items-center gap-3">
                  <Button onClick={savePassword} isLoading={savingPassword} disabled={newPassword.trim().length < 6}>
                    儲存新密碼
                  </Button>
                  {newPassword && newPassword.trim().length < 6 && (
                    <span className="text-xs text-red-600">密碼至少 6 碼</span>
                  )}
                </div>
              </div>

              <div className="mt-8 border-t border-neutral-100 pt-6">
                <div className="divide-y divide-neutral-100">
                  {/*
                    凍結／標記的「原因」就顯示在這裡（老闆 2026-08-31 問的）。
                    後台輸入的那句話寫進 users.disabled_reason / suspicious_reason，
                    但先前沒有任何畫面在顯示 —— 填了等於丟進黑洞。
                    列表的標記也把它掛在 title 上，滑過去看得到。
                  */}
                  <SettingsRow
                    title="帳號狀態"
                    desc={userStatus === 'inactive'
                      ? `停用原因：${user.disabledReason || '（未填寫）'}`
                      : '停用／啟用的操作在會員管理列表的「⋯」選單。'}
                    state={userStatus === 'active' ? 'on' : 'off'}
                  >
                    <Badge status={userStatus} size="lg">{getStatusText(userStatus)}</Badge>
                  </SettingsRow>
                  <SettingsRow
                    title="可疑標記"
                    desc={user.isSuspicious
                      ? `標記原因：${user.suspiciousReason || '（未填寫）'}`
                      : '純內部註記，不影響玩家使用，也不會擋任何操作 —— 要擋人請用停用或凍結。'}
                    state={user.isSuspicious ? 'maintenance' : 'on'}
                  >
                    <Badge status={user.isSuspicious ? 'inactive' : 'active'} size="lg">
                      {user.isSuspicious ? '已標記' : '正常'}
                    </Badge>
                  </SettingsRow>
                  <SettingsRow
                    title="最後登入"
                    desc="登入來源 IP 記在 user_event_logs，會員列表有「最後IP」欄；風控的多帳號同 IP 偵測用的是同一份資料。"
                  >
                    <span className="font-mono text-sm text-neutral-700">{user.lastLoginDate || '—'}</span>
                  </SettingsRow>
                </div>
              </div>
            </>
          )}

          {activeTab === 'binding' && (
            <>
              <SectionHead title="帳號綁定" info="玩家的登入方式與聯絡管道。這裡只顯示狀態，不提供後台代為綁定 —— 綁定必須由本人完成，否則等於後台可以把任何一顆 LINE 掛到任何帳號上。" />
              <div className="divide-y divide-neutral-100">
                {/* LINE 快速帳號的 users.email 是系統合成的內部代號，不算綁定（lib/syntheticEmail） */}
                <SettingsRow
                  title="電子郵件"
                  desc={realEmail(user.email) || (isSyntheticEmail(user.email) ? 'LINE 快速帳號，玩家還沒在前台「設定」綁信箱' : '未設定')}
                  state={realEmail(user.email) ? 'on' : 'off'}
                >
                  <Badge status={realEmail(user.email) ? 'active' : 'inactive'} size="lg">{realEmail(user.email) ? '已綁定' : '未綁定'}</Badge>
                </SettingsRow>
                <SettingsRow title="手機號碼" desc={user.phone || '未設定'} state={user.phone ? 'on' : 'off'}>
                  <Badge status={user.phone ? 'active' : 'inactive'} size="lg">{user.phone ? '已綁定' : '未綁定'}</Badge>
                </SettingsRow>
                <SettingsRow
                  title="LINE"
                  desc={user.lineBound
                    ? '已綁定。綁定禮 300 積分是「一顆 LINE 一生一次」（apply_line_perks），換帳號重綁不會再送'
                    : '尚未綁定 LINE'}
                  state={user.lineBound ? 'on' : 'off'}
                >
                  <Badge status={user.lineBound ? 'active' : 'inactive'} size="lg">
                    {user.lineBound ? '已綁定' : '未綁定'}
                  </Badge>
                </SettingsRow>
                {/*
                  這一列講的是「註冊時有沒有填別人的邀請碼」，所以標題用「邀請碼」
                  而不是「推薦人」（老闆 2026-08-31）—— 其餘四列都是「綁了什麼」，
                  只有這一列講「誰」，掃過去會斷掉。徽章也跟著統一成已綁定／未綁定。
                */}
                <SettingsRow
                  title="邀請碼"
                  desc={user.referrer
                    ? `使用 ${user.referrer.inviteCode ?? '-'}（${user.referrer.name}）`
                    : '註冊時未填邀請碼'}
                  state={user.referrer ? 'on' : 'off'}
                >
                  <div className="flex items-center gap-2">
                    <Badge status={user.referrer ? 'active' : 'inactive'} size="lg">
                      {user.referrer ? '已綁定' : '未綁定'}
                    </Badge>
                    {user.referrer && (
                      <Link href={`/users/${user.referrer.id}`} className="text-sm text-primary hover:underline">查看</Link>
                    )}
                  </div>
                </SettingsRow>
              </div>
            </>
          )}

          {activeTab !== 'basic' && activeTab !== 'security' && activeTab !== 'binding' && (
            <>
              <SectionHead
                title={SECTIONS.find(s => s.key === activeTab)?.label ?? ''}
                info={SECTION_INFO[activeTab] ?? ''}
                right={
                  /* 倉庫、回收、兩個帳本沒有對應的匯出路由，只有訂單與抽獎有 */
                  (activeTab === 'orders' || activeTab === 'draws') ? (
                    <a
                      href={`/api/admin/export${activeTab === 'orders' ? '/orders' : '/draws'}?userId=${userId}`}
                      className="text-sm text-primary hover:underline"
                    >匯出 CSV</a>
                  ) : undefined
                }
              />
            {activeTab === 'orders' && (
              <>
                <DataTable
                  data={userOrders.slice(0, listCount)}
                  columns={orderColumns}
                  keyField="id"
                  emptyMessage="暫無配送紀錄"
                />
                {userOrders.length > listCount && <LoadMoreSentinel innerRef={moreRef} />}
              </>
            )}

            {activeTab === 'draws' && (
              <>
                <DataTable
                  data={userDraws.slice(0, listCount)}
                  columns={drawColumns}
                  keyField="id"
                  emptyMessage="暫無抽獎紀錄"
                />
                {userDraws.length > listCount && <LoadMoreSentinel innerRef={moreRef} />}
              </>
            )}

            {/* 儲值記錄＋代幣異動明細（帳本表格） */}
            {activeTab === 'recharges' && (
              <div>
                {/* 跟積分那邊同一套健檢 —— 對不上代表有人繞過 token_adjustments 直改 users.tokens */}
                {!ledgerReconciled && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    ⚠️ 帳本加總與代幣餘額不符 —— 可能有人繞過 <code>token_adjustments</code> 直接改了 <code>users.tokens</code>，請查稽核軌跡。
                  </div>
                )}
                {ledgerLoading ? (
                  <CardSkeleton rows={3} />
                ) : ledger.length === 0 ? (
                  <div className="text-center py-12">
                    <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-neutral-500">無代幣異動紀錄</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <DataTable
data={ledger}
columns={idColumns}
keyField="id"
rowClassName={(row: any) => `border-b border-neutral-100 hover:bg-neutral-50 ${row.type === 'recharge' && row.status !== 'success' ? 'opacity-60' : ''}`}
/>
                    </div>
                    <div className="pt-3 text-sm text-neutral-500">
                      已顯示 {ledger.length.toLocaleString()} / {ledgerTotal.toLocaleString()} 筆
                    </div>
                    {ledgerPage < ledgerPages && (
                      <LoadMoreSentinel innerRef={tokenMoreRef} loading={ledgerLoading} />
                    )}
                  </>
                )}
              </div>
            )}

            {/* 積分流動（point_ledger，migration 646~651） */}
            {activeTab === 'points' && (
              <div>
                {/*
                  對帳健檢。false ＝ users.points 跟帳本加總對不起來，代表有人繞過
                  grant_points/spend_points 直接改了欄位。積分能折抵代幣、代幣是
                  真錢買的，所以這是要立刻查的事 —— 放在畫面上，不要等有人想到跑 SQL。
                */}
                {!pLedgerReconciled && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    ⚠️ 帳本加總與積分餘額不符 —— 可能有人繞過帳本直接改了 <code>users.points</code>，請查稽核軌跡。
                  </div>
                )}
                {pLedgerLoading ? (
                  <CardSkeleton rows={3} />
                ) : pLedger.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-neutral-500">無積分異動紀錄</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <DataTable data={pLedger} columns={pointColumns} keyField="id" />
                    </div>
                    <div className="flex items-center justify-between pt-3 text-sm text-neutral-500">
                      <span>共 {pLedgerTotal.toLocaleString()} 筆</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => fetchPointLedger(pLedgerPage - 1)} disabled={pLedgerPage <= 1} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-neutral-50">上一頁</button>
                        <span>{pLedgerPage} / {pLedgerPages}</span>
                        <button onClick={() => fetchPointLedger(pLedgerPage + 1)} disabled={pLedgerPage >= pLedgerPages} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-neutral-50">下一頁</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 回收紀錄 */}
            {activeTab === 'dismantled' && (
              <>
                <DataTable
                  data={userDismantled.slice(0, listCount)}
                  columns={dismantledColumns}
                  keyField="id"
                  emptyMessage="暫無回收紀錄"
                />
                {userDismantled.length > listCount && <LoadMoreSentinel innerRef={moreRef} />}
              </>
            )}

            {activeTab === 'warehouse' && (
              <>
                <DataTable
                  data={userWarehouse.slice(0, listCount)}
                  columns={warehouseColumns}
                  keyField="id"
                  emptyMessage="暫無未提交配送的商品"
                />
                {userWarehouse.length > listCount && <LoadMoreSentinel innerRef={moreRef} />}
              </>
            )}

            </>
          )}

        </SettingsShell>
      </PageCard>

      </div>


    </AdminLayout>
  )
}
