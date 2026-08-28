'use client';
import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { asset } from '@/lib/asset';

/**
 * 8 隻 IP 角色，160×180 的 WebP（渲染尺寸 80×90 的 2 倍圖）
 *
 * 原本是 484×543 的 SVG，每張 93~207 個 path、37~68 KB，八張加起來 431 KB。
 * 問題在於這是**載入畫面**：`RouteTransition` 每次換頁都會掛它，等於玩家每次
 * 導頁都要先下載幾百 KB 的等待動畫，跟它正在等的內容搶頻寬 —— 載入畫面自己
 * 拖慢了載入。而且那個精細度只渲染成 80×90 px，完全看不出來。
 *
 * 改成對應尺寸的點陣圖後 431 KB → 82 KB，畫面上看不出差別。
 * 要換角色圖的話：放 SVG 原稿進 backend/.tmp，用 sharp density 600 + resize
 * 160×180 + webp q90 輸出，不要直接把 SVG 丟進來。
 */
const CHARS = [
  asset('/loading/1.webp'), // 轉蛋機
  asset('/loading/2.webp'), // 兔兔
  asset('/loading/3.webp'), // 柴犬
  asset('/loading/4.webp'), // 恐龍
  asset('/loading/5.webp'), // 企鵝
  asset('/loading/6.webp'), // 小熊
  asset('/loading/7.webp'), // 貴賓狗
  asset('/loading/8.webp'), // 貓咪
];

const W = 80;
const H = Math.round(W * 543 / 484); // ≈ 90, maintain aspect ratio

/*
 * 換角色的動作＝下拉更新那顆轉蛋球的彈跳（老闆 2026-08-29「複製過來」）。
 * 數值直接照抄 globals.css 的 `@keyframes ptr-toss`：
 * 往上拋 → 落地壓扁 → 回彈兩次到停住，transform-origin 壓在底部才有「踩到地」的感覺。
 * 一輪 1 秒，所以換角色的節奏也從 400ms 拉成 1 秒 —— 拋到一半就換人會看不出是同一顆在跳。
 */
const TOSS_TIMES = [0, 0.28, 0.46, 0.54, 0.68, 0.8, 0.86, 0.93, 1];
const TOSS = {
  y:      [0, -30, 6, 2, -12, 6, 3, -4, 0],
  scaleY: [1, 1, 0.78, 1, 1, 0.88, 1, 1, 1],
  scaleX: [1, 1, 1.18, 1, 1, 1.1, 1, 1, 1],
};
const TOSS_MS = 1000;

/** 拋到最高點的時間（TOSS_TIMES 的第二格）—— 換角色就換在這一刻 */
const APEX_MS = TOSS_MS * TOSS_TIMES[1];

export function ProductLoadingScreen() {
  const [idx, setIdx] = useState(0);
  const reduceMotion = useReducedMotion();

  /*
   * 換角色換在**拋到最高點**那一瞬間，不是落地站定的時候。
   * 站著換等於「原地被抽換」；在最高點換才讀得成「跳起來、落地變成另一隻」，
   * 而且那一格移動最快，硬切也看不出接縫。
   */
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const first = setTimeout(() => {
      setIdx(i => (i + 1) % CHARS.length);
      interval = setInterval(() => setIdx(i => (i + 1) % CHARS.length), TOSS_MS);
    }, APEX_MS);
    return () => { clearTimeout(first); if (interval) clearInterval(interval); };
  }, []);

  // 只預載「下一隻」。八張一次抓完會在慢速網路上跟真正的內容搶頻寬，
  // 一張都不預載則每 400ms 換角色時會閃一下空白 —— 只抓下一張是折衷。
  useEffect(() => {
    const img = new Image();
    img.src = CHARS[(idx + 1) % CHARS.length];
  }, [idx]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-6">

        {/* 角色：每隻自己跳一輪轉蛋球的彈跳，跳完換下一隻。
            不用 AnimatePresence 交叉淡出 —— 那會讓「落地」那一瞬間同時有兩隻在畫面上，
            看起來像疊影；key 換掉直接重跑一輪反而乾淨。 */}
        <div style={{ width: W, height: H, position: 'relative' }}>
          {/* 動畫不綁 key：跳的是「同一顆」，只是空中換了裡面的角色。
              綁 key 會讓每次換人都從頭重跑，變成「跳一下、停、再跳一下」 */}
          <motion.img
            src={CHARS[idx]}
            width={W}
            height={H}
            alt=""
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%', objectFit: 'contain',
              transformOrigin: 'center bottom',
            }}
            initial={reduceMotion ? false : { y: 0, scaleY: 1, scaleX: 1 }}
            animate={reduceMotion ? { y: 0 } : TOSS}
            transition={reduceMotion ? { duration: 0 } : {
              duration: TOSS_MS / 1000,
              times: TOSS_TIMES,
              ease: [0.3, 0.2, 0.4, 1],
              repeat: Infinity,
            }}
          />
        </div>

        <motion.span
          className="text-xs font-black tracking-widest text-neutral-400 dark:text-neutral-500"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          載入中
        </motion.span>

      </div>
    </div>
  );
}
