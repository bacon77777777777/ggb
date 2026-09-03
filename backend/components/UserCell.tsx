'use client'

import type { ReactNode } from 'react'
import MemberNo from './MemberNo'
import { realEmail } from '@/lib/syntheticEmail'

/**
 * 表格「用戶」欄的統一長相（老闆 2026-09-04）：
 *
 *   #100222        ← 會員編號（可複製），全站認人靠這個
 *   呆萌的賞金獵人   ← 暱稱
 *   xxx@gmail.com  ← 真信箱才印；LINE 快速帳號的合成信箱是內部代號，不印
 *
 * 之前每頁各寫一份「暱稱＋信箱」，LINE 帳號那串 line_<雜湊>@line-login… 在
 * 消費紀錄／儲值明細／待複核儲值…十幾頁全部露出來。收成一個元件，
 * 要改長相只改這裡。
 */
export default function UserCell({ memberNo, uuid, name, email, children }: {
  memberNo?: number | null
  uuid?: string | null
  name?: string | null
  email?: string | null
  /** 掛在信箱下面的附加列（例：待複核儲值的「餘額 8 G」） */
  children?: ReactNode
}) {
  const mail = realEmail(email)
  return (
    <div className="min-w-0">
      <MemberNo no={memberNo} uuid={uuid} />
      <div className="mt-0.5 font-medium text-neutral-900">{name || '未知用戶'}</div>
      {mail && <div className="text-xs text-neutral-500">{mail}</div>}
      {children}
    </div>
  )
}
