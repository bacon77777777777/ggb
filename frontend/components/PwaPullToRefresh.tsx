'use client';

import { useEffect, useRef } from 'react';

const THRESHOLD = 72; // px to pull before refresh triggers
const MAX_PULL   = 96; // px cap on visual pull distance

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  const mql = window.matchMedia?.('(display-mode: standalone)');
  const legacy = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mql?.matches || legacy);
}

function isAtTop(): boolean {
  return (document.documentElement.scrollTop ?? 0) === 0
    && (document.body.scrollTop ?? 0) === 0;
}

export default function PwaPullToRefresh() {
  const startYRef    = useRef(0);
  const pullingRef   = useRef(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const spinnerRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isStandaloneMode()) return;

    const show = (pullY: number) => {
      const ratio = Math.min(pullY / THRESHOLD, 1);
      const translate = Math.min(pullY * 0.6, MAX_PULL);
      const el = indicatorRef.current;
      if (!el) return;
      el.style.transform = `translateY(${translate}px)`;
      el.style.opacity   = String(ratio);
      if (spinnerRef.current) {
        spinnerRef.current.style.transform = `rotate(${pullY * 2}deg)`;
      }
    };

    const hide = () => {
      const el = indicatorRef.current;
      if (!el) return;
      el.style.transform = '';
      el.style.opacity   = '0';
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!isAtTop()) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) show(dy);
      else pullingRef.current = false;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const dy = e.changedTouches[0].clientY - startYRef.current;
      hide();
      if (dy >= THRESHOLD) {
        window.location.reload();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove',  onTouchMove,  { passive: true });
    document.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove',  onTouchMove);
      document.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);

  return (
    <div
      ref={indicatorRef}
      style={{
        position:       'fixed',
        top:            -48,
        left:           '50%',
        transform:      'translateX(-50%)',
        opacity:        0,
        zIndex:         9999,
        pointerEvents:  'none',
        transition:     'opacity 0.1s',
        // don't animate transform during drag — only on release
      }}
    >
      <div
        style={{
          width:        40,
          height:       40,
          borderRadius: '50%',
          background:   'white',
          boxShadow:    '0 2px 8px rgba(0,0,0,0.18)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          fontSize:     20,
        }}
      >
        <div
          ref={spinnerRef}
          style={{ display: 'inline-block', lineHeight: 1 }}
        >
          ↻
        </div>
      </div>
    </div>
  );
}
