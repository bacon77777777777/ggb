'use client';

import { useEffect, useState } from 'react';

/**
 * 讀根元素（<html>）上某個 CSS 變數的像素值，並在它變動時重新渲染。
 *
 * 站上有幾個元件用「往 documentElement.style 寫變數」互相通知版面
 * （警語列的 `--promo-notice-h`、底欄的 `--bottom-nav-shift`…）。CSS 那邊靠 calc()
 * 自然就跟著動，但要在 **React 邏輯**裡依它判斷（例如「警語列在不在畫面上」），
 * 就得監看 style 屬性的變動 —— 這裡用 MutationObserver 盯 <html> 的 style。
 *
 * 變數不存在或不是像素值時回 0。
 */
export function useRootCssVarPx(name: string): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const raw = root.style.getPropertyValue(name).trim();
      const n = parseFloat(raw);
      setValue(Number.isFinite(n) ? n : 0);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ['style'] });
    return () => mo.disconnect();
  }, [name]);

  return value;
}
