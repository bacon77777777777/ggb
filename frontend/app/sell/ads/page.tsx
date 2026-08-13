'use client';

import '../market.css';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useFeatureGate } from '@/lib/useFeatureGate';
import MarketTabBar from '@/components/sell/MarketTabBar';
import AdCenterContent from '@/components/sell/AdCenterContent';

/*
 * 廣告中心 的獨立路由。
 *
 * 站內動線走「我的」頁的彈層（照原型），這條路由只是深連結／分享用的殼，
 * 內容與彈層共用同一個元件 —— 兩邊各寫一份遲早會不一致。
 */

export const dynamic = 'force-dynamic';

export default function Page() {
  useFeatureGate('sell');
  const router = useRouter();

  return (
    <div className="mk min-h-screen pb-[calc(64px+env(safe-area-inset-bottom))]">
      <div className="hdr plain sticky top-0 z-40 flex items-center gap-2">
        <button type="button" onClick={() => router.push('/sell/manage')} aria-label="返回">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1">廣告中心</h1>
      </div>

      <AdCenterContent onDone={() => router.push('/sell/manage')} />

      <MarketTabBar active="me" />
    </div>
  );
}
