'use client'

/**
 * 舊的會員編輯獨立頁。2026-08-14 改成跟「編輯管理者」一樣的彈窗
 * （`components/UserEditModal`，掛在會員管理列表上）。
 * 這裡保留轉址殼，讓書籤或外部連結不會 404。
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function UserEditRedirect() {
  const params = useParams()
  const router = useRouter()
  useEffect(() => {
    const id = String(params?.id || '')
    router.replace(id ? `/users?edit=${encodeURIComponent(id)}` : '/users')
  }, [params, router])
  return null
}
