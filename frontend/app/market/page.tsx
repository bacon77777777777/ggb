'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

export const dynamic = 'force-dynamic';

export default function MarketplacePage() {
  const router = useRouter();
  const { flags, isLoading } = useFeatureFlags();

  useEffect(() => {
    if (isLoading) return;
    if (flags.market && !flags.exchange) {
      router.replace('/profile?tab=market');
      return;
    }
    router.replace('/exchange');
  }, [flags.exchange, flags.market, isLoading, router]);

  return null;
}
