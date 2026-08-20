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
 *   2. **只有內容區被拖，所有「釘在頂端」的東西都不動**。
 *      位移下在 `<main>`，頂部導航（`<nav>`，`<main>` 的兄弟節點）與底部導航
 *      本來就不受影響；但 `<main>` **裡面**那些已經貼在頂端的 sticky 列
 *      （情報頁的分類 tab、首頁的分類列…）會被 `<main>` 的位移帶著走，
 *      所以要對它們下一個等量的反向位移抵銷掉 —— 視覺上就是釘住不動
 *      （老闆 2026-08-20：「tab 不要跟著被拉下去，這樣體感不好」）。
 *   3. **轉圈出現在內容上方那道空隙裡**，不是畫面最上緣。
 *      起始位置是「所有釘住的東西的最下緣」，動態量出來的 ——
 *      寫死 57px 的話，情報頁那種底下還有一排 tab 的版面就會被蓋住。
 *      空隙鋪一層底色（`stripRef`）：淺色頁鋪灰（body 是白的，轉圈浮在白上
 *      看起來像破了一塊 —— 老闆 2026-08-20 附圖），深色頁（排行榜）取頁面
 *      自己的底色，不會出現一條突兀的灰。
 *   3b. 版面特殊的頁面（排行榜：tab 絕對定位在一塊 overflow-hidden 的縮放畫布裡）
 *      可以下 `data-ptr-content` 宣告「只拖這一塊」—— 那一頁改成位移這個元素，
 *      tab、背景、返回鈕全都原地不動。
 *      ⚠️ 不要試圖用反向位移去定住畫布裡的元素：位移會把它推出畫布的
 *      overflow-hidden 邊界，直接被裁掉（2026-08-20 試過，老闆截圖回報
 *      「狂人跟魔人被黑黑的遮住」）。
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
 * 全站導航列（`<main>` 外面那條）的下緣，沒有就是 0。
 *
 * 為什麼要量而不是寫死 57：導航列在部分頁面是隱藏的，安全區內縮也可能讓它下移。
 */
function navBottom(): number {
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
 * `<main>` 裡面**此刻正貼在頂端**的 sticky／fixed 列（情報頁分類 tab、
 * 首頁分類列…）。這些要跟導航列一樣定住，不能被 `<main>` 的位移帶著走。
 *
 * 判斷標準是「上緣已經頂到導航列下方」——沒頂到的（例如首頁分類列在輪播圖
 * 底下、離頂端還很遠）就不算釘住，跟著內容一起被拖才是對的，FB／脆也是這樣。
 *
 * 用 class 選擇器先粗篩再看 computed position：整棵 `<main>` 逐一 querySelectorAll
 * 在長頁面上太貴，而這站的 sticky 一律是 Tailwind 的 `.sticky` / `.fixed`。
 * 最後濾掉巢狀的子孫 —— 父層已經被抵銷，子層再抵銷一次會多跑一段。
 */
function pinnedBars(top: number): HTMLElement[] {
  const main = document.querySelector('main');
  if (!main) return [];
  const found: HTMLElement[] = [];
  main.querySelectorAll<HTMLElement>('.sticky, .fixed').forEach((el) => {
    const pos = window.getComputedStyle(el).position;
    if (pos !== 'sticky' && pos !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.height > window.innerHeight * 0.4) return; // 太高的不是頂欄
    if (r.top <= top + 2) found.push(el);
  });
  return found.filter((el, i) => found.indexOf(el) === i && !found.some((o) => o !== el && o.contains(el)));
}

/**
 * 空隙的底色：看「被拖的區塊坐在什麼底上」——往它的祖先找第一個不透明背景。
 *
 * 底夠白（一般頁面）→ 鋪淡灰 `#e8e8e8`（#f5f5f5 在白 tab 旁看起來就是另一塊白）；
 * 底本來就深（排行榜的 #232429）→ 沿用那個深色，鋪灰會變成一條突兀的亮帶。
 *
 * ⚠️ 不可用 elementFromPoint 對「空隙位置的內容」採樣 —— 那會採到剛好排在
 * 頁面頂端的內容（情報頁採到輪播圖的黑，整條空隙跟著變黑）。
 * 底色屬於「框」，跟頁面的底走，不跟內容走。
 */
function stripColor(from: HTMLElement | null): string {
  const fallback = document.documentElement.classList.contains('dark') ? '#171717' : '#e8e8e8';
  let el = from?.parentElement ?? null;
  while (el && el !== document.documentElement) {
    const bg = window.getComputedStyle(el).backgroundColor;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
    if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) {
      const luma = (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255;
      return luma > 0.8 ? fallback : bg;
    }
    el = el.parentElement;
  }
  return fallback;
}

/** 元素身上的縮放倍率（排行榜畫布是 scale() 過的） */
function scaleOf(el: HTMLElement): number {
  const h = el.offsetHeight;
  if (!h) return 1;
  return el.getBoundingClientRect().height / h || 1;
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
  /** 這一趟要「定住」的 sticky 列，連同原本的 inline transform（結束要還原） */
  const pinned = useRef<{ el: HTMLElement; transform: string }[]>([]);
  /** 這一趟實際被拖的元素們：預設 [<main>]；頁面下了 data-ptr-content 就只拖那幾塊。
      scale：縮放畫布（排行榜）裡的元素，位移會被父層 scale() 放大，要先除回去 */
  const dragEls = useRef<{ el: HTMLElement; scale: number }[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /** 空隙底色帶的頂端（= 導航列下緣），高度蓋到 gapTop + 位移量 */
  const stripTop = useRef(0);
  const gapTop = useRef(0);
  const iconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!isStandaloneMode()) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const setShift = (px: number, animate: boolean) => {
      const wrap = wrapRef.current;
      const t = animate ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none';
      dragEls.current.forEach(({ el, scale }) => {
        el.style.transition = t;
        el.style.transform = px ? `translate3d(0, ${px / scale}px, 0)` : '';
        el.style.willChange = px ? 'transform' : '';
      });
      /*
       * 釘在頂端的 sticky 列：下一個等量的反向位移，抵銷掉 `<main>` 的位移。
       * 它們是 `<main>` 的子孫，會繼承那個 transform；不抵銷的話 tab 會跟著
       * 被拉下去，空隙開在 tab 上面 —— 老闆說那個體感不對，正確的是
       * 「框（含 tab）不動，只有底下的內容被拖」。
       */
      pinned.current.forEach(({ el, transform }) => {
        el.style.transition = t;
        el.style.transform = px ? `${transform} translate3d(0, ${-px}px, 0)`.trim() : transform;
      });
      if (stripRef.current) {
        // 底色帶從導航列下緣鋪到位移的最底 —— 蓋住透明 tab 背後露出來的 body，
        // 也讓空隙裡的轉圈有底色可以坐
        stripRef.current.style.height = px ? `${gapTop.current - stripTop.current + px}px` : '0px';
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
      // 位移歸零之後才能清空清單，不然那幾條會停在被抵銷的位置
      const restore = pinned.current;
      pinned.current = [];
      window.setTimeout(() => {
        restore.forEach(({ el, transform }) => {
          // 已經被下一趟接手的就別動，不然會把進行中的抵銷清掉
          if (pinned.current.some((p) => p.el === el)) return;
          el.style.transform = transform;
          el.style.transition = '';
        });
      }, animate ? 300 : 0);
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

        /*
         * 這一趟要拖誰、定住哪幾條、空隙從哪裡開始 —— 都在這一刻量。
         *
         * 頁面下了 data-ptr-content（排行榜）就只拖那一塊：tab、背景、返回鈕
         * 全在它外面，自然不動，也不需要任何反向位移。沒下的走預設：拖整個
         * <main>，把已貼頂的 sticky 列反向抵銷。
         */
        const main = document.querySelector('main') as HTMLElement | null;
        const marked = main ? Array.from(main.querySelectorAll<HTMLElement>('[data-ptr-content]')) : [];

        if (marked.length) {
          // 只拖被標記的區塊：其餘（tab、背景、返回鈕）原地不動，不需要任何抵銷。
          // 空隙開在被拖區塊的最上緣；版面特殊（排行榜的榜單 grid 起點其實在
          // 畫布最上緣，tab 都是絕對定位不佔流）可另下 data-ptr-gap 指定
          // 「空隙從這個元素的上緣開」。
          dragEls.current = marked.map((el) => ({ el, scale: scaleOf(el) }));
          pinned.current = [];
          const gapEl = main?.querySelector<HTMLElement>('[data-ptr-gap]') ?? null;
          gapTop.current = Math.max(
            0,
            gapEl
              ? gapEl.getBoundingClientRect().top
              : Math.min(...marked.map((el) => el.getBoundingClientRect().top)),
          );
        } else {
          dragEls.current = main ? [{ el: main, scale: 1 }] : [];
          const top = navBottom();
          pinned.current = pinnedBars(top).map((el) => ({
            el,
            transform: el.style.transform || '',
          }));
          /*
           * 空隙從「不透明的頂欄」下緣開始。透明的浮動鈕（文章內頁、排行榜的
           * 返回鈕：pointer-events-none 的整寬 wrapper，背景全透明）雖然也要
           * 定住，但它是「浮在內容上」不是「壓著內容的欄」—— 拿它的下緣當
           * 空隙起點，轉圈會被推到空隙外面，看起來就是沒有轉圈
           * （老闆 2026-08-20：「文章內頁下拉缺失圖標」）。
           */
          gapTop.current = pinned.current.reduce((acc, { el }) => {
            const bg = window.getComputedStyle(el).backgroundColor;
            const transparent = bg === 'transparent' || /rgba\(.+,\s*0\)$/.test(bg);
            return transparent ? acc : Math.max(acc, el.getBoundingClientRect().bottom);
          }, top);
        }
        stripTop.current = marked.length ? gapTop.current : navBottom();
        if (wrapRef.current) wrapRef.current.style.top = `${gapTop.current}px`;
        if (stripRef.current) {
          stripRef.current.style.top = `${stripTop.current}px`;
          stripRef.current.style.background = stripColor(dragEls.current[0]?.el ?? null);
        }
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
      dragEls.current.forEach(({ el }) => {
        el.style.transform = '';
        el.style.transition = '';
        el.style.willChange = '';
      });
      pinned.current.forEach(({ el, transform }) => {
        el.style.transform = transform;
        el.style.transition = '';
      });
      pinned.current = [];
    };
  }, []);

  return (
    <>
    {/*
      空隙的底色帶：fixed、排在 <main> 之前，所以畫在內容底下、body 背景上面。
      淺色頁是灰的（老闆指定：轉圈要坐在灰底上，不是一塊白的），
      深色頁取頁面自己的底色。高度跟著位移走，沒在拉的時候是 0。
    */}
    <div
      ref={stripRef}
      aria-hidden
      style={{ position: 'fixed', left: 0, right: 0, top: 0, height: 0, zIndex: 0, pointerEvents: 'none' }}
    />
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
    </>
  );
}
