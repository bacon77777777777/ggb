'use client'

/**
 * 舊的商城商品詳情獨立頁。2026-08-14 老闆指定隱藏：
 * 商品詳情與購買整條龍都在商城首頁的彈層（/sell?open=<id>），
 * 這頁是改版前的舊 UI。保留轉址殼：後台「前台」預覽連結、
 * 聊天室與舊分享連結都還是 /sell/<id> 這種網址，不能 404。
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function SellDetailRedirect() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => {
    const id = String(params?.id || '')
    router.replace(id ? `/sell?open=${encodeURIComponent(id)}` : '/sell')
  }, [params, router])
  return null
}
