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
  /** 標題右側，通常放藍色驚嘆號說明 */
  extra?: React.ReactNode
}) {
  const displayData = Array(limit).fill(null).map((_, index) => (
    data[index] || { name: '-', value: '-', change: undefined }
  ))

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {extra}
      </div>
      <div className="space-y-1">
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
