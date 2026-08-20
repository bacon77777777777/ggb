'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { markContentRefresh } from '@/lib/contentRefresh';

export default function PathnameKeyed({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const pe = e as unknown as PageTransitionEvent;
      if (typeof (pe as PageTransitionEvent).persisted === 'boolean' && (pe as PageTransitionEvent).persisted) {
        setVersion((v) => v + 1);
        // Ensure RSC segments refresh when returning via bfcache
        try {
          router.refresh();
        } catch {
          // no-op
        }
      }
    };
    window.addEventListener('pageshow', handler);

    /*
     * 下拉更新（PwaPullToRefresh）發的事件：只重掛內容區，不整頁 reload。
     * key 一換，<main> 底下的頁面元件整棵重新掛載 → 各頁的抓資料 effect
     * 重跑一次 → 內容換新；Navbar、底部導航、AuthContext 全在這棵樹外面，
     * 原地不動（老闆 2026-08-20：市面 App 都是內容區刷新，框不需要刷）。
     * router.refresh() 順帶把 server component 的部分也換新。
     */
    const refreshHandler = () => {
      // 先標記再重掛：底下的頁面元件要能分辨「這是刷新，不是玩家剛進來」，
      // 首頁彈窗與開屏才不會每刷一次就跳一次
      markContentRefresh();
      setVersion((v) => v + 1);
      try { router.refresh(); } catch { /* no-op */ }
    };
    window.addEventListener('ggb:content-refresh', refreshHandler);

    // const visibilityHandler = () => {
    //   if (document.visibilityState === 'visible') {
    //     router.refresh();
    //   }
    // };
    // document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      window.removeEventListener('pageshow', handler);
      window.removeEventListener('ggb:content-refresh', refreshHandler);
      // document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [router]);

  return <div key={`${pathname}-${version}`}>{children}</div>;
}
