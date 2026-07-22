'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 8 individual IP character SVGs, each 484×543 (viewBox)
const CHARS = [
  '/loading/1.svg', // 轉蛋機
  '/loading/2.svg', // 兔兔
  '/loading/3.svg', // 柴犬
  '/loading/4.svg', // 恐龍
  '/loading/5.svg', // 企鵝
  '/loading/6.svg', // 小熊
  '/loading/7.svg', // 貴賓狗
  '/loading/8.svg', // 貓咪
];

const W = 80;
const H = Math.round(W * 543 / 484); // ≈ 90, maintain aspect ratio

export function ProductLoadingScreen() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % CHARS.length), 200);
    return () => clearInterval(t);
  }, []);

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
              transition={{ duration: 0.08, ease: 'easeOut' }}
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

        {/* Loading text + bouncing dots */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black tracking-widest text-neutral-400 dark:text-neutral-500">
            載入商品中
          </span>
          <div className="flex gap-[3px] items-end pb-0.5">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-[5px] h-[5px] rounded-full bg-neutral-300 dark:bg-neutral-600"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 0.65, delay: i * 0.13, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
