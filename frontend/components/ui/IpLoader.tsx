'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { asset } from '@/lib/asset';

const CHARS = [
  asset('/loading/1.webp'),asset('/loading/2.webp'),asset('/loading/3.webp'),asset('/loading/4.webp'),
  asset('/loading/5.webp'),asset('/loading/6.webp'),asset('/loading/7.webp'),asset('/loading/8.webp'),
];

interface IpLoaderProps {
  dark?: boolean;      // 暗色背景用 white/60 文字
  size?: 'sm' | 'md'; // sm=48×54, md=80×90（預設）
}

export function IpLoader({ dark = false, size = 'md' }: IpLoaderProps) {
  const [idx, setIdx] = useState(0);
  const w = size === 'sm' ? 48 : 80;
  const h = size === 'sm' ? 54 : 90;

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % CHARS.length), 400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ width: w, height: h, position: 'relative' }}>
        <AnimatePresence mode="wait">
          <motion.img
            key={idx}
            src={CHARS[idx]}
            width={w}
            height={h}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          />
        </AnimatePresence>
      </div>
      <motion.span
        className={`text-xs font-black tracking-widest ${dark ? 'text-white/60' : 'text-neutral-400 dark:text-neutral-500'}`}
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        載入中
      </motion.span>
    </div>
  );
}
