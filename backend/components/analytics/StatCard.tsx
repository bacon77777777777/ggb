'use client'

import React, { useState } from 'react'

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
  /** 標題右側，通常放 <InfoIcon> */
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
      <div className="flex items-center gap-1.5 min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
        style={{ color: 'rgba(0,0,0,0.88)' }}>
        {title}
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
 * 藍色驚嘆號說明（分析頁那顆）
 *
 * `whitespace-pre-line` 而不是 `normal` —— 說明常常是多行（用 \n 分段），
 * normal 會把換行當空白吃掉、擠成一整段。分析頁與結算頁都踩過這個。
 */
export function InfoIcon({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative flex-shrink-0" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold cursor-help select-none leading-none">!</div>
      {show && (
        <div className="absolute left-0 top-5 w-56 bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl z-50 leading-relaxed whitespace-pre-line pointer-events-none font-normal">
          {text}
        </div>
      )}
    </div>
  )
}
