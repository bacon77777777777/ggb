'use client';

import '../market.css';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useFeatureGate } from '@/lib/useFeatureGate';
import SellFormContent from '@/components/sell/SellFormContent';

/*
 * 我要上架的獨立路由。
 *
 * 站內動線走「我的」頁的彈層（照原型），這條路由是深連結用的殼；
 * 內容與彈層共用 SellFormContent，兩邊各寫一份遲早會不一致。
 * 這頁不放底部導航 —— 填表單時把四格導航擺在下面容易誤觸。
 */

export const dynamic = 'force-dynamic';

export default function Page() {
  useFeatureGate('sell');
  const router = useRouter();

  return (
    <div className="mk min-h-screen pb-6">
      <div className="hdr plain sticky top-0 z-40 flex items-center gap-2">
        <button type="button" onClick={() => router.back()} aria-label="返回">
          <ChevronLeft className="w-7 h-7 stroke-[2.5]" />
        </button>
        <h1 className="flex-1">我要上架</h1>
      </div>

      <SellFormContent onDone={() => router.push('/sell/manage')} />
    </div>
  );
}
