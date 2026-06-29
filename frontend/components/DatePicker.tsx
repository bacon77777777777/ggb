'use client'

import { useState, useRef, useEffect } from 'react'

interface DatePickerProps {
  value: string  // 格式：'YYYY-MM-DD'
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  min?: string  // 最小日期（格式：'YYYY-MM-DD'）
}

export default function DatePicker({ 
  value, 
  onChange, 
  placeholder = '選擇日期',
  label,
  min
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom')
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [year, month] = value.split('-').map(Number)
      return { year, month }
    }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  // 計算下拉面板展開方向
  const calculatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const dropdownHeight = 350 // 預估下拉面板高度
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

  // 當 value 變化時更新 viewDate
  useEffect(() => {
    if (value) {
      const [year, month] = value.split('-').map(Number)
      setViewDate({ year, month })
    }
  }, [value])

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate()
  }

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month - 1, 1).getDay()
  }

  const generateCalendar = () => {
    const { year, month } = viewDate
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth)
    
    const days: Array<{ day: number; month: number; year: number; isCurrentMonth: boolean }> = []
    
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, month: prevMonth, year: prevYear, isCurrentMonth: false })
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, month, year, isCurrentMonth: true })
    }
    
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, month: nextMonth, year: nextYear, isCurrentMonth: false })
    }
    
    return days
  }

  const handlePrevMonth = () => {
    setViewDate(prev => prev.month === 1 ? { year: prev.year - 1, month: 12 } : { ...prev, month: prev.month - 1 })
  }

  const handleNextMonth = () => {
    setViewDate(prev => prev.month === 12 ? { year: prev.year + 1, month: 1 } : { ...prev, month: prev.month + 1 })
  }

  const handleSelectDate = (day: number, month: number, year: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange(dateStr)
    setIsOpen(false)
  }

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    return `${year}/${month}/${day}`
  }

  const isSelected = (day: number, month: number, year: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr === value
  }

  const isToday = (day: number, month: number, year: number) => {
    const today = new Date()
    return today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
  }

  const isDisabled = (day: number, month: number, year: number) => {
    if (!min) return false
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr < min
  }

  const handleSetToday = () => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    onChange(dateStr)
    setIsOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const calendar = generateCalendar()

  return (
    <div className="relative" ref={containerRef}>
      {label && <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm cursor-pointer hover:border-neutral-300 transition-colors flex items-center justify-between min-h-[42px]"
      >
        <span className={value ? 'text-neutral-900' : 'text-neutral-400'}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <button 
              onClick={handleClear} 
              className="p-0.5 hover:bg-neutral-100 rounded transition-colors"
              type="button"
            >
              <svg className="w-4 h-4 text-neutral-400 hover:text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className={`absolute left-0 w-80 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 p-3 ${
          dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
        }`}>
          {/* 月份導航 */}
          <div className="flex items-center justify-between mb-3">
            <button 
              onClick={handlePrevMonth} 
              className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
              type="button"
            >
              <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-base font-bold text-neutral-900">
              {viewDate.year}年 {viewDate.month}月
            </span>
            <button 
              onClick={handleNextMonth} 
              className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
              type="button"
            >
              <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 星期幾 */}
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((day, index) => (
              <div key={day} className={`text-center text-xs font-medium py-1 ${
                index === 0 || index === 6 ? 'text-red-500' : 'text-neutral-500'
              }`}>
                {day}
              </div>
            ))}
          </div>

          {/* 日期網格 */}
          <div className="grid grid-cols-7 gap-1">
            {calendar.map((date, index) => {
              const selected = isSelected(date.day, date.month, date.year)
              const today = isToday(date.day, date.month, date.year)
              const disabled = isDisabled(date.day, date.month, date.year)
              
              return (
                <button
                  key={index}
                  onClick={() => !disabled && handleSelectDate(date.day, date.month, date.year)}
                  disabled={disabled}
                  className={`
                    h-9 rounded-lg text-sm flex items-center justify-center transition-all
                    ${!date.isCurrentMonth ? 'text-neutral-300' : 'text-neutral-700'}
                    ${selected 
                      ? 'bg-primary text-white font-bold shadow-md shadow-primary/20 hover:bg-primary-dark' 
                      : disabled
                        ? 'cursor-not-allowed opacity-50 bg-neutral-50'
                        : 'hover:bg-neutral-100'
                    }
                    ${today && !selected ? 'border border-primary text-primary font-bold' : ''}
                  `}
                  type="button"
                >
                  {date.day}
                </button>
              )
            })}
          </div>

          {/* 底部按鈕 */}
          <div className="mt-3 pt-3 border-t border-neutral-100 flex justify-end">
            <button
              onClick={handleSetToday}
              className="text-xs font-medium text-primary hover:text-primary-dark px-3 py-1.5 rounded hover:bg-primary/5 transition-colors"
              type="button"
            >
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
