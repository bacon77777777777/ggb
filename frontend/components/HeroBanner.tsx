
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

interface Banner {
  id: string;
  image: string;
  link: string;
}

const DEFAULT_BANNER: Banner = {
  id: '__default__',
  image: '/images/banner_defaulet.png',
  link: '#',
};

export default function HeroBanner({ banners }: { banners: Banner[] }) {
  const items = banners.length > 0 ? banners : [DEFAULT_BANNER];
  const [current, setCurrent] = useState(0);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);
  const minSwipeDistance = 50;

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [items.length]);

  const next = () => setCurrent((prev) => (prev + 1) % items.length);
  const prev = () => setCurrent((prev) => (prev - 1 + items.length) % items.length);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      next();
    }
    if (isRightSwipe) {
      prev();
    }
  };

  return (
    <div 
      className="relative w-full aspect-[3/1] bg-neutral-100 overflow-hidden rounded-none md:rounded-[8px] group mx-0"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {items.map((banner, index) => (
        <div
          key={banner.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === current ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <Link href={banner.link} className="block w-full h-full relative">
            <Image
              src={brokenIds.has(banner.id) || !banner.image ? '/images/banner_defaulet.png' : banner.image}
              alt="Banner"
              fill
              className="object-fill select-none"
              draggable={false}
              unoptimized
              onError={() => setBrokenIds(prev => new Set(prev).add(banner.id))}
            />
          </Link>
        </div>
      ))}

      {/* Controls */}
      <button
        onClick={prev}
        className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-white/20 text-white hover:bg-white/40 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 items-center justify-center border border-white/20 active:scale-90"
      >
        <ChevronLeft className="w-6 h-6 stroke-[3]" />
      </button>
      <button
        onClick={next}
        className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-white/20 text-white hover:bg-white/40 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 items-center justify-center border border-white/20 active:scale-90"
      >
        <ChevronRight className="w-6 h-6 stroke-[3]" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-3">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrent(index)}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              index === current ? 'w-8 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
