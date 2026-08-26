'use client';

/**
 * 前台錯誤邊界。
 *
 * 沒有這支檔案的時候，任何一個 client 端例外都會落到 Next.js 內建的預設畫面
 * ——「Application error: a client-side exception has occurred」，
 * 白底一行英文，玩家不知道發生什麼事、也回不去，我們這邊也拿不到任何線索。
 *
 * 這裡做三件事：
 *   1. 推版造成的 chunk 失效自動重新整理一次（最常見，玩家根本不用看到錯誤畫面）
 *   2. 送 Sentry，帶上路徑與這次部署的 build id
 *   3. 真的要顯示時給一個看得懂的畫面 ＋「重新整理／回首頁」兩條路
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { recoverFromStaleBuild } from '@/lib/staleBuild';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 自動重載那一瞬間先不要畫東西，免得閃一下錯誤畫面
  const [reloading, setReloading] = useState(true);

  useEffect(() => {
    if (recoverFromStaleBuild(error)) return;   // 這行之後畫面就要換掉了
    setReloading(false);
    Sentry.captureException(error, {
      tags: { boundary: 'app-error', app: 'frontend' },
      extra: {
        digest: error.digest,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        buildId: process.env.NEXT_PUBLIC_BUILD_ID,
      },
    });
  }, [error]);

  if (reloading) return null;

  return (
    <div className="min-h-[calc(100dvh-57px)] bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center px-6 pb-[calc(4rem+env(safe-area-inset-bottom))] text-center transition-colors">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">這一頁出了點狀況</h2>
      <p className="text-neutral-500 dark:text-neutral-400 mb-8 max-w-md leading-relaxed">
        通常重新整理就會恢復。如果一直出現，換個頁面再回來看看，
        你的代幣、獎品與訂單都不會受到影響。
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
        >
          重新整理
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        >
          回首頁
        </Link>
      </div>

      {/* 收起來的技術細節：玩家不會被嚇到，回報問題時截這一段就夠我們定位 */}
      <details className="mt-10 max-w-md w-full text-left">
        <summary className="text-xs text-neutral-400 dark:text-neutral-500 cursor-pointer select-none">
          技術資訊（回報問題時請一併截圖）
        </summary>
        <pre className="mt-2 p-3 rounded-lg bg-neutral-100 dark:bg-neutral-900 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words">
          {error.name}: {error.message}
          {error.digest ? `\ndigest: ${error.digest}` : ''}
          {`\nbuild: ${process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown'}`}
        </pre>
      </details>
    </div>
  );
}
