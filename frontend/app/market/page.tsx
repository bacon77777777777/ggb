'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

export const dynamic = 'force-dynamic';

export default function MarketplacePage() {
  const router = useRouter();
  const { flags, isLoading } = useFeatureFlags();

  useLayoutEffect(() => {
    if (window.innerWidth >= 768) router.replace('/');
  }, []);

  useEffect(() => {
    if (isLoading) return;
    // 兩個功能不再互斥，所以只看自己那一個旗標
    if (flags.market) {
      router.replace('/profile?tab=market');
      return;
    }
    router.replace(flags.exchange ? '/exchange' : '/');
  }, [flags.exchange, flags.market, isLoading, router]);

  return null;
}
