'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GachaLoader } from '@/components/ui/GachaLoader';

function RegisterRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const invite = searchParams.get('invite');
    // 登入與註冊已合併成一頁，view=register 不再存在；邀請碼照帶
    const target = invite ? `/login?invite=${invite}` : '/login';
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex justify-center items-center bg-white dark:bg-neutral-950">
      <GachaLoader />
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
