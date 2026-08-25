'use client'

import type { ReactNode } from 'react'

/**
 * 一句話的提示塊
 *
 * 取代散在各頁的手刻提示。原本 orders 頁那三個用的是
 * `bg-gradient-to-r from-primary to-indigo-50` —— 從飽和藍漸層到近白色，
 * 深色文字壓在左半邊根本看不清，還配了一個 40px 的大圖示方塊與「注意」標題，
 * 為一句話佔掉整整四行（老闆 2026-08-25 回報「好醜」）。
 *
 * 這裡的原則：**提示不該比它要說的事還顯眼**。單行、小圖示、
 * 顏色只用來分辨嚴重度，不用來搶注意力。
 */

export type NoteTone = 'info' | 'warn' | 'danger'

const TONE: Record<NoteTone, { box: string; icon: string }> = {
  info:   { box: 'border-neutral-200 bg-neutral-50 text-neutral-600', icon: 'text-neutral-400' },
  warn:   { box: 'border-amber-200 bg-amber-50 text-amber-800',       icon: 'text-amber-500' },
  danger: { box: 'border-red-200 bg-red-50 text-red-700',             icon: 'text-red-500' },
}

const ICON: Record<NoteTone, ReactNode> = {
  // info 用「i」、warn/danger 用驚嘆號 —— 形狀本身就分得出輕重，不必只靠顏色
  info: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  warn: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
  ),
  danger: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
  ),
}

export default function Note({ tone = 'info', children, className = '' }: {
  tone?: NoteTone
  children: ReactNode
  className?: string
}) {
  const t = TONE[tone]
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-relaxed ${t.box} ${className}`}>
      <svg className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {ICON[tone]}
      </svg>
      <span className="min-w-0">{children}</span>
    </div>
  )
}
