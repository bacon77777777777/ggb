'use client'

/**
 * 後台錯誤邊界。
 *
 * 沒有這支的時候，任何一個 client 端例外都會落到 Next.js 內建的
 * 「Application error: a client-side exception has occurred」——
 * 一片白、沒有訊息、也沒有退路。2026-08-27 點「商城 → 關閉」就是這樣，
 * 真正的錯是 ConfirmDialog 的 hook 順序，但畫面上完全看不出來。
 *
 * 後台只有自己人看，所以錯誤訊息**直接顯示出來**，不收進 details ——
 * 回報時截一張圖就能定位，不用再問一次「console 寫什麼」。
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { recoverFromStaleBuild } from '@/lib/staleBuild'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [reloading, setReloading] = useState(true)

  useEffect(() => {
    if (recoverFromStaleBuild(error)) return
    setReloading(false)
    Sentry.captureException(error, {
      tags: { boundary: 'app-error', app: 'backend' },
      extra: {
        digest: error.digest,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      },
    })
  }, [error])

  if (reloading) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">這一頁出錯了</h1>
        <p className="text-neutral-600 mb-6 leading-relaxed">
          剛才的操作可能沒有存到，重新整理後請確認一次。
        </p>

        <pre className="text-left p-4 mb-6 rounded-lg bg-neutral-900 text-neutral-100 text-xs leading-relaxed whitespace-pre-wrap break-words">
          {error.name}: {error.message}
          {error.digest ? `\ndigest: ${error.digest}` : ''}
        </pre>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
          >
            重新整理
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            返回儀表板
          </Link>
        </div>
      </div>
    </div>
  )
}
