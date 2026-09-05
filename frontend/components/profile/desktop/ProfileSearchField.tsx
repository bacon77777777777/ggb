'use client'

import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 會員中心桌機各分頁共用的搜尋框（老闆 2026-09-05：搜尋樣式要統一）。
 * 造型照倉庫那顆：40 高、圓筒、灰底、左邊放大鏡；有字時右邊出現叉叉清空。
 * 倉庫本身因為有「點了展開篩選面板」的行為維持自己那份，這裡只給其他分頁用。
 */
export default function ProfileSearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('flex h-10 min-w-0 items-center gap-2 rounded-full bg-neutral-100 px-3', className)}>
      <Search className="h-4 w-4 shrink-0 text-neutral-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[14px] font-bold text-neutral-900 placeholder:font-medium placeholder:text-neutral-400 focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          aria-label="清除搜尋"
          onClick={() => onChange('')}
          className="-mr-1 shrink-0 p-1 text-neutral-400 hover:text-neutral-700"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
