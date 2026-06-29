'use client'

interface FilterTag {
  key: string
  label: string
  value: string
  color?: 'primary' | 'red' | 'blue' | 'green' | 'yellow'
  onRemove: () => void
}

interface FilterTagsProps {
  tags: FilterTag[]
  onClearAll?: () => void
}

export default function FilterTags({ tags, onClearAll }: FilterTagsProps) {
  if (tags.length === 0) return null

  const colorMap = {
    primary: 'bg-primary/10 text-primary hover:bg-primary/20',
    red: 'bg-red-100 text-red-700 hover:bg-red-200',
    blue: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
    green: 'bg-green-100 text-green-700 hover:bg-green-200',
    yellow: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      <span className="text-xs text-neutral-500">篩選條件：</span>
      {tags.map((tag) => (
        <span
          key={tag.key}
          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${colorMap[tag.color || 'primary']}`}
        >
          {tag.label}：{tag.value}
          <button 
            onClick={tag.onRemove} 
            className="rounded-full p-0.5"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      {onClearAll && (
        <button
          onClick={onClearAll}
          className="text-xs text-neutral-500 hover:text-neutral-700 underline"
        >
          清除全部
        </button>
      )}
    </div>
  )
}
