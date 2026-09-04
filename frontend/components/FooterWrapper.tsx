'use client';

import { usePathname } from 'next/navigation';
import Footer from './Footer';
import { isCardxRoute } from '@/lib/cardxRoutes';

export default function FooterWrapper() {
  const pathname = usePathname();
  if (pathname.startsWith('/events/')) return null;
  // 768 以上換 cardx 的頁面時頁尾也是它的（它自己有）；這個頁尾本來就只在 md 以上顯示，直接不畫
  if (isCardxRoute(pathname)) return null;
  return (
    <div className="hidden md:block">
      <Footer />
    </div>
  );
}
