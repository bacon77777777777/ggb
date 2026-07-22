'use client'

import { cn } from '@/lib/utils'

interface ActionBarProps {
  children: React.ReactNode
  className?: string
  /** 在哪個 breakpoint 隱藏（lg:hidden / md:hidden）；不傳則全螢幕顯示 */
  hideOn?: 'md' | 'lg'
  zIndex?: string
}

/** 固定在底部的操作欄（含 safe-area-inset-bottom 補白）*/
export function ActionBar({ children, className, hideOn, zIndex = 'z-50' }: ActionBarProps) {
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0',
        'bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl',
        'border-t border-neutral-100 dark:border-neutral-800',
        'px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
        'flex items-center shadow-modal',
        zIndex,
        hideOn === 'lg' && 'lg:hidden',
        hideOn === 'md' && 'md:hidden',
        className
      )}
    >
      {children}
    </div>
  )
}
