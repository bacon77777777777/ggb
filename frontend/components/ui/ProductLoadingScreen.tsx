'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ip.svg: 1774×887, left half (x 0-887) contains 4 chars in a 2×2 grid.
// Each cell is 443.5×443.5 (square). Layout:
//   [gumball | bunny  ]  y 0-443
//   [penguin | bear   ]  y 443-887
// Right half (x 887-1774) has additional characters we don't use here.
const CELL = 443.5;          // square cell size in SVG units
const DISP = 220;            // display size per character (square)
const SCALE = DISP / CELL;   // ≈ 0.496

const BG_W = Math.round(1774 * SCALE); // 880 — full sprite scaled
const BG_H = Math.round(887 * SCALE);  // 440

// [col, row] → background-position offset (shifts the full sprite to crop one cell)
const CHARS = [
  { bgPos: `0px 0px` },                   // gumball  (col 0, row 0)
  { bgPos: `-${DISP}px 0px` },            // bunny    (col 1, row 0)
  { bgPos: `0px -${DISP}px` },            // penguin  (col 0, row 1)
  { bgPos: `-${DISP}px -${DISP}px` },     // bear     (col 1, row 1)
];

export function ProductLoadingScreen() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % CHARS.length), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-5">

        {/* Float wrapper — character bobs while visible */}
        <motion.div
          style={{ width: DISP, height: DISP, position: 'relative', overflow: 'hidden' }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              style={{
                position: 'absolute',
                inset: 0,
                transformOrigin: 'center bottom',
                backgroundImage: 'url(/loading/ip.svg)',
                backgroundSize: `${BG_W}px ${BG_H}px`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: CHARS[idx].bgPos,
              }}
              initial={{ scaleY: 0.06, scaleX: 1.6 }}
              animate={{ scaleY: 1, scaleX: 1 }}
              exit={{ scaleY: 0.06, scaleX: 1.6 }}
              transition={{
                scaleY: { type: 'spring', stiffness: 320, damping: 18 },
                scaleX: { type: 'spring', stiffness: 320, damping: 18 },
              }}
            />
          </AnimatePresence>
        </motion.div>

        {/* Text + bouncing dots */}
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

        {/* Character indicators */}
        <div className="flex gap-2">
          {CHARS.map((_, i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{ width: 6, height: 6 }}
              animate={{
                backgroundColor: i === idx ? '#f97316' : '#d4d4d4',
                scale: i === idx ? 1.3 : 1,
              }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
