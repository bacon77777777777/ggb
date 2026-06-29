'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function RegisterRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/login?view=register');
  }, [router]);

  return (
    <div className="min-h-screen flex justify-center items-center bg-white dark:bg-neutral-950">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
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
