'use client'

import React, { useLayoutEffect, useRef, useState } from 'react'

/**
 * 分析頁系列的 KPI 卡（AntD Pro 風格）
 *
 * 從 `app/analytics-overview/page.tsx` 抽出來的 —— 那頁四張卡的外框、字級、
 * 間距、分隔線都是一字不差的四份 copy，新頁面要長一樣就得再抄第五份。
 * 老闆指定廠商分析要沿用這套 UI，所以先抽成元件再共用。
 *
 * 版位固定成三段，換頁面也不會跑掉：
 *   title  ── 56px 高的標題列
 *   value  ── 38px 高的大數字
 *   mid    ── 46px 高，放同比標籤或迷你圖（兩者擇一，高度一樣所以卡片等高）
 *   footer ── 上方一條淡分隔線，「標籤 + 值」一行
 */
export function StatCard({ title, titleExtra, value, loading, skeletonWidth = 'w-24', mid, footerLabel, footerValue }: {
  title: string
  /** 標題列最右側，通常放 <InfoIcon> */
  titleExtra?: React.ReactNode
  value: React.ReactNode
  loading?: boolean
  /** 載入中骨架的寬度，讓不同量級的數字看起來不會忽大忽小 */
  skeletonWidth?: string
  /** 中段：同比標籤或迷你圖 */
  mid?: React.ReactNode
  footerLabel: string
  footerValue: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-[#f0f0f0] overflow-hidden bg-white">
      <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
        style={{ color: 'rgba(0,0,0,0.88)' }}>
        <span className="flex-1 min-w-0 truncate">{title}</span>
        {titleExtra}
      </div>
      <div style={{ padding: '20px 24px 8px' }}>
        <div className="relative w-full">
          <div className="h-[38px] text-[30px] leading-[38px] overflow-hidden whitespace-nowrap"
            style={{ color: 'rgba(0,0,0,0.88)' }}>
            {loading ? <span className={`inline-block ${skeletonWidth} h-7 bg-neutral-100 rounded animate-pulse`} /> : value}
          </div>
        </div>
        <div className="relative w-full mb-3" style={{ height: 46 }}>
          <div className="absolute bottom-0 left-0 w-full h-full flex items-end gap-4">
            {mid}
          </div>
        </div>
        <div className="pt-[9px]" style={{ marginTop: 8, borderTop: '1px solid rgba(5,5,5,0.06)' }}>
          <span className="text-sm" style={{ color: 'rgba(0,0,0,0.65)' }}>{footerLabel}</span>
          <span className="text-sm ml-2" style={{ color: 'rgba(0,0,0,0.88)' }}>
            {loading ? '—' : footerValue}
          </span>
        </div>
      </div>
    </div>
  )
}

/** 同比標籤：紅漲綠跌（台股習慣，不要照國際慣例反過來） */
export function GrowthTag({ value, label, style }: { value: number; label?: string; style?: React.CSSProperties }) {
  const up = value >= 0
  return (
    <div className="inline-block text-sm leading-[22px]" style={style}>
      <span style={{ color: 'rgba(0,0,0,0.65)' }}>
        {label}
        <span style={{ marginLeft: 8, color: 'rgba(0,0,0,0.88)' }}>{Math.abs(value)}%</span>
      </span>
      <span style={{ marginLeft: 4, color: up ? '#f5222d' : '#52c41a' }}>
        {up ? '▲' : '▼'}
      </span>
    </div>
  )
}

export default StatCard

/**
 * 藍色驚嘆號說明
 *
 * 泡泡用 `position: fixed` 而不是 `absolute` —— 卡片外框有 `overflow-hidden`
 * （為了讓標題列的底線貼齊圓角），`absolute` 的泡泡會被裁掉一半。
 * fixed 是相對視窗定位，跳出所有 overflow 容器。
 *
 * 位置自己算：預設開在圖示下方、右緣對齊圖示；
 * 右邊空間不夠就往左貼、下面空間不夠就翻到上方。
 * 都是拿實際量到的視窗尺寸判斷，不是寫死方向。
 */
export function InfoIcon({ text, width = 240 }: { text: string; width?: number }) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })

  /*
   * 先把泡泡畫出來（畫在畫面外），量到真實高度之後再定位。
   *
   * 一開始是用「行數 × 行高」估高度，結果估不準 —— 中文會折行，
   * 三行的文字實際可能佔五行，於是靠近底部的那顆就翻不上去、被切在視窗外。
   * 量實際的最保險。
   */
  useLayoutEffect(() => {
    if (!show) return
    const a = anchorRef.current, t = tipRef.current
    if (!a || !t) return
    const ar = a.getBoundingClientRect()
    const th = t.offsetHeight
    const M = 8                                   // 離視窗邊緣至少留 8px

    let left = ar.right - width                   // 預設右緣對齊圖示
    if (left + width > window.innerWidth - M) left = window.innerWidth - width - M
    if (left < M) left = M

    const below = ar.bottom + 6
    const top = below + th > window.innerHeight - M
      ? Math.max(M, ar.top - th - 6)              // 下面放不下就翻到上方
      : below

    setPos({ top, left })
  }, [show, text, width])

  return (
    <div
      ref={anchorRef}
      className="relative flex-shrink-0"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold cursor-help select-none leading-none">!</div>
      {show && (
        <div
          ref={tipRef}
          className="bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed whitespace-pre-line pointer-events-none font-normal"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 9999 }}
        >
          {text}
        </div>
      )}
    </div>
  )
}
