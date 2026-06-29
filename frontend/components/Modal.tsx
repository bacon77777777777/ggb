'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export default function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
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

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center" 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        margin: 0,
        padding: 0
      }}
    >
      {/* 背景遮罩 */}
      <div
        className="absolute bg-black/50 backdrop-blur-sm transition-opacity"
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0
        }}
        onClick={onClose}
      />
      
      {/* 彈窗內容 */}
      <div className={`relative bg-white rounded-lg shadow-xl ${sizeClasses[size]} w-full mx-4 max-h-[90vh] flex flex-col z-[10000]`}>
        {/* 標題欄 */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 內容區域 */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>

        {/* 底部按鈕 */}
        {footer && (
          <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  if (!isOpen) return null

  // 使用 Portal 渲染到 document.body，確保不受父元素影響
  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body)
  }
  return null
}
