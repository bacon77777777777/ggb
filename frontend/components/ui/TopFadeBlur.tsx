'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * 動態島底下的「漸層毛玻璃」—— 全出血頁專用（老闆 2026-08-22）
 *
 * 會員／簽到／文章內頁／活動頁／邀請頁的頂部沒有實色頂欄，內容直接頂到動態島
 * 底下，status bar 的時間、電量會跟內容打架。這層固定在畫面最上緣：
 * 上緣模糊最強，往下逐漸變透明到完全沒有（Threads／IG 那種 progressive blur），
 * 不會出現一條硬邊。
 *
 * 做法：兩層 backdrop-filter 疊起來（強模糊收得早、弱模糊拖到底），各配一條
 * 由黑到透明的 mask —— **漸層是用遮罩做的，不是半透明色塊**。`tint` 另外可以
 * 加一層極淡的同向色漸層：白底頁（文章）純模糊是白糊白看不出來，要帶白；
 * 深色活動頁帶黑；本來就有底色的頁（會員橘、簽到紅、邀請的金色 hero）不帶。
 *
 * 高度 = 安全區 + 尾巴（預設 24px，約 59+24 = 83px）。
 * 只在安全區 > 0 的環境出現：`min(env×100, env+tail)` —— env 是 0 時整個高度
 * 歸零，桌機與一般瀏覽器分頁完全看不到它（同邀請頁 hero 出血裁切的那招）。
 *
 * **強度跟著捲動距離走**（老闆 2026-08-22）：剛進頁面、在頂端時完全沒有（一開始就糊體感很差），
 * 往上捲 RAMP_PX 內線性變強、往回捲同樣變弱、回頂歸零。活動頁 `.lpv` 是內層捲動容器，
 * 所以監聽的是「最近的可捲動祖先」，找不到才聽 window。
 *
 * 跟下拉更新的關係：它是 fixed、不在被拖的內容裡。
 *   - 拖 <main> 的頁（文章、邀請、簽到）：外層帶 Tailwind 的 `.fixed`，
 *     PwaPullToRefresh 的 pinnedBars() 會把它當頂列反向定住（透明、不影響空隙起點）
 *   - 拖標記區塊／內層子節點的頁（會員、活動頁）：掛在被拖的那批外面，本來就不動
 * 層級 z-10：壓在內容上、壓在各頁的返回／分享鈕（z-20／z-60）底下。
 */
/**
 * 模糊強度跟著捲動距離走（老闆 2026-08-22 改法）：頂端 0、往上捲 RAMP_PX 到滿，
 * 往回捲同一條曲線減弱、回到頂端歸零。不是「切換＋淡入淡出」，手指拖多少糊多少，
 * 沒有時機點可以抓。每個 scroll 事件在 rAF 裡直接寫 backdrop-filter，不走 React state。
 */
const RAMP_PX = 64;
/** iOS 毛玻璃配方（滿強度）：模糊 + 飽和度 1.8 + 微對比（iOS 系統 material 的比例） */
const STRONG = { blur: 20, sat: 1.8, con: 1.05 };
const SOFT = { blur: 7, sat: 1.4, con: 1 };
const mix = (from: number, to: number, t: number) => from + (to - from) * t;
const glass = (g: { blur: number; sat: number; con: number }, t: number) =>
  `blur(${mix(0, g.blur, t).toFixed(2)}px) saturate(${mix(1, g.sat, t).toFixed(3)}) contrast(${mix(1, g.con, t).toFixed(3)})`;

export function TopFadeBlur({
  tint = 'none',
  tail = 24,
  className,
}: {
  /** 極淡的同向色漸層：white 給白底頁、dark 給深色頁、none 給本來就有底色的頁 */
  tint?: 'none' | 'light' | 'dark';
  /** 安全區以下再拖多少 px 才完全透明 */
  tail?: number;
  className?: string;
}) {
  const height = `min(calc(env(safe-area-inset-top) * 100), calc(env(safe-area-inset-top) + ${tail}px))`;
  // 強模糊：上緣全開、七成高度前收完；弱模糊：一路拖到底
  const maskStrong = 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,.7) 40%, rgba(0,0,0,0) 72%)';
  const maskSoft = 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,.75) 50%, rgba(0,0,0,0) 100%)';
  const ref = useRef<HTMLDivElement>(null);
  const strongRef = useRef<HTMLDivElement>(null);
  const softRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 最近的可捲動祖先（活動頁的 .lpv：fixed inset-0 + overflow-y auto）；沒有就是 window
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && scroller !== document.body) {
      const oy = window.getComputedStyle(scroller).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const target: HTMLElement | Window = scroller && scroller !== document.body ? scroller : window;
    const read = () => (target === window ? window.scrollY : (target as HTMLElement).scrollTop);
    let raf = 0;
    const paint = () => {
      raf = 0;
      const t = Math.min(1, Math.max(0, read() / RAMP_PX));
      const sStrong = glass(STRONG, t);
      const sSoft = glass(SOFT, t);
      if (strongRef.current) {
        strongRef.current.style.backdropFilter = sStrong;
        strongRef.current.style.setProperty('-webkit-backdrop-filter', sStrong);
      }
      if (softRef.current) {
        softRef.current.style.backdropFilter = sSoft;
        softRef.current.style.setProperty('-webkit-backdrop-filter', sSoft);
        softRef.current.style.opacity = String(t); // 淡色層（若有）跟著強度走
      }
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(paint); };
    paint();
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const tintBg =
    tint === 'light'
      ? 'linear-gradient(to bottom, rgba(255,255,255,.85) 0%, rgba(255,255,255,.45) 45%, rgba(255,255,255,0) 100%)'
      : tint === 'dark'
        ? 'linear-gradient(to bottom, rgba(0,0,0,.5) 0%, rgba(0,0,0,.24) 45%, rgba(0,0,0,0) 100%)'
        : undefined;

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn('ggb-top-fade fixed top-0 left-0 right-0 z-10 pointer-events-none', className)}
      style={{ height }}
    >
      {/* iOS 那種毛玻璃（老闆 2026-08-22）：不是只有糊，還要 saturate 把底下的顏色提上來、
          加一點 contrast 讓玻璃有「厚度」。強層在上緣、弱層拖到底，兩層都走遮罩漸層。 */}
      {/* 兩層的 backdrop-filter 由上面的 effect 依捲動距離即時寫入（初始 0 = 完全沒有） */}
      <div
        ref={strongRef}
        className="absolute inset-0"
        style={{ maskImage: maskStrong, WebkitMaskImage: maskStrong }}
      />
      <div
        ref={softRef}
        className="absolute inset-0"
        style={{ maskImage: maskSoft, WebkitMaskImage: maskSoft, background: tintBg, opacity: 0 }}
      />
    </div>
  );
}

export default TopFadeBlur;
