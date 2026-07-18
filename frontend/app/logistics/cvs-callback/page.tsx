'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

export default function CvsCallbackPage() {
  const searchParams = useSearchParams()
  const [sent, setSent] = useState(false)

  const storeId = searchParams.get('store_id') || ''
  const storeName = searchParams.get('store_name') || ''
  const storeAddress = searchParams.get('store_address') || ''
  const logisticsSubType = searchParams.get('logistics_subtype') || 'UNIMART'

  useEffect(() => {
    if (!storeId) return

    // Send store info to the opener (PWA) and close this window
    if (window.opener) {
      try {
        window.opener.postMessage(
          { type: 'cvs_store_selected', storeId, storeName, storeAddress, logisticsSubType },
          window.location.origin
        )
        setSent(true)
        setTimeout(() => window.close(), 800)
      } catch {
        setSent(true)
      }
    } else {
      // Fallback: no opener (e.g., SFSafariViewController opened via _blank on iOS)
      // Write to localStorage so the PWA can pick it up on next focus
      try {
        localStorage.setItem('cvs_store_pending', JSON.stringify({ storeId, storeName, storeAddress, logisticsSubType, ts: Date.now() }))
      } catch { /* ignore */ }
      setSent(true)
    }
  }, [storeId, storeName, storeAddress, logisticsSubType])

  if (!storeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-neutral-400 text-sm">找不到門市資訊</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <CheckCircle2 className="w-14 h-14 text-emerald-500" />
      <h1 className="text-xl font-black text-neutral-900">門市已選擇</h1>
      <div className="bg-neutral-50 rounded-xl p-4 w-full max-w-xs text-left space-y-1">
        <p className="text-sm font-bold text-neutral-900">{storeName}</p>
        <p className="text-xs text-neutral-500">{storeAddress}</p>
      </div>
      <p className="text-xs text-neutral-400 mt-2">
        {sent ? '請返回 App 繼續配送流程' : '正在回傳門市資訊...'}
      </p>
    </div>
  )
}
