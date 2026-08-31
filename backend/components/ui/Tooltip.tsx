'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 懸停提示
 *
 * **不要用 `title` 屬性。** 那是瀏覽器原生的：延遲一秒多才出現、樣式不能改、
 * 換行只能靠 `\n`、手機上完全沒有。老闆 2026-08-31 回報「懸停放很久才顯示」
 * 就是這個 —— 要的是跟藍色驚嘆號（InfoDot）一樣立刻出現的那種。
 *
 * ⚠️ 用 **portal + fixed**，不是 absolute：
 * 提示框常常開在表格的 sticky 欄或 overflow-hidden 的卡片裡，
 * absolute 的浮層會被裁掉或被同層元素蓋住，z-index 加到多少都沒用。
 *
 * 位置在展開當下用 getBoundingClientRect 算；捲動或改視窗大小就收起來 ——
 * fixed 的浮層不會跟著內容跑，留著會飄在錯的位置。
 */
export default function Tooltip({
  content,
  children,
  width = 260,
  align = 'left',
}: {
  content: ReactNode
  children: ReactNode
  width?: number
  /** 提示框對齊觸發元素的哪一邊。靠畫面右緣的用 right */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    let left = align === 'right' ? r.right - width : r.left
    // 夾在畫面內：寧可不對齊也不要被切掉
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    setPos({ top: r.bottom + 6, left })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      // 手機沒有 hover，點一下開關
      onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
    >
      {children}
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
          className="pointer-events-none z-[9999] whitespace-pre-line rounded-lg bg-neutral-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-xl"
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  )
}
