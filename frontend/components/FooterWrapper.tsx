'use client';

import { usePathname } from 'next/navigation';
import Footer from './Footer';
import { isCardxRoute } from '@/lib/cardxRoutes';

export default function FooterWrapper() {
  const pathname = usePathname();
  if (pathname.startsWith('/events/')) return null;
  /* cardx 的頁面自己有頁尾（AppShell 裡的 CardxFooter），但那是 1024 以上才出現的外殼。
     769～1023 走的是手機端版型，頁尾要由這裡畫 —— 所以 cardx 路由只在 md～lg 這一段顯示。 */
  const cardx = isCardxRoute(pathname);
  return (
    <div className={cardx ? 'hidden' : 'hidden md:block'}>
      <Footer />
    </div>
  );
}
