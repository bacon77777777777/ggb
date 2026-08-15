'use client';

/**
 * 商城短影音 /sell/reels（第 0 期原型）—— 從第一支開始。
 * 指定從哪一支開始走 /sell/reels/<id>；兩條路由都渲染同一個 ReelsFeed。
 */
import { useFeatureGate } from '@/lib/useFeatureGate';
import ReelsFeed from '@/components/sell/reels/ReelsFeed';

export const dynamic = 'force-dynamic';

export default function ReelsPage() {
  useFeatureGate('sell');
  return <ReelsFeed />;
}
