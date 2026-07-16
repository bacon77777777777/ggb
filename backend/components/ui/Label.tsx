'use client'

import { LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
  helperText?: string
}

export default function Label({ children, required = false, helperText, className, ...props }: LabelProps) {
  return (
    <div className="space-y-1">
      <label className={cn('block text-xs font-medium text-neutral-500', className)} {...props}>
        {children}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {helperText && <p className="text-xs text-neutral-500">{helperText}</p>}
    </div>
  )
}
