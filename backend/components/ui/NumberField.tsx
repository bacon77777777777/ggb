'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * 數字輸入框（沒有上下箭頭、可以清空）
 *
 * 取代 `<input type="number" value={n} onChange={e => set(Number(e.target.value))}>`。
 * 那種寫法有兩個毛病，老闆都遇到了：
 *
 *   1. **0 刪不掉**：把內容選起來刪掉會得到空字串，`Number('')` 是 `0`，
 *      於是立刻又被塞回 0，看起來就像刪不動。
 *   2. **有上下箭頭**：`type="number"` 的 spinner，滑鼠滾輪掃過去還會誤改數值。
 *
 * 作法：內部用字串 state，允許中途是空的或只有一個「-」「.」；
 * 只有解析得出數字時才往上通知。離開欄位（blur）時再夾回 min/max，
 * 空的就還原成上一個有效值 —— 使用者不會被卡在半途的狀態，也不會存到空值。
 *
 * 用 `type="text" inputMode="decimal"`：手機仍然跳數字鍵盤，但沒有 spinner。
 */
export function NumberField({
  value, onChange, min, max, step, className, disabled, placeholder,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  /** 只作為小數位數的提示，實際不做步進（沒有箭頭） */
  step?: number
  className?: string
  disabled?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState(String(value))

  // 只想在「外部改值」時同步，不想因為自己打字而重跑，所以中途文字放 ref 不放相依陣列
  const textRef = useRef(text)
  textRef.current = text

  // 外部改值（例如切換廠商、載入設定）時同步進來；正在輸入的中途狀態不覆蓋
  useEffect(() => {
    if (Number(textRef.current) !== value) setText(String(value))
  }, [value])

  const commit = () => {
    if (text.trim() === '' || Number.isNaN(Number(text))) {
      setText(String(value))          // 空的或打壞了 → 還原
      return
    }
    let n = Number(text)
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    setText(String(n))
    if (n !== value) onChange(n)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={e => {
        const v = e.target.value
        // 允許空字串與「-」「.」這種還沒打完的中途狀態
        if (v !== '' && !/^-?\d*\.?\d*$/.test(v)) return
        setText(v)
        if (v !== '' && v !== '-' && v !== '.' && !Number.isNaN(Number(v))) onChange(Number(v))
      }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cn(
        'text-sm border border-neutral-200 rounded-lg px-2 py-1 text-center',
        'focus:outline-none focus:ring-1 focus:ring-primary/20',
        'disabled:bg-neutral-50 disabled:text-neutral-400',
        className,
      )}
    />
  )
}

export default NumberField
