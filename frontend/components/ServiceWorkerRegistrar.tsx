'use client';

/**
 * 註冊 PWA service worker（public/sw.js）。
 *
 * 只在 production 註冊：dev server 的 chunk 每次都在變，
 * 被 SW 快取住會出現「改了程式畫面沒動」的假象。
 */

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').then(
        (reg) => {
          // 有新版就叫它直接接手，不用等所有分頁關掉
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                sw.postMessage('SKIP_WAITING');
              }
            });
          });
        },
        () => {
          /* 註冊失敗不影響網站運作，靜默即可 */
        }
      );
    };

    // 等頁面載完再註冊，不跟首屏搶頻寬
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
