'use client'

/**
 * 根版面自己爆掉時的最後一道防線。會取代整份文件，所以要自己輸出
 * <html>／<body>，而且不依賴任何 context 或全站 CSS —— 樣式一律 inline。
 */

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { recoverFromStaleBuild } from '@/lib/staleBuild'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (recoverFromStaleBuild(error)) return
    Sentry.captureException(error, {
      tags: { boundary: 'global-error', app: 'backend' },
      extra: { digest: error.digest },
    })
  }, [error])

  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafafa', color: '#171717' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>後台暫時無法載入</h2>
          <p style={{ color: '#525252', maxWidth: 480, lineHeight: 1.7, margin: '0 0 12px' }}>
            重新整理通常就會恢復。若持續出現，請把下面這段一起回報。
          </p>
          <pre style={{ textAlign: 'left', maxWidth: 480, width: '100%', padding: 16, marginBottom: 24, borderRadius: 8, background: '#171717', color: '#f5f5f5', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error.name}: {error.message}
            {error.digest ? `\ndigest: ${error.digest}` : ''}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '10px 20px', fontSize: 14, color: '#fff', background: '#EE4D2D', border: 0, borderRadius: 8, cursor: 'pointer' }}
          >
            重新整理
          </button>
        </div>
      </body>
    </html>
  )
}
