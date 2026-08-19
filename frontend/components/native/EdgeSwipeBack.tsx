'use client';

/**
 * iOS 左緣側滑返回。
 *
 * 為什麼不用原生手勢：WKWebView 的 allowsBackForwardNavigationGestures
 * 沒有被 Capacitor 的設定檔暴露出來，要改 Swift 加上 storyboard 綁定，
 * 而那段我沒有實機可以驗證。
 *
 * Android 不需要：有實體／手勢返回鍵，已在 NativeAppBootstrap 處理。
 *
 * 起點嚴格限制在左緣 24px 內 —— 卡包輪播、reels 那些水平滑動都在畫面中段，
 * 不會被誤判。同時要求水平位移大於垂直，避免斜著滑動時誤觸發。
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { native } from '@/lib/native/bridge';

const EDGE_PX = 24;
const TRIGGER_PX = 80;

export default function EdgeSwipeBack() {
  const router = useRouter();

  useEffect(() => {
    if (!native.isNativePlatform()) return;
    if (native.nativePlatform() !== 'ios') return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      tracking = t.clientX <= EDGE_PX;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      // 垂直分量比較大就是在捲頁，放掉
      if (dy > Math.abs(dx)) {
        tracking = false;
        return;
      }
      if (dx > TRIGGER_PX) {
        tracking = false;
        // 沒有上一頁就別動 —— 那時候 back() 會把人帶出 App
        if (window.history.length > 1) router.back();
      }
    };

    const stop = () => {
      tracking = false;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', stop, { passive: true });
    document.addEventListener('touchcancel', stop, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', stop);
      document.removeEventListener('touchcancel', stop);
    };
  }, [router]);

  return null;
}
