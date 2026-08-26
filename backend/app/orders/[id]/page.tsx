'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/**
 * 舊的配送詳情整頁（老闆 2026-08-26：「畫面留空一堆，改成彈窗，密度密集一點」）
 *
 * 內容已經搬到 `components/OrderDetailModal`，由列表頁直接開。
 * 這頁留著只為了讓既有的書籤與連結不會壞 —— 轉到列表並帶 ?detail=，
 * 列表讀到就把彈窗打開。
 *
 * 為什麼不直接刪：/orders/OD2608249762 這種網址已經在用了
 * （後台選單、通知信、同事之間互傳的連結），刪掉就是 404。
 */
export default function OrderDetailRedirect() {
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    const id = Array.isArray(params?.id) ? params.id[0] : params?.id
    router.replace(id ? `/orders?detail=${encodeURIComponent(String(id))}` : '/orders')
  }, [params, router])

  return null
}
