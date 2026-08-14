'use client';

import '../market.css';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useFeatureGate } from '@/lib/useFeatureGate';
import MarketTabBar from '@/components/sell/MarketTabBar';
import PayoutSettingsContent from '@/components/sell/PayoutSettingsContent';

/*
 * 收款設定 的獨立路由。
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
          <ChevronLeft className="w-7 h-7 stroke-[2.5]" />
        </button>
        <h1 className="flex-1">收款設定</h1>
      </div>

      <PayoutSettingsContent onDone={() => router.push('/sell/manage')} />

      <MarketTabBar active="me" />
    </div>
  );
}
