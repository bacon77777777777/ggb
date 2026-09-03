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
import { Button } from '@/components/ui';
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

  /*
   * 版面跟 404 頁（app/not-found.tsx）同一套（老闆 2026-09-03：原本那版體感不好）：
   * 大字淡色的 Oops 當視覺錨點、標題、一句說明、同一顆 Button。
   * 高度算法也照 404：100dvh 扣 Navbar 57px、再留底部導航的 pb，內容才會置中。
   * 錯誤頁跟 404 差在多一顆「重新整理」（reset 會重新掛載這段路由，多半就好了）。
   */
  return (
    <div className="min-h-[calc(100dvh-57px)] bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] text-center transition-colors">
      <h1 className="text-9xl font-bold text-primary/20">Oops</h1>
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mt-4 mb-2">這一頁出了點狀況</h2>
      <p className="text-neutral-500 dark:text-neutral-400 mb-8 max-w-md">
        通常重新整理就會恢復。你的代幣、獎品與訂單都不會受到影響。
      </p>
      <div className="flex items-center gap-3">
        <Button size="lg" onClick={() => reset()}>重新整理</Button>
        <Link href="/">
          <Button size="lg" variant="secondary">回首頁</Button>
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
