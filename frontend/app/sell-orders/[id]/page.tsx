'use client'

/**
 * 舊的訂單詳情獨立頁。
 *
 * 2026-08-14 老闆定調訂單詳情只留**彈窗版**（我的訂單頁的 OrderSheet），
 * 這頁跟它是同一件事的兩份 UI，收斂掉。保留轉址殼是因為聊天室、
 * 舊通知或書籤可能還存著 /sell-orders/<id> 這種網址，不能讓它們 404。
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function SellOrderRedirect() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => {
    const id = String(params?.id || '')
    router.replace(id ? `/sell/orders?open=${encodeURIComponent(id)}` : '/sell/orders')
  }, [params, router])
  return null
}
