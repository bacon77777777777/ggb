'use client';

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
 * 跟下拉更新的關係：它是 fixed、不在被拖的內容裡。
 *   - 拖 <main> 的頁（文章、邀請、簽到）：外層帶 Tailwind 的 `.fixed`，
 *     PwaPullToRefresh 的 pinnedBars() 會把它當頂列反向定住（透明、不影響空隙起點）
 *   - 拖標記區塊／內層子節點的頁（會員、活動頁）：掛在被拖的那批外面，本來就不動
 * 層級 z-10：壓在內容上、壓在各頁的返回／分享鈕（z-20／z-60）底下。
 */
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
  const tintBg =
    tint === 'light'
      ? 'linear-gradient(to bottom, rgba(255,255,255,.85) 0%, rgba(255,255,255,.45) 45%, rgba(255,255,255,0) 100%)'
      : tint === 'dark'
        ? 'linear-gradient(to bottom, rgba(0,0,0,.5) 0%, rgba(0,0,0,.24) 45%, rgba(0,0,0,0) 100%)'
        : undefined;

  return (
    <div
      aria-hidden
      className={cn('ggb-top-fade fixed top-0 left-0 right-0 z-10 pointer-events-none', className)}
      style={{ height }}
    >
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          maskImage: maskStrong,
          WebkitMaskImage: maskStrong,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
          maskImage: maskSoft,
          WebkitMaskImage: maskSoft,
          background: tintBg,
        }}
      />
    </div>
  );
}

export default TopFadeBlur;
