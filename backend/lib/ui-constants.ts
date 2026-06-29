/**
 * UI Kit 統一樣式常數
 */

// 尺寸定義
export const SIZES = {
  sm: {
    input: 'px-3 py-1.5 text-sm',
    button: 'px-3 py-1.5 text-sm',
    badge: 'px-1.5 py-0.5 text-xs',
  },
  md: {
    input: 'px-3 py-2 text-sm',
    button: 'px-4 py-2 text-sm',
    badge: 'px-2 py-1 text-xs',
  },
  lg: {
    input: 'px-4 py-3 text-base',
    button: 'px-6 py-3 text-base',
    badge: 'px-3 py-1.5 text-sm',
  },
} as const

// 顏色定義
export const COLORS = {
  primary: {
    bg: 'bg-primary',
    text: 'text-primary',
    border: 'border-primary',
    hover: 'hover:bg-primary-dark',
    focus: 'focus:ring-primary',
  },
  secondary: {
    bg: 'bg-neutral-200',
    text: 'text-neutral-700',
    border: 'border-neutral-200',
    hover: 'hover:bg-neutral-300',
    focus: 'focus:ring-neutral-300',
  },
  danger: {
    bg: 'bg-red-500',
    text: 'text-red-500',
    border: 'border-red-500',
    hover: 'hover:bg-red-600',
    focus: 'focus:ring-red-500',
  },
  success: {
    bg: 'bg-green-500',
    text: 'text-green-500',
    border: 'border-green-500',
    hover: 'hover:bg-green-600',
    focus: 'focus:ring-green-500',
  },
  warning: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-500',
    border: 'border-yellow-500',
    hover: 'hover:bg-yellow-600',
    focus: 'focus:ring-yellow-500',
  },
} as const

// 間距定義
export const SPACING = {
  xs: '0.5rem', // 8px
  sm: '0.75rem', // 12px
  md: '1rem', // 16px
  lg: '1.5rem', // 24px
  xl: '2rem', // 32px
  '2xl': '3rem', // 48px
} as const

// 圓角定義
export const RADIUS = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
} as const

// 陰影定義
export const SHADOWS = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
} as const

// 過渡動畫定義
export const TRANSITIONS = {
  default: 'transition-all duration-200',
  fast: 'transition-all duration-150',
  slow: 'transition-all duration-300',
} as const

// 輸入框基礎樣式
export const INPUT_BASE_STYLES = [
  'w-full px-3 py-2',
  'bg-white border-2 rounded-lg',
  'focus:outline-none focus:ring-2',
  'transition-all duration-200',
  'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
] as const

// 輸入框狀態樣式
export const INPUT_STATES = {
  default: 'border-neutral-200 hover:border-neutral-300 focus:border-primary focus:ring-primary',
  error: 'border-red-500 focus:border-red-500 focus:ring-red-500',
  success: 'border-green-500 focus:border-green-500 focus:ring-green-500',
} as const

// 按鈕基礎樣式
export const BUTTON_BASE_STYLES = [
  'inline-flex items-center justify-center gap-2',
  'rounded-lg font-medium',
  'transition-all duration-200',
  'focus:outline-none focus:ring-2',
  'disabled:opacity-50 disabled:cursor-not-allowed',
] as const
