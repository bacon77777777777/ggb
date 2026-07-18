'use client'

import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  hasError?: boolean
  compact?: boolean
}

const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ children, hasError, disabled, compact = false, className, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full border rounded-lg appearance-none cursor-pointer',
            'focus:outline-none focus:ring-1 transition-colors',
            'disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed',
            compact ? 'py-0.5 px-2 pr-6 text-xs' : 'py-1.5 px-3 pr-8 text-sm',
            hasError
              ? 'bg-white border-red-400 focus:border-red-500 focus:ring-red-500'
              : disabled
                ? 'bg-neutral-50 border-neutral-200'
                : 'bg-white border-neutral-200 hover:border-neutral-300 focus:border-primary focus:ring-primary',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <div className={cn(
          'absolute top-1/2 -translate-y-1/2 pointer-events-none',
          compact ? 'right-1.5' : 'right-2.5'
        )}>
          <svg
            className={cn('text-neutral-400', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    )
  }
)

SelectField.displayName = 'SelectField'
export default SelectField
