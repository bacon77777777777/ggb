'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lastSentRef = useRef<string>('');

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    if (!baseUrl) return;
    if (!pathname) return;

    const qs = typeof window !== 'undefined' ? window.location.search || '' : '';
    const pagePath = qs ? `${pathname}${qs}` : pathname;
    if (pagePath === lastSentRef.current) return;
    lastSentRef.current = pagePath;

    const payload = {
      page_path: pagePath,
      user_id: user?.id || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      metadata: {
        referrer: typeof document !== 'undefined' ? document.referrer : null,
      },
    };

    try {
      void fetch(`${baseUrl}/api/stats/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
    }
  }, [pathname, user?.id]);

  return null;
}
