'use client'

import Link from 'next/link'

/**
 * 會員編號（老闆 2026-08-26 → 2026-09-04 改版）
 *
 * 全站表格一律顯示這個，**只有會員詳情頁才露出 uuid**。
 * uuid 是 Supabase Auth 的主鍵，系統要用，但沒人唸得出來也記不住 ——
 * 客服在電話上、出貨人員對單、財務對帳，用的都該是短號。
 *
 * 2026-09-04 起：編號是隨機 8 位數（migration 693），同時就是邀請碼。
 * 樣式照以前邀請碼欄的藍字，**點下去直接進會員詳情**，不再有複製鈕 ——
 * 表格裡要的是「跳過去看這個人」，複製反而少用。
 *
 * 沒有 member_no 時（API 還沒補上這個欄位）退回截斷的 uuid，
 * 不要整格空白 —— 顯示得出來至少查得到人。
 */
export default function MemberNo({ no, uuid, plain = false, className = '' }: {
  no?: number | null
  uuid?: string | null
  /** 純文字模式：不變連結。詳情彈窗裡值本來就是一行行的純文字（老闆 2026-08-26） */
  plain?: boolean
  className?: string
}) {
  const text = no ? String(no) : (uuid ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : '—')

  if (plain || !uuid) {
    return (
      <span className={`font-mono tabular-nums ${className}`} title={uuid ?? undefined}>{text}</span>
    )
  }

  return (
    <Link
      href={`/users/${uuid}`}
      onClick={e => e.stopPropagation()}
      className={`font-mono tabular-nums text-primary hover:underline ${className}`}
    >
      {text}
    </Link>
  )
}
