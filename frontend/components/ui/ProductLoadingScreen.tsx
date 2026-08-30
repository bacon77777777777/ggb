'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { BouncingCapsule } from './BouncingCapsule';

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

export function ProductLoadingScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-6">
        {/* 球徑 40：老闆 2026-08-29 說 56 太搶戲 */}
        <BouncingCapsule size={40} />
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
