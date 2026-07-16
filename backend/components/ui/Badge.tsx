'use client'

import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  status?: string
  size?: 'sm' | 'md' | 'lg'
  rounded?: 'full' | 'lg'
}

// 通用 status string → variant 對照表（供各頁面共用）
export const statusVariantMap: Record<string, BadgeVariant> = {
  // 訂單狀態
  submitted: 'warning',
  processing: 'info',
  picked_up: 'info',
  shipping: 'info',
  delivered: 'success',
  cancelled: 'default',
  // 商品狀態
  active: 'success',
  inactive: 'default',
  soldout: 'danger',
  // 用戶狀態
  frozen: 'danger',
  // 付款/結算
  paid: 'success',
  pending: 'warning',
  failed: 'danger',
  completed: 'success',
  // 系統狀態
  ok: 'success',
  error: 'danger',
  warning: 'warning',
  // 中文對應
  '成功': 'success',
  '失敗': 'danger',
  '處理中': 'info',
  '待處理': 'warning',
  '已取消': 'default',
  '已完成': 'success',
  '已出貨': 'info',
  '已付款': 'success',
  '凍結': 'danger',
  '正常': 'success',
}

const variantStyles: Record<BadgeVariant, string> = {
  default:  'bg-neutral-100 text-neutral-600 border-neutral-200',
  primary:  'bg-primary/10 text-primary border-primary/20',
  success:  'bg-green-100 text-green-700 border-green-200',
  warning:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  danger:   'bg-red-100 text-red-700 border-red-200',
  info:     'bg-blue-100 text-primary border-blue-200',
}

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
}

const roundedStyles = {
  full: 'rounded-full',
  lg:   'rounded-lg',
}

export default function Badge({
  children,
  variant,
  status,
  size = 'md',
  rounded = 'full',
  className,
  ...props
}: BadgeProps) {
  const resolvedVariant = variant ?? (status ? (statusVariantMap[status] ?? 'default') : 'default')

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold border whitespace-nowrap',
        variantStyles[resolvedVariant],
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
