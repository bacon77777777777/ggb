'use client'

/**
 * 舊的購買清單頁。2026-08-14 老闆指定隱藏：
 * 商城訂單的唯一入口是商城的「我的訂單」（/sell/orders，訂單詳情走 OrderSheet 彈層），
 * 這頁跟它是同一份資料的兩套 UI。保留轉址殼讓舊書籤與通知連結不會 404。
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PurchasesRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/sell/orders')
  }, [router])
  return null
}
