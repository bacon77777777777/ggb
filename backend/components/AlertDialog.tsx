'use client'

import { useEffect } from 'react'

interface AlertDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
  buttonText?: string
}

export default function AlertDialog({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  buttonText = '確定'
}: AlertDialogProps) {
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

  // ESC 鍵關閉
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const typeStyles = {
    success: {
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      borderColor: 'border-green-200'
    },
    error: {
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      borderColor: 'border-red-200'
    },
    info: {
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      borderColor: 'border-blue-200'
    },
    warning: {
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      borderColor: 'border-yellow-200'
    }
  }

  const styles = typeStyles[type]

  const icon = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {type === 'success' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      ) : type === 'error' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      ) : type === 'warning' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      )}
    </svg>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* 彈窗內容 */}
      <div className={`relative bg-white rounded-xl shadow-2xl max-w-md w-full border-2 ${styles.borderColor} transform transition-all`}>
        {/* 內容區域 */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* 圖標 */}
            <div className={`flex-shrink-0 w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center ${styles.iconColor}`}>
              {icon}
            </div>
            
            {/* 文字內容 */}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* 底部按鈕 */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex items-center justify-end">
          <button
            onClick={onClose}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
              type === 'success' ? 'bg-green-600 hover:bg-green-700 text-white' :
              type === 'error' ? 'bg-red-600 hover:bg-red-700 text-white' :
              type === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' :
              'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  )
}
