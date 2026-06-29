'use client'

import { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean
  header?: ReactNode
  footer?: ReactNode
  hover?: boolean
}

export default function Card({
  children,
  noPadding = false,
  header,
  footer,
  hover = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800',
        hover && 'hover:shadow-md transition-shadow',
        className
      )}
      {...props}
    >
      {header && (
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          {header}
        </div>
      )}
      <div className={cn(!noPadding && 'p-6')}>
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800">
          {footer}
        </div>
      )}
    </div>
  )
}
