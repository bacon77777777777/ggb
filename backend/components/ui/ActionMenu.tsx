'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * 列尾的「⋯」動作選單
 *
 * 為什麼要有這個：配送管理每列原本並排五顆同樣大小的字
 * （詳情／手動出貨／生成配送單／列印明細／取消），出貨人員得讀完才知道按哪顆，
 * 而「取消」就貼在「列印明細」旁邊 —— 那是不可復原的操作。
 * 主要動作留一顆實心鈕，其餘收進這裡。
 *
 * ⚠️ 用 portal + fixed 定位，不是 absolute：
 * 這個選單開在表格的 sticky 操作欄裡，而表格容器是 overflow-x-auto，
 * absolute 的浮層會被裁掉一半。
 */

export interface ActionMenuItem {
  label: string
  onClick: () => void
  /** 紅字，並自動排到最下面、加一條分隔線 */
  danger?: boolean
  hidden?: boolean
  disabled?: boolean
}

export default function ActionMenu({ items, label = '更多操作' }: {
  items: ActionMenuItem[]
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const visible = items.filter(i => !i.hidden)
  const normal  = visible.filter(i => !i.danger)
  const danger  = visible.filter(i => i.danger)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const width = 168
    const height = visible.length * 36 + (danger.length ? 9 : 0) + 8
    // 空間不夠就往上開／往左貼，不要開到視窗外
    const top  = r.bottom + height > window.innerHeight ? r.top - height - 4 : r.bottom + 4
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
    setPos({ top, left })
  }, [open, visible.length, danger.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    // 捲動時關掉 —— fixed 的浮層不會跟著表格跑，留著會飄在錯的位置
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  if (visible.length === 0) return null

  const row = (it: ActionMenuItem, i: number) => (
    <button
      key={`${it.label}-${i}`}
      disabled={it.disabled}
      onClick={() => { setOpen(false); it.onClick() }}
      className={`block w-full px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        it.danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      {it.label}
    </button>
  )

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 ${
          open ? 'bg-neutral-100 text-neutral-700' : ''
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{ top: pos.top, left: pos.left, width: 168 }}
          className="fixed z-[10050] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {normal.map(row)}
          {danger.length > 0 && normal.length > 0 && <div className="my-1 border-t border-neutral-100" />}
          {danger.map(row)}
        </div>,
        document.body,
      )}
    </>
  )
}
