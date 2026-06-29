'use client'

import { LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
  helperText?: string
}

export default function Label({ 
  children, 
  required = false, 
  helperText,
  className,
  ...props 
}: LabelProps) {
  return (
    <div className="space-y-1.5">
      <label
        className={cn(
          'block text-sm font-medium text-neutral-700',
          className
        )}
        {...props}
      >
        {children}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {helperText && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}
    </div>
  )
}
