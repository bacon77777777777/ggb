'use client';

/**
 * 根版面（app/layout.tsx）自己爆掉時的最後一道防線。
 *
 * 這支會取代整份文件，所以要自己輸出 <html>／<body>，而且**不能依賴任何
 * context 或全站 CSS** —— 壞掉的很可能正是那些東西。樣式一律寫 inline。
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { recoverFromStaleBuild } from '@/lib/staleBuild';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (recoverFromStaleBuild(error)) return;
    Sentry.captureException(error, {
      tags: { boundary: 'global-error', app: 'frontend' },
      extra: { digest: error.digest, buildId: process.env.NEXT_PUBLIC_BUILD_ID },
    });
  }, [error]);

  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafafa', color: '#171717' }}>
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>網站暫時無法載入</h2>
          <p style={{ color: '#737373', maxWidth: 420, lineHeight: 1.7, margin: '0 0 28px' }}>
            重新整理通常就會恢復。你的代幣、獎品與訂單都不會受到影響。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '10px 22px', fontSize: 14, fontWeight: 500, color: '#fff', background: '#EE4D2D', border: 0, borderRadius: 8, cursor: 'pointer' }}
          >
            重新整理
          </button>
        </div>
      </body>
    </html>
  );
}
