'use client'

import React from 'react'

/**
 * TOP N 排行卡（儀表板那顆）
 *
 * 原本寫在 `app/dashboard/page.tsx` 裡面，廠商分析也要用同一個長相，
 * 所以抽出來共用，不要再抄第二份。
 *
 * 不足 limit 的名次補「-」佔位 —— 卡片高度固定，三張並排時不會一高一矮。
 */
export function RankingList({ title, data, limit = 10, extra }: {
  title: string
  data: Array<{ name: string; value: number | string; change?: number }>
  limit?: number
  /** 標題列最右側，通常放藍色驚嘆號說明 */
  extra?: React.ReactNode
}) {
  const displayData = Array(limit).fill(null).map((_, index) => (
    data[index] || { name: '-', value: '-', change: undefined }
  ))

  return (
    <div className="rounded-lg border border-[#f0f0f0] bg-white">
      {/* 標題列與「銷售走勢」等區塊同一套：56px 高、px-6、16px 半粗、底下一條分線。
          外框刻意不加 overflow-hidden —— 加了會把 InfoIcon 的說明泡泡裁掉 */}
      <div className="flex items-center min-h-[56px] px-6 font-semibold text-base border-b border-[#f0f0f0]"
        style={{ color: 'rgba(0,0,0,0.88)' }}>
        <span className="flex-1 min-w-0 truncate">{title}</span>
        {extra}
      </div>
      <div className="space-y-1 px-4 py-3">
        {displayData.map((item, index) => (
          <div key={index} className="flex items-center justify-between py-1.5 border-b border-neutral-100 last:border-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                index < 3 ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-600'
              }`}>
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium line-clamp-2 ${item.name === '-' ? 'text-neutral-400' : 'text-neutral-900'}`}>{item.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-10 flex-shrink-0">
              {item.change !== undefined && (
                <div className={`text-xs text-right w-16 ${item.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {item.change >= 0 ? '+' : ''}{item.change}%
                </div>
              )}
              <div className="text-right w-20">
                <p className={`text-sm font-semibold ${item.value === '-' ? 'text-neutral-400' : 'text-neutral-900'}`}>
                  {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RankingList
