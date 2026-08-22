'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export function ProductLoadingScreen() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % CHARS.length), 400);
    return () => clearInterval(t);
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

        {/* Character */}
        <div style={{ width: W, height: H, position: 'relative' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              style={{ position: 'absolute', inset: 0 }}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
            >
              {/* gentle float while visible */}
              <motion.img
                src={CHARS[idx]}
                width={W}
                height={H}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          </AnimatePresence>
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
