'use client';

import { useEffect } from 'react';

/**
 * 全站擋掉圖片的長按／右鍵原生選單（老闆 2026-09-01：「不然 App 裡操作會有破綻」）
 *
 * iOS 的部分由 CSS 處理（`globals.css` 的 `-webkit-touch-callout: none`），
 * 但 **Android 與桌機走的是 `contextmenu` 事件，CSS 擋不到** —— 那條在這裡。
 * 兩邊是同一件事的兩半，改一邊要看另一邊。
 *
 * ── 三個刻意的決定 ────────────────────────────────────────────
 *
 * 1. **只擋圖片與 canvas，不是整頁。** 整頁擋掉右鍵，桌機使用者連「在新分頁
 *    開啟連結」都做不了 —— 為了擋圖而拿掉整個右鍵不划算。
 *
 * 2. **掛在 document 上而不是逐個元件加 handler。** 站上圖片散在幾十個元件裡，
 *    逐個加一定會漏；而且新寫的元件不會記得加。一個 capture 階段的監聽器
 *    涵蓋所有現在與未來的圖。
 *
 * 3. **不影響曬圖與邀請圖的分享／下載。** 那兩個走按鈕
 *    （`navigator.share({ files })`／`a.download`），本來就不靠玩家長按存圖。
 */
export default function ImageLongPressGuard() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      // 圖片本身，或圖片被包在只有背景圖的容器裡（例如卡包輪播的 WebGL 畫布）
      if (tag === 'IMG' || tag === 'CANVAS' || el.closest?.('img, canvas')) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  return null;
}
