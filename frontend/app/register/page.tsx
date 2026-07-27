'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { IpLoader } from '@/components/ui/IpLoader';

function RegisterRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const invite = searchParams.get('invite');
    const target = invite
      ? `/login?view=register&invite=${invite}`
      : '/login?view=register';
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex justify-center items-center bg-white dark:bg-neutral-950">
      <IpLoader />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterRedirect />
    </Suspense>
  );
}
