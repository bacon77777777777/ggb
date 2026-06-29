'use client'

import { useState, useRef, useEffect } from 'react'

interface DateTimePickerProps {
  value: string  // 格式：'YYYY-MM-DD HH:mm:ss'
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  min?: string  // 最小日期時間（格式：'YYYY-MM-DD HH:mm:ss'）
}

export default function DateTimePicker({ 
  value, 
  onChange, 
  placeholder = '選擇日期時間',
  label,
  min
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom')
  const [selectedDate, setSelectedDate] = useState<{ year: number; month: number; day: number } | null>(() => {
    if (value) {
      const [datePart] = value.split(' ')
      const [year, month, day] = datePart.split('-').map(Number)
      return { year, month, day }
    }
    return null
  })
  const [selectedTime, setSelectedTime] = useState<{ hour: string; minute: string }>(() => {
    if (value) {
      const timePart = value.split(' ')[1] || '00:00:00'
      const [hour, minute] = timePart.split(':')
      return { hour: hour || '00', minute: minute || '00' }
    }
    return { hour: '00', minute: '00' }
  })
  const [viewDate, setViewDate] = useState(() => {
    if (selectedDate) {
      return { year: selectedDate.year, month: selectedDate.month }
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
      const dropdownHeight = 450
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

  // 當 value 變化時更新內部狀態
  useEffect(() => {
    if (value) {
      const [datePart, timePart] = value.split(' ')
      if (datePart) {
        const [year, month, day] = datePart.split('-').map(Number)
        setSelectedDate({ year, month, day })
        setViewDate({ year, month })
      }
      if (timePart) {
        const [hour, minute] = timePart.split(':')
        setSelectedTime({ hour: hour || '00', minute: minute || '00' })
      }
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
    setSelectedDate({ year, month, day })
    updateDateTime(year, month, day, selectedTime.hour, selectedTime.minute)
  }

  const handleTimeChange = (type: 'hour' | 'minute', val: string) => {
    const newTime = { ...selectedTime, [type]: val }
    setSelectedTime(newTime)
    if (selectedDate) {
      updateDateTime(selectedDate.year, selectedDate.month, selectedDate.day, newTime.hour, newTime.minute)
    }
  }

  const updateDateTime = (year: number, month: number, day: number, hour: string, minute: string) => {
    const dateTimeStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`
    onChange(dateTimeStr)
  }

  const formatDisplayDateTime = () => {
    if (!value) return placeholder
    const [datePart, timePart] = value.split(' ')
    if (!datePart) return placeholder
    const [year, month, day] = datePart.split('-')
    const [hour, minute] = (timePart || '00:00:00').split(':')
    return `${year}/${month}/${day} ${hour}:${minute}`
  }

  const isSelected = (day: number, month: number, year: number) => {
    return selectedDate?.year === year && selectedDate?.month === month && selectedDate?.day === day
  }

  const isToday = (day: number, month: number, year: number) => {
    const today = new Date()
    return today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
  }

  const isDisabled = (day: number, month: number, year: number) => {
    if (!min) return false
    const [minDatePart, minTimePart] = min.split(' ')
    const [minYear, minMonth, minDay] = minDatePart.split('-').map(Number)
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const minDateStr = `${minYear}-${String(minMonth).padStart(2, '0')}-${String(minDay).padStart(2, '0')}`
    return dateStr < minDateStr
  }

  const handleSetToday = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = now.getDate()
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    
    setSelectedDate({ year, month, day })
    setSelectedTime({ hour, minute })
    setViewDate({ year, month })
    updateDateTime(year, month, day, hour, minute)
    setIsOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setSelectedDate(null)
    setSelectedTime({ hour: '00', minute: '00' })
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
  const calendar = generateCalendar()

  return (
    <div className="relative" ref={containerRef}>
      {label && <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm cursor-pointer hover:border-neutral-300 transition-colors flex items-center justify-between min-h-[42px]"
      >
        <span className={value ? 'text-neutral-900 font-mono' : 'text-neutral-400'}>
          {formatDisplayDateTime()}
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
        <div className={`absolute left-0 w-96 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 p-3 ${
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
            <span className="text-base font-semibold text-neutral-900">
              {viewDate.year}年{viewDate.month}月
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

          {/* 星期標題 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekDays.map(day => (
              <div key={day} className="text-center text-xs font-medium text-neutral-500 py-1">{day}</div>
            ))}
          </div>

          {/* 日期格子 */}
          <div className="grid grid-cols-7 gap-0.5 mb-3">
            {calendar.map((item, idx) => {
              const selected = isSelected(item.day, item.month, item.year)
              const today = isToday(item.day, item.month, item.year)
              const disabled = isDisabled(item.day, item.month, item.year)
              
              return (
                <button
                  key={idx}
                  onClick={() => !disabled && handleSelectDate(item.day, item.month, item.year)}
                  disabled={disabled}
                  className={`
                    w-9 h-8 text-sm transition-colors flex items-center justify-center relative
                    ${item.isCurrentMonth ? 'text-neutral-900' : 'text-neutral-400'}
                    ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
                    ${selected ? 'bg-primary text-white font-medium rounded-lg' : ''}
                    ${!selected && !disabled && today ? 'font-medium text-primary' : ''}
                    ${!selected && !disabled ? 'hover:bg-neutral-100 rounded-lg' : ''}
                  `}
                  type="button"
                >
                  {item.day}
                </button>
              )
            })}
          </div>

          {/* 時間選擇 */}
          <div className="border-t border-neutral-100 pt-3">
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-neutral-500">時</label>
                <select
                  value={selectedTime.hour}
                  onChange={(e) => handleTimeChange('hour', e.target.value)}
                  className="px-2 py-1.5 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  {hours.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <span className="text-neutral-400">:</span>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-neutral-500">分</label>
                <select
                  value={selectedTime.minute}
                  onChange={(e) => handleTimeChange('minute', e.target.value)}
                  className="px-2 py-1.5 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  {minutes.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 快捷選項 */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-neutral-100">
            <button
              onClick={handleSetToday}
              className="px-3 py-1.5 text-xs text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              type="button"
            >
              現在
            </button>
            {value && (
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors ml-auto"
                type="button"
              >
                清除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
