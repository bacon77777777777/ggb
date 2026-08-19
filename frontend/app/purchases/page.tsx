'use client'

/**
 * 舊的購買清單頁。2026-08-14 老闆指定隱藏：
 * 商城訂單的唯一入口是商城的「我的訂單」（/sell/orders，訂單詳情走 OrderSheet 彈層），
 * 這頁跟它是同一份資料的兩套 UI。保留轉址殼讓舊書籤與通知連結不會 404。
 *
 * App 版沒有商城（見 lib/nativeApp.ts），/sell/orders 會被 middleware 擋成 404，
 * 所以改帶去「我的」—— 抽獎的出貨進度與倉庫本來就在那裡。
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkNativeAppUA } from '@/lib/useIsNativeApp'

export default function PurchasesRedirect() {
  const router = useRouter()
  useEffect(() => {
    // 同步判斷：用 hook 的話第一次 render 會拿到 false，先轉去 /sell/orders 再修正，
    // 在 App 裡就是先閃一個 404
    router.replace(checkNativeAppUA() ? '/profile' : '/sell/orders')
  }, [router])
  return null
}
