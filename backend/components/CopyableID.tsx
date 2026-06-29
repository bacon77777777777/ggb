'use client'

import { useMemo, useState } from 'react'

type CopyableIDProps = {
  id: string
  className?: string
}

const truncateId = (value: string) => {
  if (!value) return ''
  if (value.length <= 12) return value
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

export default function CopyableID({ id, className }: CopyableIDProps) {
  const [copied, setCopied] = useState(false)

  const display = useMemo(() => truncateId(id), [id])

  const handleCopy = async () => {
    if (!id) return
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      return
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className || ''}`}>
      <span
        title={id}
        className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-600 px-2 py-1 rounded font-mono text-xs"
      >
        <span className="whitespace-nowrap">{display || '-'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-0.5 rounded hover:bg-neutral-200 transition-colors"
          aria-label="Copy"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </span>
      {copied && (
        <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded whitespace-nowrap">
          已複製
        </span>
      )}
    </span>
  )
}

