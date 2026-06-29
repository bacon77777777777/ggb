'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function ProfileToolbar({
  left,
  right,
  className,
}: {
  left?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-2 min-w-0 flex-1">{left}</div>
      {right ? <div className="flex items-center gap-2 shrink-0">{right}</div> : null}
    </div>
  )
}
