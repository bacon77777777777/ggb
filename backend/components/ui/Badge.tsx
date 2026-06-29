'use client'

import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  rounded?: 'full' | 'lg' | 'md'
}

const variantStyles = {
  default: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  primary: 'bg-primary/10 text-primary border-primary/20',
  success: 'bg-green-100 text-green-700 border-green-200',
  warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  danger: 'bg-red-100 text-red-700 border-red-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200'
}

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm'
}

const roundedStyles = {
  full: 'rounded-full',
  lg: 'rounded-lg',
  md: 'rounded-md'
}

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  rounded = 'full',
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold border whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        roundedStyles[rounded],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
