'use client'

import { useState, useRef, useEffect } from 'react'

interface YearMonthPickerProps {
  year: string
  month: string
  onYearChange: (value: string) => void
  onMonthChange: (value: string) => void
  placeholder?: string
  label?: string
}

export default function YearMonthPicker({ 
  year, 
  month, 
  onYearChange, 
  onMonthChange, 
  placeholder = '選擇年月',
  label 
}: YearMonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom')
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  // 計算下拉面板展開方向
  const calculatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const dropdownHeight = 320
      const spaceBelow = windowHeight - rect.bottom
      const spaceAbove = rect.top
      
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setDropdownPosition('top')
      } else {
        setDropdownPosition('bottom')
      }
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen) {
      calculatePosition()
    }
  }, [isOpen])

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i)
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'))

  const getDisplayText = () => {
    if (year && month) return (
      <>
        <span className="font-amount">{parseInt(year).toLocaleString()}</span>年
        <span className="font-amount">{parseInt(month).toLocaleString()}</span>月
      </>
    )
    return placeholder
  }

  const handleSelectMonth = (selectedMonth: string) => {
    onMonthChange(selectedMonth)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      {label && <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-white border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 hover:border-neutral-300 shadow-sm cursor-pointer flex items-center justify-between min-h-[42px]"
      >
        <span className={year && month ? 'text-neutral-900' : 'text-neutral-400'}>
          {getDisplayText()}
        </span>
        <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {isOpen && (
        <div className={`absolute left-0 right-0 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 p-4 ${
          dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
        }`}>
          {/* 年份選擇 */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-neutral-500 mb-2">年份</label>
            <div className="grid grid-cols-7 gap-1.5 max-h-32 overflow-y-auto">
              {years.map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => onYearChange(y.toString())}
                  className={`px-1 py-1.5 text-sm rounded-lg transition-colors ${
                    year === y.toString()
                      ? 'bg-primary text-white font-medium'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  <span className="font-amount">{y.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 月份選擇 */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-2">月份</label>
            <div className="grid grid-cols-6 gap-2">
              {months.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelectMonth(m)}
                  className={`px-2 py-2 text-sm rounded-lg transition-colors ${
                    month === m
                      ? 'bg-primary text-white font-medium'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  <span className="font-amount">{parseInt(m).toLocaleString()}</span>月
                </button>
              ))}
            </div>
          </div>

          {/* 快捷選項 */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                onYearChange(now.getFullYear().toString())
                onMonthChange((now.getMonth() + 1).toString().padStart(2, '0'))
                setIsOpen(false)
              }}
              className="px-3 py-1.5 text-xs text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              本月
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2
                const nextYear = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear()
                onYearChange(nextYear.toString())
                onMonthChange(nextMonth.toString().padStart(2, '0'))
                setIsOpen(false)
              }}
              className="px-3 py-1.5 text-xs text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              下個月
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
