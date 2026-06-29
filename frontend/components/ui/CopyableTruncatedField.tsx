'use client'

import { Copy } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type CopyableTruncatedFieldProps = {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  copyValue?: string
  disabled?: boolean
  className?: string
  fieldClassName?: string
}

export default function CopyableTruncatedField({
  value,
  onChange,
  placeholder,
  copyValue,
  disabled,
  className,
  fieldClassName,
}: CopyableTruncatedFieldProps) {
  const { showToast } = useToast()

  const effectiveCopyValue = (copyValue ?? value).trim()
  const canCopy = !disabled && effectiveCopyValue.length > 0

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {onChange ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'min-w-0 flex-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-[13px] sm:text-sm font-mono text-neutral-800 dark:text-neutral-200 outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary overflow-hidden text-ellipsis whitespace-nowrap',
            fieldClassName
          )}
          autoComplete="off"
          spellCheck={false}
        />
      ) : (
        <code
          className={cn(
            'min-w-0 flex-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl px-3 sm:px-5 h-[3.25rem] flex items-center text-[13px] sm:text-sm font-mono text-neutral-600 dark:text-neutral-400 font-bold overflow-hidden whitespace-nowrap',
            fieldClassName
          )}
        >
          <span className="truncate">{value || placeholder || ''}</span>
        </code>
      )}
      <button
        type="button"
        onClick={async () => {
          if (!canCopy) return
          try {
            await navigator.clipboard.writeText(effectiveCopyValue)
            showToast('已複製', 'success')
          } catch {
            showToast('複製失敗', 'error')
          }
        }}
        disabled={!canCopy}
        className="p-3 sm:p-4 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-2xl text-neutral-400 dark:text-neutral-500 transition-colors shrink-0 group shadow-soft bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Copy className="w-3.5 h-3.5 group-active:scale-90 transition-transform" />
      </button>
    </div>
  )
}

