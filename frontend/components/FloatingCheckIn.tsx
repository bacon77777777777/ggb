'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAlert } from '@/components/ui/AlertDialog';

export default function FloatingCheckIn() {
  return (
    <Suspense fallback={null}>
      <FloatingCheckInInner />
    </Suspense>
  );
}

function FloatingCheckInInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab');
  const { showAlert } = useAlert();

  const isSecondaryPage = (pathname !== '/' && pathname !== '/news' && pathname !== '/profile' && pathname !== '/check-in') || (pathname === '/profile' && !!activeTab);

  if (pathname === '/check-in' || (isSecondaryPage)) return null;

  return (
    <Link
      href="/check-in"
      onClick={(event) => {
        event.preventDefault();
        showAlert({
          title: '開發中',
          message: '頁面開發中',
          type: 'info',
        });
      }}
      className={cn(
        "fixed right-0 top-1/2 -translate-y-1/2 z-40 transition-all duration-300 group",
        "flex flex-col items-center justify-center",
        "w-[64px] h-[74px] md:w-[70px] md:h-[80px] lg:w-[80px] lg:h-[90px]",
        "bg-white/90 backdrop-blur-md border-y border-l border-neutral-100 rounded-l-[24px] md:rounded-l-[32px] shadow-2xl",
        "hover:pr-2 hover:w-[74px] md:hover:w-[90px] lg:hover:w-[100px] active:scale-95"
      )}
    >
      <div className="relative">
        <div className="w-9 h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-xl md:rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
          <CalendarCheck className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 stroke-[2.5]" />
        </div>
        {/* Animated Badge */}
        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 md:w-3.5 md:h-3.5 bg-accent-red border-2 border-white rounded-full animate-pulse shadow-sm" />
      </div>
      <span className="mt-1 text-[10px] md:text-[12px] lg:text-[13px] font-black text-neutral-900 uppercase tracking-widest group-hover:text-primary transition-colors">
        每日簽到
      </span>
    </Link>
  );
}
