'use client'

import { TextareaHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  fullWidth?: boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, fullWidth = true, className, id, ...props }, ref) => {
    const reactId = useId()
    const textareaId = id || reactId

    return (
      <div className={cn('space-y-1', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-medium text-neutral-500">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full px-3 py-1.5 bg-white border rounded-lg text-sm resize-none',
            'focus:outline-none focus:ring-1 transition-colors',
            'disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed disabled:border-neutral-200',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : 'border-neutral-200 hover:border-neutral-300 focus:border-primary focus:ring-primary',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        {helperText && !error && <p className="text-xs text-neutral-500">{helperText}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

export default Textarea
