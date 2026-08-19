'use client';

/**
 * App 裡的外部連結一律改用 in-app browser 開啟。
 *
 * 為什麼用全域攔截而不是逐個改 `target="_blank"`：
 * 站上有六處靜態的，但公告內文的 linkify 還會**動態產生**連結，
 * 逐個改一定會漏，而且以後新增的連結又要再記一次。
 * 在 document 上攔一次，所有情況（含未來新增的）一起處理。
 *
 * 不處理的話，外部網站會在主 webview 開啟 —— 那裡沒有網址列也沒有返回鍵，
 * 使用者就被困在白畫面出不來了。
 */

import { useEffect } from 'react';
import { native } from '@/lib/native/bridge';
import { openExternal } from '@/lib/native/browser';

export default function ExternalLinkHandler() {
  useEffect(() => {
    if (!native.isNativePlatform()) return;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;
      // 這些讓瀏覽器／系統自己處理：錨點、電話、信箱、下載
      if (href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:')) return;
      if (anchor.hasAttribute('download')) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      // 站內連結交給 Next.js router，不要攔
      if (url.origin === window.location.origin) return;

      e.preventDefault();
      void openExternal(url.href);
    };

    // capture 階段：要趕在 next/link 之類的處理器之前攔下來
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
