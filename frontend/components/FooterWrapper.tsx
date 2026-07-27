'use client';

import { usePathname } from 'next/navigation';
import Footer from './Footer';

export default function FooterWrapper() {
  const pathname = usePathname();
  if (pathname.startsWith('/events/')) return null;
  return (
    <div className="hidden md:block">
      <Footer />
    </div>
  );
}
