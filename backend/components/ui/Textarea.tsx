'use client'

import { TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  fullWidth?: boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, fullWidth = true, className, id, ...props }, ref) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn('space-y-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-neutral-700"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full px-3 py-2 bg-white border-2 rounded-lg resize-none',
            'focus:outline-none focus:ring-2 transition-all duration-200',
            'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-neutral-200 hover:border-neutral-300 focus:border-primary focus:ring-primary',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

export default Textarea
