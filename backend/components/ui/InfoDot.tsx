'use client'

import type { ReactNode } from 'react'
import Tooltip from './Tooltip'

/**
 * 標題旁的說明圓點
 *
 * AdminLayout 的頁面標題本來就有這個樣式（PAGE_INFO），但寫死在裡面沒法重用。
 * 抽出來讓各頁的區塊標題也能用。
 *
 * 為什麼要有這東西：說明文字直接鋪在畫面上，一頁十幾行小灰字會把
 * 真正要操作的東西淹掉。收進提示裡，需要的人看得到，
 * 不需要的人看到的是乾淨的介面。
 *
 * 定位與浮層的邏輯全部交給 `Tooltip`（portal + fixed）——
 * 兩份實作遲早會走鐘，而且那些坑（被 overflow 裁掉、被同層元素蓋住、
 * 捲動時飄走）修一次就好。
 */
export default function InfoDot({
  children,
  align = 'left',
  width = 320,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  width?: number
}) {
  return (
    <Tooltip content={children} align={align} width={width}>
      <span className="flex h-4 w-4 cursor-help select-none items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-white">
        !
      </span>
    </Tooltip>
  )
}
