'use client'

import type { ReactNode } from 'react'

/**
 * 標題旁的說明圓點
 *
 * AdminLayout 的頁面標題本來就有這個樣式（PAGE_INFO），但寫死在裡面沒法重用。
 * 抽出來讓各頁的區塊標題也能用。
 *
 * 為什麼要有這東西：說明文字直接鋪在畫面上，一頁十幾行小灰字會把
 * 真正要操作的東西淹掉。收進 hover 提示裡，需要的人看得到，
 * 不需要的人看到的是乾淨的介面。
 */
export default function InfoDot({
  children,
  align = 'left',
  width = 'w-80',
}: {
  children: ReactNode
  /** 提示框對齊哪一邊。靠近畫面右緣的標題要用 right，否則提示會被切掉 */
  align?: 'left' | 'right'
  width?: string
}) {
  return (
    <span className="relative group inline-flex items-center align-middle">
      <span className="w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center cursor-help select-none leading-none">
        !
      </span>
      <span
        className={[
          'pointer-events-none absolute top-full mt-2 z-50 rounded-lg bg-neutral-900 px-3 py-2.5',
          'text-xs font-normal leading-relaxed text-white shadow-xl whitespace-normal text-left',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          align === 'right' ? 'right-0' : 'left-0',
          width,
        ].join(' ')}
      >
        {children}
      </span>
    </span>
  )
}
