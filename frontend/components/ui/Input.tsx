'use client'

import { InputHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  onRightIconClick?: () => void
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, fullWidth = true, className, id, onRightIconClick, ...props }, ref) => {
    const rid = useId()
    const inputId = id || `input-${rid}`

    return (
      <div className={cn('space-y-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-neutral-500 dark:text-neutral-400"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full px-3 py-2 bg-white dark:bg-neutral-900 border rounded-xl',
              'focus:outline-none focus:ring-1 transition-all duration-200',
              'text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400',
              'disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed disabled:border-neutral-200',
              leftIcon ? 'pl-10' : '',
              rightIcon ? 'pr-10' : '',
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-primary focus:ring-primary',
              className
            )}
            {...props}
          />
          {rightIcon && (
            onRightIconClick ? (
              <button
                type="button"
                onClick={onRightIconClick}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 focus:outline-none"
              >
                {rightIcon}
              </button>
            ) : (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 flex items-center">
                {rightIcon}
              </div>
            )
          )}
        </div>
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs text-neutral-500">{helperText}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
