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
    const reactId = useId()
    const inputId = id || reactId

    return (
      <div className={cn('space-y-1', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-neutral-500">
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
            'w-full px-3 py-1.5 bg-white border rounded-lg text-sm',
            'focus:outline-none focus:ring-1 transition-colors',
            'file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0',
            'file:text-xs file:font-medium file:bg-primary file:text-white',
            'file:cursor-pointer hover:file:bg-primary-dark',
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

FileInput.displayName = 'FileInput'

export default FileInput
