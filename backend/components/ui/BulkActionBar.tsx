'use client'

import type { ReactNode } from 'react'

/**
 * 勾選後從底部滑出的批次操作列
 *
 * 原本批次功能藏在工具列的下拉選單裡 —— 出貨人員勾了一堆訂單，
 * 卻不知道下一步在哪按（老闆 2026-08-26：「看到表格有訂單，會不知道要幹嘛」）。
 * 勾了就讓操作自己浮出來，不用去找。
 */
export default function BulkActionBar({ count, onClear, children, noun = '筆' }: {
  count: number
  onClear: () => void
  children: ReactNode
  noun?: string
}) {
  if (count <= 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[9000] flex justify-center px-4 pb-6">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white shadow-2xl">
        <span className="whitespace-nowrap text-sm">
          已選 <span className="font-semibold tabular-nums">{count}</span> {noun}
        </span>
        <div className="h-5 w-px bg-neutral-700" />
        <div className="flex items-center gap-2">{children}</div>
        <button
          onClick={onClear}
          aria-label="取消選取"
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** 列上的按鈕，深色底專用 */
export function BulkButton({ onClick, children, primary, danger, disabled }: {
  onClick: () => void
  children: ReactNode
  primary?: boolean
  /** 不可復原的操作，放在最右邊、跟其他按鈕之間留一條分隔線 */
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? 'bg-primary text-white hover:bg-primary-dark'
          : danger
            ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
            : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}
