'use client'

/**
 * 舊的會員編輯獨立頁。
 *
 * 2026-08-14 先改成列表上的彈窗；2026-08-31 連彈窗也移除了 ——
 * 會員詳情的「基本設置」本身就是完整的編輯表單（欄位一模一樣），
 * 兩個入口存同一批欄位只會讓人不知道該用哪個。
 * 這裡保留轉址殼，讓書籤或外部連結不會 404。
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function UserEditRedirect() {
  const params = useParams()
  const router = useRouter()
  useEffect(() => {
    const id = String(params?.id || '')
    router.replace(id ? `/users/${encodeURIComponent(id)}` : '/users')
  }, [params, router])
  return null
}
