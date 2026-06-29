'use client'

import { useState, useRef, useEffect } from 'react'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  placeholder?: string
  label?: string
}

export default function DateRangePicker({ 
  startDate, 
  endDate, 
  onStartDateChange, 
  onEndDateChange, 
  placeholder = '選擇日期範圍',
  label 
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectingStart, setSelectingStart] = useState(true)
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom')
  const [viewDate, setViewDate] = useState(() => {
    if (startDate) {
      const [year, month] = startDate.split('-').map(Number)
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
      const dropdownHeight = 420 // 預估下拉面板高度
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
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen) {
      calculatePosition()
    }
  }, [isOpen])

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
    
    if (selectingStart) {
      onStartDateChange(dateStr)
      // 如果結束日期在開始日期之前，清除結束日期
      if (endDate && dateStr > endDate) {
        onEndDateChange('')
      }
      setSelectingStart(false)
    } else {
      // 如果選擇的結束日期在開始日期之前，則將其設為開始日期
      if (startDate && dateStr < startDate) {
        onStartDateChange(dateStr)
        onEndDateChange(startDate)
      } else {
        onEndDateChange(dateStr)
      }
      setSelectingStart(true)
    }
  }

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    return `${year}/${month}/${day}`
  }

  const getDisplayText = () => {
    if (!startDate && !endDate) return placeholder
    if (startDate && endDate) return `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`
    if (startDate) return `${formatDisplayDate(startDate)} - ?`
    return placeholder
  }

  const isSelected = (day: number, month: number, year: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr === startDate || dateStr === endDate
  }

  const isInRange = (day: number, month: number, year: number) => {
    if (!startDate || !endDate) return false
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr > startDate && dateStr < endDate
  }

  const isToday = (day: number, month: number, year: number) => {
    const today = new Date()
    return today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
  }

  const isStartDate = (day: number, month: number, year: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr === startDate
  }

  const isEndDate = (day: number, month: number, year: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr === endDate
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onStartDateChange('')
    onEndDateChange('')
    setSelectingStart(true)
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const calendar = generateCalendar()

  return (
    <div className="relative" ref={containerRef}>
      {label && <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm cursor-pointer hover:border-neutral-300 transition-colors flex items-center justify-between"
      >
        <span className={startDate || endDate ? 'text-neutral-900' : 'text-neutral-400'}>
          {getDisplayText()}
        </span>
        <div className="flex items-center gap-1">
          {(startDate || endDate) && (
            <button onClick={handleClear} className="p-0.5 hover:bg-neutral-100 rounded transition-colors">
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
          {/* 選擇提示 */}
          <div className="flex items-center justify-center gap-4 mb-3 pb-3 border-b border-neutral-100">
            <button
              onClick={() => setSelectingStart(true)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectingStart 
                  ? 'bg-primary text-white' 
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              開始：{startDate ? formatDisplayDate(startDate) : '未選'}
            </button>
            <span className="text-neutral-400">→</span>
            <button
              onClick={() => setSelectingStart(false)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                !selectingStart 
                  ? 'bg-primary text-white' 
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              結束：{endDate ? formatDisplayDate(endDate) : '未選'}
            </button>
          </div>

          {/* 月份導航 */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={handlePrevMonth} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-base font-semibold text-neutral-900">
              {viewDate.year}年{viewDate.month}月
            </span>
            <button onClick={handleNextMonth} className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 星期標題 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekDays.map(day => (
              <div key={day} className="text-center text-xs font-medium text-neutral-500 py-1">{day}</div>
            ))}
          </div>

          {/* 日期格子 */}
          <div className="grid grid-cols-7 gap-0.5">
            {calendar.map((item, idx) => {
              const selected = isSelected(item.day, item.month, item.year)
              const inRange = isInRange(item.day, item.month, item.year)
              const start = isStartDate(item.day, item.month, item.year)
              const end = isEndDate(item.day, item.month, item.year)
              const today = isToday(item.day, item.month, item.year)
              
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectDate(item.day, item.month, item.year)}
                  className={`
                    w-9 h-8 text-sm transition-colors flex items-center justify-center relative
                    ${item.isCurrentMonth ? 'text-neutral-900' : 'text-neutral-400'}
                    ${selected ? 'bg-primary text-white font-medium z-10' : ''}
                    ${start ? 'rounded-l-lg' : ''}
                    ${end ? 'rounded-r-lg' : ''}
                    ${start && end ? 'rounded-lg' : ''}
                    ${inRange ? 'bg-primary/10' : ''}
                    ${!selected && !inRange && today ? 'font-medium text-primary' : ''}
                    ${!selected && !inRange ? 'hover:bg-neutral-100 rounded-lg' : ''}
                  `}
                >
                  {item.day}
                </button>
              )
            })}
          </div>

          {/* 快捷選項 */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-neutral-100">
            <button
              onClick={() => {
                const today = new Date()
                const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                onStartDateChange(dateStr)
                onEndDateChange(dateStr)
              }}
              className="px-2 py-1 text-xs text-neutral-600 bg-neutral-100 rounded hover:bg-neutral-200 transition-colors"
            >
              今天
            </button>
            <button
              onClick={() => {
                const today = new Date()
                const start = new Date(today)
                start.setDate(today.getDate() - 7)
                onStartDateChange(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`)
                onEndDateChange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
              }}
              className="px-2 py-1 text-xs text-neutral-600 bg-neutral-100 rounded hover:bg-neutral-200 transition-colors"
            >
              近7天
            </button>
            <button
              onClick={() => {
                const today = new Date()
                const start = new Date(today)
                start.setDate(today.getDate() - 30)
                onStartDateChange(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`)
                onEndDateChange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
              }}
              className="px-2 py-1 text-xs text-neutral-600 bg-neutral-100 rounded hover:bg-neutral-200 transition-colors"
            >
              近30天
            </button>
            <button
              onClick={() => {
                const today = new Date()
                onStartDateChange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`)
                const lastDay = getDaysInMonth(today.getFullYear(), today.getMonth() + 1)
                onEndDateChange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`)
              }}
              className="px-2 py-1 text-xs text-neutral-600 bg-neutral-100 rounded hover:bg-neutral-200 transition-colors"
            >
              本月
            </button>
            <button
              onClick={handleClear}
              className="px-2 py-1 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors ml-auto"
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
