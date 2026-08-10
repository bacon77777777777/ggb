'use client';

import { Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { TicketSelectionFlow } from '@/components/shop/TicketSelectionFlow';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

function ItemSelectTicketInner() {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const router = useRouter();
  // ?trial=1 → 試試看：跳過選籤直接進撕紙，不扣款
  const isTrial = useSearchParams().get('trial') === '1';

  return (
    <div className="min-h-screen relative bg-neutral-900 flex items-center justify-center md:fixed md:inset-0 md:z-[100]">
      {isDesktop && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <Image 
            src="/images/gacha_bg.png" 
            alt="" 
            fill
            className="object-cover filter brightness-[0.85] blur-[3px] scale-105"
            unoptimized
          />
          <div className="absolute inset-0 bg-neutral-900/50" />
        </div>
      )}

      <div className={cn(
        'relative z-10 w-full',
        isDesktop ? 'px-4 flex items-center justify-center h-screen' : 'min-h-screen'
      )}>
        {isDesktop && (
          <div 
            className="absolute inset-0 bg-black/50" 
            onClick={() => router.back()}
          />
        )}

        <div
          className={cn(
            'transition-all duration-300',
            isDesktop ? 'relative z-20 w-full max-w-[640px]' : 'w-full min-h-screen'
          )}
        >
          <TicketSelectionFlow
            isModal={isDesktop}
            trial={isTrial}
          />
        </div>
      </div>
    </div>
  );
}

// useSearchParams 需要 Suspense 邊界（Next 靜態產生時會抱怨）
export default function ItemSelectTicketPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-900" />}>
      <ItemSelectTicketInner />
    </Suspense>
  );
}
