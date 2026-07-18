interface EmptyStateProps {
  message?: string
  colSpan?: number
  icon?: React.ReactNode
}

const DefaultIcon = () => (
  <svg className="w-8 h-8 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
  </svg>
)

/** 用於 table tbody 的空狀態，自動套 <tr><td colSpan={N}> */
export function TableEmpty({ message = '沒有資料', colSpan = 99, icon }: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center">
        <div className="flex flex-col items-center gap-2">
          {icon ?? <DefaultIcon />}
          <span className="text-sm text-neutral-400">{message}</span>
        </div>
      </td>
    </tr>
  )
}

/** 用於卡片/區塊內的空狀態 */
export default function EmptyState({ message = '沒有資料', icon }: Omit<EmptyStateProps, 'colSpan'>) {
  return (
    <div className="py-14 flex flex-col items-center gap-2">
      {icon ?? <DefaultIcon />}
      <span className="text-sm text-neutral-400">{message}</span>
    </div>
  )
}
