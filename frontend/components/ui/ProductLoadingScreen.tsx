'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ip.svg is a 1774×887 sprite sheet with 4 characters in a 2×2 grid.
// Each cell is 887×443.5 units (2:1 ratio). Below we display at 280×140.
const DISP_W = 280;
const DISP_H = 140;
const BG_SIZE = `${DISP_W * 2}px ${DISP_H * 2}px`; // full sprite at render scale

const CHARS = [
  `0px 0px`,                         // gumball machine (col 0, row 0)
  `-${DISP_W}px 0px`,                // bunny          (col 1, row 0)
  `0px -${DISP_H}px`,               // penguin        (col 0, row 1)
  `-${DISP_W}px -${DISP_H}px`,      // bear           (col 1, row 1)
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

        {/* Float wrapper — gently bobs the whole character area */}
        <motion.div
          style={{ position: 'relative', width: DISP_W, height: DISP_H }}
          animate={{ y: [0, -9, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              style={{
                position: 'absolute',
                inset: 0,
                transformOrigin: 'center bottom',
                backgroundImage: 'url(/loading/ip.svg)',
                backgroundSize: BG_SIZE,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: CHARS[idx],
              }}
              initial={{ scaleY: 0.08, scaleX: 1.55 }}
              animate={{ scaleY: 1, scaleX: 1 }}
              exit={{ scaleY: 0.08, scaleX: 1.55 }}
              transition={{
                scaleY: { type: 'spring', stiffness: 340, damping: 20 },
                scaleX: { type: 'spring', stiffness: 340, damping: 20 },
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

        {/* Character position indicators */}
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
