'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function ProfileSectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="text-[16px] font-black text-neutral-900 dark:text-white truncate">{title}</div>
        {description ? (
          <div className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400 truncate">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  )
}
