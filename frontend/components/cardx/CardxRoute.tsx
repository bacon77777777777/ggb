'use client';

/**
 * 只有 cardx 才有的路由（/packs、/leaderboard、/missions、/trades…）：
 * 1024 以上畫 cardx 的頁；1024 以下這些頁不存在（769～1023 走手機端版型），直接回首頁。
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CardxPage, { type CardxPageKey } from './CardxPage';

export default function CardxRoute({ page }: { page: CardxPageKey }) {
  const router = useRouter();
  useEffect(() => {
    if (window.innerWidth < 1024) router.replace('/');
  }, [router]);
  return <CardxPage page={page} />;
}
