'use client';

/**
 * 下拉更新（PWA + 原生殼）—— 照 Threads（脆）的手感（老闆 2026-08-20 指定，附圖）
 *
 * WKWebView 沒有內建下拉更新（那是 Safari 這個 App 的功能），Capacitor 也沒提供
 * UIRefreshControl。而 App 沒有網址列、沒有重新整理鈕 —— 頁面卡住時這是玩家
 * 唯一的自救方式，所以必須自己做。
 *
 * 跟 Threads 對齊的三件事：
 *   1. **不震動**。原本拉的過程分九段震、滿格再重震一下，每次震動都要叫一次
 *      Taptic Engine，主執行緒被卡住 → 內容位移直接掉幀，「有回饋但畫面在頓」。
 *      Threads 全程無震動，滑起來反而更順。
 *   2. **iOS 原生風格的十二格轉圈**，灰色、沒有白底藥丸也沒有陰影 ——
 *      就是內容上方空出來的那一小塊裡的一顆小轉圈。
 *   3. **內容跟著手指走**，位移用阻尼曲線，愈拉愈沉（這點原本就對，保留）。
 *      放手才決定：未滿格彈回去，滿格才刷新，中途反悔不會誤觸發。
 *
 * 只在 standalone／原生殼啟用：一般瀏覽器有自己的下拉更新，兩套疊在一起會打架。
 */

import { useEffect, useRef } from 'react';

/** 拉到這個距離（未阻尼的原始位移）就算滿格 */
const THRESHOLD = 90;
/** 阻尼後的最大位移，超過就幾乎拉不動了 */
const MAX_PULL = 78;
/** 刷新時內容停在這個位置，讓轉圈看得見 */
const REST_PULL = 56;

/** 十二格轉圈的每一格（iOS UIActivityIndicator 的樣子） */
const SPOKES = Array.from({ length: 12 }, (_, i) => i);

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  const mql = window.matchMedia?.('(display-mode: standalone)');
  const legacy = (navigator as unknown as { standalone?: boolean }).standalone === true;
  // 原生殼（Capacitor）：display-mode 與 navigator.standalone 都不符合，要另外認
  const isNativeShell =
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;
  return Boolean(mql?.matches || legacy || isNativeShell);
}

function isAtTop(): boolean {
  return (document.documentElement.scrollTop ?? 0) <= 0 && (document.body.scrollTop ?? 0) <= 0;
}

/**
 * 觸控起點是否落在會自己捲動的容器裡（橫向輪播、彈層內的清單…）。
 * 不擋掉的話，在那些地方往下滑會同時觸發下拉更新。
 */
function startedInScrollable(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight && el.scrollTop > 0) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

export default function PwaPullToRefresh() {
  const startY = useRef(0);
  const pulling = useRef(false);
  const armed = useRef(false);      // 已滿格
  const refreshing = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!isStandaloneMode()) return;

    // 內容區才位移。整個 body 動的話 position:fixed 的導航列與底部操作欄
    // 會因為 transform 產生新的 containing block 而跟著跑掉
    const content = document.querySelector('main') as HTMLElement | null;

    const setShift = (px: number, animate: boolean) => {
      const wrap = wrapRef.current;
      const t = animate ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none';
      if (content) {
        content.style.transition = t;
        content.style.transform = px ? `translate3d(0, ${px}px, 0)` : '';
        content.style.willChange = px ? 'transform' : '';
      }
      if (wrap) {
        wrap.style.transition = t;
        wrap.style.transform = `translate3d(-50%, ${px}px, 0)`;
        wrap.style.opacity = px > 4 ? '1' : '0';
      }
    };

    const reset = (animate = true) => {
      pulling.current = false;
      armed.current = false;
      setShift(0, animate);
      if (iconRef.current) iconRef.current.style.transform = '';
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing.current || e.touches.length !== 1) return;
      if (!isAtTop() || startedInScrollable(e.target)) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
      armed.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing.current) return;
      const dy = e.touches[0].clientY - startY.current;

      // 往上滑或已經捲離頂端 → 交還給正常捲動
      if (dy <= 0 || !isAtTop()) {
        if (dy <= 0) reset(false);
        return;
      }

      // 阻尼：愈拉愈沉，逼近 MAX_PULL 但到不了
      const shift = MAX_PULL * (1 - Math.exp(-dy / MAX_PULL));
      const progress = Math.min(dy / THRESHOLD, 1);

      setShift(shift, false);
      if (iconRef.current) {
        // 轉一圈剛好對應滿格；十二格的關係，轉起來是一格一格跳的，跟 iOS 一樣
        iconRef.current.style.transform = `rotate(${Math.round(progress * 12) * 30}deg)`;
        // 拉得愈深愈清楚 —— 未滿格是淡的，滿格才是完整的深度
        iconRef.current.style.opacity = String(0.3 + progress * 0.7);
      }

      // 滿格只改變外觀，不震動（Threads 全程無觸覺回饋）
      if (!armed.current && progress >= 1) armed.current = true;
    };

    const onEnd = () => {
      if (!pulling.current || refreshing.current) return;
      pulling.current = false;

      if (!armed.current) {
        reset();
        return;
      }

      // 滿格：停在看得見的位置轉圈，然後刷新
      refreshing.current = true;
      setShift(REST_PULL, true);
      if (iconRef.current) iconRef.current.style.opacity = '1';
      iconRef.current?.classList.add('ptr-spin');
      window.setTimeout(() => window.location.reload(), 320);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', () => reset(), { passive: true });

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      if (content) {
        content.style.transform = '';
        content.style.transition = '';
        content.style.willChange = '';
      }
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      style={{
        position: 'fixed',
        top: -34,
        left: '50%',
        transform: 'translate3d(-50%, 0, 0)',
        opacity: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {/*
        十二格轉圈，沒有底板。原本包了一顆白色藥丸＋陰影，在深色模式下是一塊
        突兀的白點；Threads 就是內容上方一顆灰色小轉圈，深淺色都不用管。
        用 SVG 畫而不是文字符號：`↻` 那類箭頭不在中文字型的 unicode-range 內，
        會掉到 system-ui，部分 WebKit 環境畫成 .notdef 豆腐方塊。
      */}
      <svg
        ref={iconRef}
        width="22" height="22" viewBox="0 0 24 24"
        style={{ display: 'block', opacity: 0.3, transition: 'opacity .1s' }}
      >
        {SPOKES.map((i) => (
          <rect
            key={i}
            x="11.1" y="2.2" width="1.8" height="6" rx="0.9"
            fill="currentColor"
            className="text-neutral-400 dark:text-neutral-500"
            opacity={0.28 + (i / SPOKES.length) * 0.72}
            transform={`rotate(${i * 30} 12 12)`}
          />
        ))}
      </svg>
    </div>
  );
}
