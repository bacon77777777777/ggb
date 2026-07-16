'use client'

import { useMemo, useRef, useState, useEffect } from 'react'

interface TagSelectorProps {
  value: string[]
  onChange: (newIds: string[]) => void
  label?: string
}

type TagOption = { id: string; name: string }

export default function TagSelector({ value, onChange, label = '標籤' }: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<TagOption[]>([])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setDraft(value)
  }, [isOpen, value])

  useEffect(() => {
    const fetchTags = async () => {
      setIsLoading(true)
      try {
        const res = await fetch('/api/admin/tags', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        const rows = Array.isArray(json?.tags) ? (json.tags as TagOption[]) : []
        setOptions(rows)
      } finally {
        setIsLoading(false)
      }
    }
    fetchTags()
  }, [])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, query])

  const selectedText = useMemo(() => {
    const nameById = new Map(options.map((o) => [o.id, o.name]))
    const parts = value
      .map((id) => nameById.get(id))
      .filter(Boolean)
      .map((name) => `#${name}`)
    return parts.join(', ')
  }, [options, value])

  const toggleDraft = (id: string) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const handleConfirm = () => {
    onChange(draft)
    setIsOpen(false)
  }

  const handleCancel = () => {
    setDraft(value)
    setIsOpen(false)
  }

  const handleCreate = async () => {
    const raw = query.replace(/^#/, '').trim()
    if (!raw || isCreating) return
    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: raw }),
      })
      const json = await res.json().catch(() => null)
      const tag = json?.tag as TagOption | undefined
      if (tag?.id && tag?.name) {
        setOptions((prev) => {
          const next = prev.some((t) => t.id === tag.id) ? prev : [tag, ...prev]
          return next
        })
        setDraft((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]))
        setQuery('')
      }
    } finally {
      setIsCreating(false)
    }
  }

  // Get selected names for display
  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-xs font-medium text-neutral-500 mb-1">
        {label}
      </label>
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg flex items-center justify-between cursor-pointer transition-colors hover:border-neutral-300 ${isOpen ? 'ring-1 ring-primary border-primary' : ''}`}
      >
        <div className="truncate text-neutral-700 pr-2 select-none">
          {selectedText || <span className="text-neutral-400">請選擇...</span>}
        </div>
        <svg
          className={`w-5 h-5 text-neutral-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-neutral-100 space-y-2">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 h-10 px-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20"
                placeholder="搜尋或新增標籤（最多 5 字）"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="h-10 px-3 rounded-lg bg-neutral-900 text-white text-sm font-bold disabled:opacity-50"
              >
                新增
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 text-center text-sm text-neutral-500">載入中...</div>
            ) : filteredOptions.length > 0 ? (
              <div className="p-1 space-y-0.5">
                {filteredOptions.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => toggleDraft(opt.id)}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-neutral-50 rounded select-none"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${draft.includes(opt.id) ? 'bg-primary border-primary' : 'border-neutral-300 bg-white'}`}>
                      {draft.includes(opt.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm text-neutral-700">{opt.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center text-sm text-neutral-500">無符合的標籤</div>
            )}
          </div>

          <div className="p-2 border-t border-neutral-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="h-9 px-3 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-bold"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="h-9 px-3 rounded-lg bg-primary text-white text-sm font-bold"
            >
              確定
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
