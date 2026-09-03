'use client';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BouncingCapsule } from './BouncingCapsule';
import { cn } from '@/lib/utils';

/**
 * 機台區塊的載入遮罩（老闆 2026-09-03：進商品頁要快，機台素材還沒到就在上半部蓋黑遮罩、轉蛋在那邊跳）。
 *
 * 以前是整頁藏起來、滿版 ProductLoadingScreen 等機台圖到齊才放行 —— 玩家等的是整頁，
 * 而且抽卡那頁卡包輪播的素材一到才整片一起出現。現在資料一到就先出頁面，
 * 只有機台那塊蓋黑，素材到了淡出（0.3s）。掛在機台容器裡（容器要 position: relative），
 * z-index 壓過機台自己的圖層（各機台最高用到 25 左右）。
 */
export function MachineLoadingOverlay({ show }: { show: boolean }) {
  // 淡出跑完才卸載，不然素材一到遮罩會硬切
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [show]);
  const reduceMotion = useReducedMotion();
  if (!mounted) return null;
  return (
    <div
      aria-hidden
      data-testid="machine-loading"
      className={cn(
        'absolute inset-0 z-[60] flex items-center justify-center bg-black transition-opacity duration-300',
        show ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <div className="flex flex-col items-center gap-5">
        <BouncingCapsule size={40} />
        <motion.span
          className="text-xs font-black tracking-widest text-white/70"
          animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          載入中
        </motion.span>
      </div>
    </div>
  );
}
