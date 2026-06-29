'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function PathnameKeyed({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const pe = e as unknown as PageTransitionEvent;
      if (typeof (pe as PageTransitionEvent).persisted === 'boolean' && (pe as PageTransitionEvent).persisted) {
        setVersion((v) => v + 1);
        // Ensure RSC segments refresh when returning via bfcache
        try {
          router.refresh();
        } catch {
          // no-op
        }
      }
    };
    window.addEventListener('pageshow', handler);

    // const visibilityHandler = () => {
    //   if (document.visibilityState === 'visible') {
    //     router.refresh();
    //   }
    // };
    // document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      window.removeEventListener('pageshow', handler);
      // document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [router]);

  return <div key={`${pathname}-${version}`}>{children}</div>;
}
