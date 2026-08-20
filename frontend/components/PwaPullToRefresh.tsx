'use client';

/**
 * 下拉更新（PWA + 原生殼）—— 照 FB／Threads（脆）那套（老闆 2026-08-20 指定）
 *
 * WKWebView 沒有內建下拉更新（那是 Safari 這個 App 的功能），Capacitor 也沒提供
 * UIRefreshControl。而 App 沒有網址列、沒有重新整理鈕 —— 頁面卡住時這是玩家
 * 唯一的自救方式，所以必須自己做。
 *
 * 四條規則，缺一個手感就不對：
 *
 *   1. **先有安全距離，才開始有反應**（`DEAD_ZONE`）。
 *      手指往下移不到 18px 之前，畫面完全不動、也不震 —— 不然滑一下清單、
 *      手指抖一下都在震，還可能誤刷新（老闆回報）。跨過安全距離之後，位移是從
 *      **跨過的那一點**重新算，所以不會「啪」地跳一段。
 *   2. **只有內容區被拖**。位移下在 `<main>`，頂部導航（`<nav>`，`<main>` 的
 *      兄弟節點）與底部導航完全不動 —— 跟 FB／脆一樣，框不動、內容動。
 *   3. **轉圈出現在內容上方那道空隙裡**，不是畫面最上緣。
 *      起始位置是「目前貼在畫面頂端那條導航列的下緣」，動態量出來的 ——
 *      寫死 57px 的話，情報頁那種底下還有一排 tab 的版面就會被蓋住。
 *   4. **蓄力才刷新**。未滿格彈回去，滿格才刷新；過程分段輕震、間距愈往後愈密，
 *      滿格給一下明顯較重的，不用看畫面就知道可以放手了。
 *
 * 只在 standalone／原生殼啟用：一般瀏覽器有自己的下拉更新，兩套疊在一起會打架。
 */

import { useEffect, useRef } from 'react';
import { hapticLight, hapticMedium } from '@/lib/haptics';

/**
 * 安全距離：手指要先往下移這麼多，這支才開始接管。
 *
 * 太小（<10px）擋不住誤觸，太大（>30px）會覺得「拉不動」。
 * 18px 大約是一根手指無意識抖動的幅度上限。
 */
const DEAD_ZONE = 18;
/** 跨過安全距離之後，再拉這個距離（未阻尼的原始位移）就算滿格 */
const THRESHOLD = 90;
/** 阻尼後的最大位移，超過就幾乎拉不動了 */
const MAX_PULL = 78;
/** 刷新時內容停在這個位置，讓轉圈看得見 */
const REST_PULL = 56;
/** 轉圈直徑。原本 22，老闆要求放大 20% */
const ICON = 26;

/**
 * 蓄力的震動節點（progress 0~1）。
 * 間距刻意由疏到密 —— 等距的話手感是平的，密起來才有「快滿了」的感覺。
 */
const HAPTIC_STOPS = [0.18, 0.34, 0.48, 0.6, 0.7, 0.78, 0.85, 0.91, 0.96];

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
 * 目前貼在畫面最上緣那條導航列的下緣（沒有就是 0）。
 *
 * 為什麼要量而不是寫死 57：導航列在部分頁面是隱藏的，安全區內縮也可能讓它下移。
 * 量出來的值就是「內容區的起點」，轉圈放在這裡才不會蓋到任何東西。
 *
 * 只認 `<nav>`／`<header>` 這種真正的導航容器，而且要 sticky／fixed 且正好貼在
 * 頂端。內容裡那些 sticky 的 tab 列不算 —— 它們在 `<main>` 裡，會跟著內容一起被
 * 拖下去，空隙就開在它們上面，本來就不會被蓋到。
 */
function headerBottom(): number {
  let bottom = 0;
  document.querySelectorAll('nav, header').forEach((el) => {
    const pos = window.getComputedStyle(el).position;
    if (pos !== 'sticky' && pos !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.top <= 1 && r.bottom > bottom) bottom = r.bottom;
  });
  return bottom;
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
  const startX = useRef(0);
  const tracking = useRef(false);   // 手指按著、起點合格，但還沒跨過安全距離
  const engaged = useRef(false);    // 已跨過安全距離，開始接管
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
        // 轉圈停在空隙的正中間：空隙高度是 px，轉圈高 ICON
        wrap.style.transition = animate ? `${t}, opacity .2s` : 'opacity .2s';
        wrap.style.transform = `translate3d(-50%, ${(px - ICON) / 2}px, 0)`;
        // 空隙還塞不下轉圈之前先不要露臉，不然會看到半顆卡在導航列邊上
        wrap.style.opacity = px > ICON * 0.7 ? '1' : '0';
      }
    };

    const reset = (animate = true) => {
      tracking.current = false;
      engaged.current = false;
      armed.current = false;
      stopIdx.current = 0;
      setShift(0, animate);
      if (iconRef.current) iconRef.current.style.transform = '';
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing.current || e.touches.length !== 1) return;
      if (!isAtTop() || startedInScrollable(e.target)) return;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      tracking.current = true;
      engaged.current = false;
      armed.current = false;
      stopIdx.current = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current || refreshing.current) return;
      const raw = e.touches[0].clientY - startY.current;
      const dx = Math.abs(e.touches[0].clientX - startX.current);

      // 往上滑或已經捲離頂端 → 交還給正常捲動
      if (raw <= 0 || !isAtTop()) {
        if (raw <= 0) reset(false);
        return;
      }

      if (!engaged.current) {
        // 還在安全距離內：畫面不動、也不震，這一下讓瀏覽器自己處理
        if (raw < DEAD_ZONE) return;
        // 橫向分量比較大就是在滑輪播／切頁籤，整趟放掉
        if (dx > raw) {
          tracking.current = false;
          return;
        }
        engaged.current = true;
        // 從跨過安全距離的那一點重新起算，畫面才不會「啪」地跳一段
        startY.current += DEAD_ZONE;
        // 空隙開在內容區上方，位置動態量（見 headerBottom）
        if (wrapRef.current) wrapRef.current.style.top = `${headerBottom()}px`;
      }

      const dy = raw - DEAD_ZONE;
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
      if (!tracking.current || refreshing.current) return;
      tracking.current = false;

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
        // 起始值只是預設，實際位置在手指跨過安全距離時才量（見 headerBottom）
        top: 0,
        left: '50%',
        transform: `translate3d(-50%, ${-ICON}px, 0)`,
        opacity: 0,
        // 比導航列（z-50）低：轉圈屬於內容區，不該蓋在框上面
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      {/*
        十二格轉圈，沒有底板。原本包了一顆白色藥丸＋陰影，在深色模式下是一塊
        突兀的白點；FB／脆就是內容上方一顆灰色小轉圈，深淺色都不用管。
        用 SVG 畫而不是文字符號：`↻` 那類箭頭不在中文字型的 unicode-range 內，
        會掉到 system-ui，部分 WebKit 環境畫成 .notdef 豆腐方塊。
      */}
      <svg
        ref={iconRef}
        width={ICON} height={ICON} viewBox="0 0 24 24"
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
