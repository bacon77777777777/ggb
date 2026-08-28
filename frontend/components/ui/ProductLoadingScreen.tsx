'use client';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * 全站等待畫面 —— 一顆轉蛋球在原地彈跳（老闆 2026-08-29）
 *
 * 球就是下拉更新那顆：純 CSS，主題色上蓋＋細縫線＋白色下蓋（`.ptr-ball`，
 * 定義在 globals.css），所以後台換主題色它會跟著變，也沒有任何圖片要下載。
 *
 * ⚠️ 這裡原本是八隻 IP 角色輪播（`/loading/1~8.webp`）。老闆 2026-08-29 指定
 * 「不要角色了，就只要轉蛋跳」。圖檔沒有刪 —— 之後想換回去或別處要用還在，
 * 但這支不再載它們，等待畫面從此零圖片、零網路請求（它自己就不該跟正在等的
 * 內容搶頻寬）。
 */

/*
 * 彈跳的數值直接照抄 globals.css 的 `@keyframes ptr-toss`：
 * 往上拋 → 落地壓扁 → 回彈兩次到停住。
 * transform-origin 壓在底部，壓扁才會像「踩到地」而不是整顆縮小。
 */
const TOSS_TIMES = [0, 0.28, 0.46, 0.54, 0.68, 0.8, 0.86, 0.93, 1];
const TOSS = {
  y:      [0, -30, 6, 2, -12, 6, 3, -4, 0],
  scaleY: [1, 1, 0.78, 1, 1, 0.88, 1, 1, 1],
  scaleX: [1, 1, 1.18, 1, 1, 1.1, 1, 1, 1],
};
const TOSS_SEC = 1;

/** 球徑。下拉更新那顆是 20px（那裡格子小），滿版等待畫面放大一點，
 *  但老闆 2026-08-29 說再縮一點 —— 56 太搶戲，40 剛好 */
const BALL = 40;
/** 拋起的高度＋落地壓扁需要的空間，讓球有地方跳而不會被裁到 */
const BOX_H = BALL + 40;

export function ProductLoadingScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-6">

        {/* 球貼齊容器底部＝它的「地面」，壓扁時才不會浮在半空 */}
        <div style={{ width: BALL, height: BOX_H, display: 'flex', alignItems: 'flex-end' }}>
          <motion.div
            className="ptr-ball"
            style={{ width: BALL, height: BALL, transformOrigin: 'center bottom' }}
            initial={reduceMotion ? false : { y: 0, scaleY: 1, scaleX: 1 }}
            animate={reduceMotion ? { y: 0 } : TOSS}
            transition={reduceMotion ? { duration: 0 } : {
              duration: TOSS_SEC,
              times: TOSS_TIMES,
              ease: [0.3, 0.2, 0.4, 1],
              repeat: Infinity,
            }}
          />
        </div>

        <motion.span
          className="text-xs font-black tracking-widest text-neutral-400 dark:text-neutral-500"
          animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          載入中
        </motion.span>

      </div>
    </div>
  );
}
