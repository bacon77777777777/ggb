'use client'

import { formatDateTime } from '@/utils/dateFormat'

interface ShippingProgressProps {
  status: 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled'
  submittedAt: string
  shippedAt?: string | null
  showTitle?: boolean
  /**
   * 嵌在別的容器裡（例如彈窗）時拿掉卡片外框與內距。
   * ⚠️ 只影響外框，**不縮字也不縮圓點** —— 空間夠的時候把字縮小只會變得難讀。
   */
  compact?: boolean
}

interface ProgressStep {
  status: string
  location: string
  time: string
  completed: boolean
  /** 目前停在這一步。原本沒有這個狀態，導致「配送中」跟「已送達」長得一模一樣 */
  current: boolean
  cancelled: boolean
}

/**
 * 訂單狀態的先後順序。進度條就是照這個陣列畫的，
 * 判斷「走到哪」只要比索引，不用一個個 if 疊。
 */
/**
 * 前後台文案對照（老闆 2026-08-26 問「前台有同步嗎」）
 *
 * status 值全站同一組，只有說法不同：後台給廠商與管理員看，講精準；
 * 前台給玩家看，講白話（`frontend/lib/orderStatus.ts`）。改任一邊都要對過另一邊。
 *
 *   submitted  後台 已提交     ／ 前台 已申請
 *   processing 後台 處理中     ／ 前台 揀貨中
 *   picked_up  後台 物流已收取 ／ 前台 已出貨
 *   shipping   後台 配送中     ／ 前台 配送中
 *   delivered  後台 已送達     ／ 前台 已送達
 *   cancelled  後台 已取消     ／ 前台 已取消
 */
const FLOW = [
  { key: 'submitted',  label: '已提交',     location: '訂單已建立' },
  { key: 'processing', label: '處理中',     location: '倉庫處理中' },
  { key: 'picked_up',  label: '物流已收取', location: '物流中心' },
  { key: 'shipping',   label: '配送中',     location: '配送站' },
  { key: 'delivered',  label: '已送達',     location: '已簽收' },
] as const

/**
 * 產生配送進度。
 *
 * 改版前每一步各寫一段 if，而「配送中」那段寫的是 `completed: status === 'delivered'`
 * —— 訂單明明就在配送中，那一格卻是灰的（未完成），底下又印了時間，
 * 變成「灰圈配時間戳」的怪樣子（老闆 2026-08-26 回報）。
 *
 * 時間只放**我們真的有記錄的**兩個：submitted_at 與 shipped_at。
 * 處理中／物流已收取沒有獨立時戳，原本拿 submittedAt 頂替 ——
 * 那會讓人以為那幾步都發生在下單的同一秒。寧可留白。
 */
const getShippingProgress = (
  status: string,
  submittedAt: string,
  shippedAt: string | null = null,
): ProgressStep[] => {
  if (status === 'cancelled') {
    return [
      { status: '已提交', location: '訂單已建立', time: submittedAt, completed: true,  current: false, cancelled: false },
      { status: '已取消', location: '訂單回收中', time: '',          completed: true,  current: false, cancelled: true  },
    ]
  }

  const idx = FLOW.findIndex(f => f.key === status)
  // 認不得的狀態就當作剛提交，至少不會整條變灰
  const at = idx < 0 ? 0 : idx
  const isFinal = status === 'delivered'

  return FLOW.map((f, i) => {
    const done = i < at || (i === at && isFinal)
    const timeOf =
      f.key === 'submitted' ? submittedAt
      : (f.key === 'shipping' || f.key === 'delivered') ? (shippedAt ?? '')
      : ''   // 處理中／物流已收取：沒有獨立時戳，不假裝有
    return {
      status: f.label,
      location: f.location,
      time: i <= at ? timeOf : '',
      completed: done,
      current: i === at && !isFinal,
      cancelled: false,
    }
  })
}

export default function ShippingProgress({ status, submittedAt, shippedAt, showTitle = true, compact = false }: ShippingProgressProps) {
  const progressSteps = getShippingProgress(status, submittedAt, shippedAt || null)
  const isCancelled = status === 'cancelled'
  
  return (
    <div className={compact ? '' : 'bg-white rounded-lg shadow-sm p-6'}>
      {showTitle && <h2 className="mb-6 text-lg font-bold text-neutral-900">配送進度</h2>}
      
      {/* 已取消狀態使用緊湊居中佈局 */}
      {isCancelled ? (
        <div className="relative max-w-xs mx-auto">
          {/* 紅色進度線 - 只在兩個圓形之間 */}
          <div 
            className="absolute top-5 h-0.5 bg-red-500 rounded-full"
            style={{ left: 'calc(25% + 20px)', right: 'calc(25% + 20px)' }}
          ></div>
          {/* 進度條 */}
          <div className="flex items-start justify-between relative">
            {/* 已提交節點 */}
            <div className="flex flex-col items-center relative z-10 w-1/2">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center mt-3">
                <p className="font-medium text-sm text-neutral-900">已提交</p>
                <p className="text-xs text-neutral-400 mt-0.5">{progressSteps[0]?.time}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{progressSteps[0]?.location}</p>
              </div>
            </div>
            
            {/* 已取消節點 */}
            <div className="flex flex-col items-center relative z-10 w-1/2">
              <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="text-center mt-3">
                <p className="font-medium text-sm text-neutral-900">已取消</p>
                <p className="text-xs text-neutral-400 mt-0.5">{formatDateTime(progressSteps[0]?.time ?? '')}</p>
                <p className="text-xs text-neutral-400 mt-0.5">訂單回收中</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // 正常狀態使用完整進度條佈局
        <div className="relative">
          {/* 背景連接線 */}
          <div className="absolute top-5 left-[10%] right-[10%] h-0.5 rounded-full bg-neutral-200"></div>
          {/* 已完成的進度線 */}
          {(() => {
            // 線要拉到「目前這一步」——只算 completed 的話，線會停在進行中的前一格
            const reached = progressSteps.findIndex(p => p.current)
            const lastDone = progressSteps.map(p => p.completed).lastIndexOf(true)
            const at = reached >= 0 ? reached : Math.max(lastDone, 0)
            const totalSteps = progressSteps.length
            const progressWidth = at > 0 ? (at / (totalSteps - 1)) * 80 : 0
            return (
              <div 
                className="absolute top-5 left-[10%] h-0.5 rounded-full bg-green-500 transition-all duration-500"
                style={{ width: `${progressWidth}%` }}
              ></div>
            )
          })()}
          {/* 進度條 */}
          <div className="flex items-start justify-between relative">
            {progressSteps.map((progress, idx) => (
              <div key={idx} className="flex flex-col items-center relative z-10" style={{ width: `${100 / progressSteps.length}%` }}>
                {/* 進度點 */}
                <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  progress.completed
                    ? 'bg-green-500'
                    : progress.current
                      // 進行中：實心底色＋外圈光暈，一眼看得出「現在停在這」
                      ? 'bg-primary ring-4 ring-primary/20'
                      : 'bg-neutral-300'
                }`}>
                  {progress.completed ? (
                    <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : progress.current ? (
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                    </span>
                  ) : (
                    <div className="h-3 w-3 rounded-full bg-white" />
                  )}
                </div>
                {/* 文字內容 */}
                <div className="w-full text-center mt-3">
                  <p className={`text-sm ${
                    progress.current
                      ? 'font-semibold text-primary'
                      : progress.completed
                        ? 'font-medium text-neutral-900'
                        : 'font-medium text-neutral-400'
                  }`}>
                    {progress.status}
                  </p>
                  {progress.time && (
                    <p className="mt-0.5 text-xs text-neutral-400">{formatDateTime(progress.time)}</p>
                  )}
                  {/* 地點在彈窗裡跟「配送方式」欄重複，細版就不再講一次 */}
                  {!compact && (
                    <p className="mt-0.5 text-xs text-neutral-400">{progress.location}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
