'use client';

/**
 * 商城短影音深連結 /sell/reels/<id>：那支排第一，後面接其餘（分享出去的連結／重新整理都回得來）。
 * id 只在掛載時讀一次：播放中捲動會 replace 網址成目前那支，不能因此重掛整個 feed。
 */
import { useRef } from 'react';
import { useParams } from 'next/navigation';
import { useFeatureGate } from '@/lib/useFeatureGate';
import ReelsFeed from '@/components/sell/reels/ReelsFeed';

export const dynamic = 'force-dynamic';

export default function ReelsDeepLinkPage() {
  useFeatureGate('sell');
  const params = useParams<{ id: string }>();
  const startId = useRef(Number(params?.id) || undefined);
  return <ReelsFeed startId={startId.current} />;
}
