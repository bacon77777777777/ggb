'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function LegacyShopRedirectPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    if (!params?.id) return;
    router.replace(`/item/${params.id}`);
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <p className="text-sm font-black text-neutral-400 uppercase tracking-widest">
        正在為您重新導向至商品頁面...
      </p>
    </div>
  );
}

