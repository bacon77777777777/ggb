'use client'

import { useState } from 'react'

/**
 * 會員編號 #10042（老闆 2026-08-26）
 *
 * 全站表格一律顯示這個，**只有會員詳情頁才露出 uuid**。
 * uuid 是 Supabase Auth 的主鍵，系統要用，但沒人唸得出來也記不住 ——
 * 客服在電話上、出貨人員對單、財務對帳，用的都該是短號。
 *
 * 沒有 member_no 時（API 還沒補上這個欄位）退回截斷的 uuid，
 * 不要整格空白 —— 顯示得出來至少查得到人。
 */
export default function MemberNo({ no, uuid, className = '' }: {
  no?: number | null
  uuid?: string | null
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const text = no ? `#${no}` : (uuid ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : '—')
  const copyValue = no ? String(no) : (uuid ?? '')

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!copyValue) return
    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch { /* 沒有剪貼簿權限就算了，不要炸掉 */ }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={uuid ? `${text}\n${uuid}` : text}
      className={`inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 transition-colors hover:bg-neutral-200 ${className}`}
    >
      <span className="tabular-nums">{text}</span>
      {copied ? (
        <svg className="h-3 w-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3 w-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}
