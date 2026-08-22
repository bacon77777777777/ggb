'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * 全站客戶端資料快取（TanStack Query）—— 老闆 2026-08-22 頁面加載優化 ③
 *
 * 用法不是整頁改寫成 useQuery，而是 `lib/swr.ts` 的 swrLoad()：
 * 頁面進來先把快取裡的資料套上畫面（零延遲、不閃骨架屏），同時背景重抓、到了再換。
 * 新鮮度窗口 FRESH_MS（5 秒）內不重抓 —— 這是給「按下就預取」用的：
 * touchstart 先抓、300ms 後頁面掛載不會再打一次。超過 5 秒一律重抓，資料不會舊。
 *
 * 下拉更新（PathnameKeyed 收到 ggb:content-refresh）會 invalidate 全部，強制重抓。
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
