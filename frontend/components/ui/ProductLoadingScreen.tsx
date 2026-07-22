'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ip.svg: 1774×887, 4 characters in a single horizontal row.
// Each cell: 443.5 wide × 887 tall (portrait, ~1:2 ratio).
// Columns: [gumball|bunny|penguin|bear] at x 0, 443, 886, 1329.
const CHAR_CELL_W = 443.5;
const SVG_W = 1774;
const SVG_H = 887;

// Display one character at DISP_W wide; scale uniformly.
const DISP_W = 170;
const SCALE = DISP_W / CHAR_CELL_W;          // ≈ 0.383
const DISP_H = Math.round(SVG_H * SCALE);    // ≈ 340 (show full character)
const SHOW_H = 260;                           // clip bottom a bit, keep head+body

const BG_W = Math.round(SVG_W * SCALE);      // ≈ 680
const BG_H = Math.round(SVG_H * SCALE);      // ≈ 340

// backgroundPosition offsets (shift image left to reveal each column)
const CHARS = [
  `0px 0px`,                      // 轉蛋機
  `-${DISP_W}px 0px`,             // 兔兔
  `-${DISP_W * 2}px 0px`,         // 企鵝
  `-${DISP_W * 3}px 0px`,         // 小熊
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

        {/* Float wrapper — character bobs up and down while visible */}
        <motion.div
          style={{ width: DISP_W, height: SHOW_H, position: 'relative', overflow: 'hidden' }}
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
                backgroundPosition: CHARS[idx],
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
