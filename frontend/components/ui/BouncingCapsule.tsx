'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * 彈跳的轉蛋球 —— 全站等待動畫的唯一長相（老闆 2026-08-30）
 *
 * 球就是下拉更新那顆：純 CSS（`.ptr-ball`，定義在 globals.css，主題色上蓋＋
 * 細縫線＋白色下蓋），所以後台換主題色它會跟著變，而且**零圖片、零網路請求**
 * —— 等待畫面本來就不該跟正在等的內容搶頻寬。
 *
 * ⚠️ 站上原本有兩套等待動畫：這顆球，以及八隻 IP 角色輪播（`/loading/1~8.webp`）。
 * 老闆 2026-08-29 先把主要的 ProductLoadingScreen 換成球，但角色版還散在
 * 儲值頁、註冊頁、驗算頁、籤號選擇、抽卡演出、活動頁裡；2026-08-30 全部收斂到這裡。
 * 圖檔沒有刪，之後想用還在，但沒有任何畫面在載它們了。
 */

/* 彈跳數值直接照抄 globals.css 的 `@keyframes ptr-toss`：
   往上拋 → 落地壓扁 → 回彈兩次到停住。
   transform-origin 壓在底部，壓扁才會像「踩到地」而不是整顆縮小。 */
const TOSS_TIMES = [0, 0.28, 0.46, 0.54, 0.68, 0.8, 0.86, 0.93, 1];
const TOSS_SEC = 1;

export function BouncingCapsule({ size = 40 }: { size?: number }) {
  const reduceMotion = useReducedMotion();
  // 拋起的高度跟著球徑縮放，小顆的球不需要跳那麼高
  const k = size / 40;
  const toss = {
    y:      [0, -30 * k, 6 * k, 2 * k, -12 * k, 6 * k, 3 * k, -4 * k, 0],
    scaleY: [1, 1, 0.78, 1, 1, 0.88, 1, 1, 1],
    scaleX: [1, 1, 1.18, 1, 1, 1.1, 1, 1, 1],
  };

  return (
    /* 球貼齊容器底部＝它的「地面」，壓扁時才不會浮在半空 */
    <div style={{ width: size, height: size + 40 * k, display: 'flex', alignItems: 'flex-end' }}>
      <motion.div
        className="ptr-ball"
        style={{ width: size, height: size, transformOrigin: 'center bottom' }}
        initial={reduceMotion ? false : { y: 0, scaleY: 1, scaleX: 1 }}
        animate={reduceMotion ? { y: 0 } : toss}
        transition={reduceMotion ? { duration: 0 } : {
          duration: TOSS_SEC,
          times: TOSS_TIMES,
          ease: [0.3, 0.2, 0.4, 1],
          repeat: Infinity,
        }}
      />
    </div>
  );
}
