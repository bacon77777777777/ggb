'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** CSS height 值，預設 '60vh' */
  height?: string
  className?: string
  zIndex?: string
}

/**
 * 從底部滑入的抽屜元件（portal 掛到 body，帶遮罩）
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  height = '60vh',
  className,
  zIndex = 'z-[80]',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  // 鎖定 body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // ESC 關閉
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  return createPortal(
    <>
      {/* 遮罩 */}
      <div
        className={cn(
          'fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300',
          zIndex,
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* 抽屜 */}
      <div
        ref={sheetRef}
        className={cn(
          'fixed bottom-0 left-0 right-0',
          'bg-white dark:bg-neutral-900 rounded-t-2xl shadow-modal',
          'flex flex-col transition-transform duration-300 ease-out',
          zIndex,
          isOpen ? 'translate-y-0' : 'translate-y-full',
          className
        )}
        style={{ height }}
      >
        {/* 把手 */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        </div>

        {/* 標題列 */}
        {title && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
            <span className="text-[15px] font-black text-neutral-900 dark:text-white">{title}</span>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* 內容 */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}
