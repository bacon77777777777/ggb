'use client'

import { InputHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

export interface FileInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
  accept?: string
  fullWidth?: boolean
}

const FileInput = forwardRef<HTMLInputElement, FileInputProps>(
  ({ label, error, helperText, fullWidth = true, className, id, accept, ...props }, ref) => {
    const rid = useId()
    const inputId = id || `file-input-${rid}`

    return (
      <div className={cn('space-y-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-neutral-700"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          type="file"
          id={inputId}
          accept={accept}
          className={cn(
            'w-full px-3 py-2 bg-white border-2 rounded-lg',
            'focus:outline-none focus:ring-2 transition-all duration-200',
            'file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0',
            'file:text-sm file:font-medium file:bg-primary file:text-white',
            'file:cursor-pointer hover:file:bg-primary-dark',
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

FileInput.displayName = 'FileInput'

export default FileInput
