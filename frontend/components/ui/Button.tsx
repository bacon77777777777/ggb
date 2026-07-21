'use client'

import { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'solid'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

const variantStyles = {
  primary: 'bg-primary text-white font-black hover:bg-primary/90 focus:ring-primary shadow-sm hover:shadow-md',
  secondary: 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium hover:bg-neutral-300 dark:hover:bg-neutral-700 focus:ring-neutral-300 dark:focus:ring-neutral-700',
  danger: 'bg-red-500 text-white font-black hover:bg-red-600 focus:ring-red-500 shadow-sm hover:shadow-md',
  ghost: 'bg-transparent text-neutral-700 dark:text-neutral-200 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:ring-neutral-200 dark:focus:ring-neutral-800',
  outline: 'bg-white dark:bg-transparent border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 font-medium hover:border-neutral-300 dark:hover:border-neutral-600 focus:ring-neutral-300 dark:focus:ring-neutral-700',
  // 全寬 CTA 按鈕（替代 SolidButton）
  solid: 'bg-primary text-white font-black shadow-lg shadow-primary/30 active:scale-[0.98] disabled:!scale-100 disabled:!shadow-none focus:ring-primary',
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base h-11',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl',
        'transition-all duration-200 focus:outline-none focus:ring-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  )
}
