'use client';

/**
 * 下拉更新（PWA + 原生殼）
 *
 * WKWebView 沒有內建下拉更新（那是 Safari 這個 App 的功能），Capacitor 也沒提供
 * UIRefreshControl。而 App 沒有網址列、沒有重新整理鈕 —— 頁面卡住時這是玩家
 * 唯一的自救方式，所以必須自己做，而且要做得像原生。
 *
 * 三件事讓它有「原生感」：
 *   1. **內容跟著手指走**，不是只有一個圖示在飄。位移用阻尼曲線，
 *      愈拉愈沉，手感跟 iOS 的橡皮筋一致。
 *   2. **震動蓄力**：拉的過程分段觸發輕震，間距愈往後愈密（加速感），
 *      滿格時給一下明顯較重的，玩家不用看畫面就知道「可以放手了」。
 *   3. **放手才決定**：未滿格彈回去，滿格才刷新 —— 中途反悔不會誤觸發。
 *
 * 只在 standalone／原生殼啟用：一般瀏覽器有自己的下拉更新，兩套疊在一起會打架。
 */

import { useEffect, useRef } from 'react';
import { hapticLight, hapticMedium } from '@/lib/haptics';

/** 拉到這個距離（未阻尼的原始位移）就算滿格 */
const THRESHOLD = 90;
/** 阻尼後的最大位移，超過就幾乎拉不動了 */
const MAX_PULL = 78;
/** 刷新時內容停在這個位置，讓轉圈看得見 */
const REST_PULL = 56;

/**
 * 蓄力的震動節點（progress 0~1）。
 * 間距刻意由疏到密 —— 等距的話手感是平的，密起來才有「快滿了」的感覺。
 */
const HAPTIC_STOPS = [0.18, 0.34, 0.48, 0.6, 0.7, 0.78, 0.85, 0.91, 0.96];

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
  const stopIdx = useRef(0);        // 下一個要觸發的震動節點
  const refreshing = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!isStandaloneMode()) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
      stopIdx.current = 0;
      setShift(0, animate);
      if (iconRef.current) iconRef.current.style.transform = '';
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing.current || e.touches.length !== 1) return;
      if (!isAtTop() || startedInScrollable(e.target)) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
      armed.current = false;
      stopIdx.current = 0;
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
        // 轉一圈剛好對應滿格，滿格後不再轉，改由「已就緒」的樣式表達
        iconRef.current.style.transform = `rotate(${progress * 360}deg)`;
        iconRef.current.style.opacity = String(0.35 + progress * 0.65);
      }

      if (reduceMotion) return;

      // 蓄力：跨過一個節點震一下，間距愈後面愈密
      while (stopIdx.current < HAPTIC_STOPS.length && progress >= HAPTIC_STOPS[stopIdx.current]) {
        stopIdx.current++;
        hapticLight();
      }
      // 滿格：給一下明顯較重的，玩家不用看畫面就知道可以放手
      if (!armed.current && progress >= 1) {
        armed.current = true;
        hapticMedium();
      }
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
        top: -46,
        left: '50%',
        transform: 'translate3d(-50%, 0, 0)',
        opacity: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.96)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.16)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/*
          用 SVG 不用文字符號：原本畫的是 `↻`（U+21BB），它落在箭頭區、
          不在中文字型的 unicode-range 內，會掉到 system-ui ——
          而那個字型在部分 WebKit 環境會把缺字畫成 .notdef 方塊，
          玩家看到的是一個豆腐 ☐ 而不是箭頭。
        */}
        <svg
          ref={iconRef}
          width="19" height="19" viewBox="0 0 24 24" fill="none"
          stroke="#404040" strokeWidth="2.4" strokeLinecap="round"
          style={{ display: 'block', transition: 'opacity .1s' }}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </div>
    </div>
  );
}
