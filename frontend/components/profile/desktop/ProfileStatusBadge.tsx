'use client'

import { cn } from '@/lib/utils'

export type StatusConfig = {
  label: string
  color: string
  bg: string
  border: string
}

export default function ProfileStatusBadge({
  config,
  className,
}: {
  config: StatusConfig
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-xl border text-[12px] font-bold whitespace-nowrap',
        config.bg,
        config.color,
        config.border,
        className
      )}
    >
      {config.label}
    </span>
  )
}

