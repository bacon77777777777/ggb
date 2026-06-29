'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  const mql = window.matchMedia?.('(display-mode: standalone)');
  const legacy = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mql?.matches || legacy);
}

function getFocusableAtPoint(x: number, y: number) {
  if (typeof document === 'undefined') return null;
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el;
  }
  const closest = el.closest?.('input, textarea, select, [contenteditable="true"]');
  if (closest instanceof HTMLElement) return closest;
  return null;
}

export default function PwaInputFocusFix() {
  const pathname = usePathname();

  const enabled = useMemo(() => {
    if (!isIos()) return false;
    if (!isStandaloneMode()) return false;
    return pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/update-password';
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;

    const onTouchEndCapture = (e: TouchEvent) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const t = e.changedTouches[0];
      const target = getFocusableAtPoint(t.clientX, t.clientY);
      if (!target) return;

      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (target.disabled || target.readOnly) return;
      }
      if (target instanceof HTMLSelectElement) {
        if (target.disabled) return;
      }

      requestAnimationFrame(() => {
        try {
          (target as HTMLElement).focus({ preventScroll: true } as FocusOptions);
        } catch {
          try {
            (target as HTMLElement).focus();
          } catch {}
        }
      });
    };

    const onClickCapture = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el) return;
      const focusable = el.closest?.('input, textarea, select, [contenteditable="true"]');
      if (!(focusable instanceof HTMLElement)) return;

      requestAnimationFrame(() => {
        try {
          focusable.focus({ preventScroll: true } as FocusOptions);
        } catch {
          try {
            focusable.focus();
          } catch {}
        }
      });
    };

    window.addEventListener('touchend', onTouchEndCapture, { capture: true });
    window.addEventListener('click', onClickCapture, { capture: true });
    return () => {
      window.removeEventListener('touchend', onTouchEndCapture, true);
      window.removeEventListener('click', onClickCapture, true);
    };
  }, [enabled]);

  return null;
}
