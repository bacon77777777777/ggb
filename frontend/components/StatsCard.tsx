'use client'

interface StatsCardProps {
  title: string
  value: string | number
  unit?: string
  onClick?: () => void
  isActive?: boolean
  activeColor?: 'primary' | 'red' | 'green' | 'blue' | 'yellow'
  subtitle?: string
  icon?: React.ReactNode
}

export default function StatsCard({
  title,
  value,
  unit,
  onClick,
  isActive = false,
  activeColor = 'primary',
  subtitle,
  icon
}: StatsCardProps) {
  const colorMap = {
    primary: {
      ring: 'ring-primary',
      border: 'border-primary',
    },
    red: {
      ring: 'ring-red-500',
      border: 'border-red-500',
    },
    green: {
      ring: 'ring-green-500',
      border: 'border-green-500',
    },
    blue: {
      ring: 'ring-blue-500',
      border: 'border-blue-500',
    },
    yellow: {
      ring: 'ring-yellow-500',
      border: 'border-yellow-500',
    }
  }

  const colors = colorMap[activeColor] || colorMap.primary

  // 統一高度和樣式
  const baseClasses = `bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 p-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all h-full min-h-[100px] flex flex-col justify-between`
  // 統一選中樣式：使用單一藍色邊框和 ring，避免多種顏色混在一起
  const activeClasses = isActive ? `ring-2 ${colors.ring} ${colors.border}` : ''
  const clickableClasses = onClick ? `cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary` : ''

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {title}{unit && <span className="text-neutral-500 dark:text-neutral-500">({unit})</span>}
        </p>
        {icon && <div className="text-neutral-400 dark:text-neutral-500">{icon}</div>}
      </div>
      <div className="flex-1 flex items-end">
        <p className="text-2xl font-bold text-neutral-900 dark:text-white font-amount">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      </div>
      {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">{subtitle}</p>}
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        }}
        className={`${baseClasses} ${activeClasses} ${clickableClasses} w-full`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={`${baseClasses} ${activeClasses}`}>
      {content}
    </div>
  )
}
