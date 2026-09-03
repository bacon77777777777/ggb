'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticMedium } from '@/lib/haptics';

/**
 * 抽卡翻牌時畫面中上方跳的「+10,000」（老闆 2026-09-03）
 *
 * 純體感：數字是第三方行情（遊々亭日圓標價 × 0.22）換算的參考值，**不帶單位、不是回收價**，
 * 抽卡規則頁有寫明。<100 不跳（30 円的卡換出來是 5，每張都跳就沒感覺了）。
 *
 * 分級（老闆核准）：<1,000 小字白；≥1,000 大字白；≥5,000 金色帶光暈；≥20,000 金色＋震動。
 * 數字用滾動（0 → N）給它一點時間感，之後上飄淡出。
 *
 * 用法：<MarketValuePop value={n} trigger={key} />，trigger 一換就重新跳一次（同一張卡不重跳）。
 */
export const MARKET_POP_MIN = 100;

/**
 * 本地開發用假值（老闆 2026-09-03：本地要看得到效果，照賞等給）。dev server 上不看行情，
 * 直接依這張卡的賞等對到四個分級：A賞／SSR → 26,000（金色＋震動）、B賞／SR → 8,800（金色）、
 * C賞／R → 1,500（大字白）、其他 → 350（小字白）。正式環境（NODE_ENV=production）照真實行情。
 */
const DEV_FAKE = process.env.NODE_ENV !== 'production';
const devValueFor = (grade?: string | null) => {
  const g = String(grade ?? '').toUpperCase();
  if (g.includes('SSR') || g.includes('A賞') || g.includes('超稀有') || g.includes('最後賞')) return 26000;
  if (g.includes('SR') || g.includes('B賞')) return 8800;
  if (g.includes('R') || g.includes('C賞') || g.includes('稀有')) return 1500;
  return 350;
};

export default function MarketValuePop({ value, trigger, grade }: { value: number | null | undefined; trigger: string | number | null; grade?: string | null }) {
  const [shot, setShot] = useState<{ key: string; value: number } | null>(null);

  useEffect(() => {
    if (trigger === null || trigger === undefined) return;
    const v = DEV_FAKE ? devValueFor(grade) : value;
    if (typeof v !== 'number' || v < MARKET_POP_MIN) return;
    setShot({ key: String(trigger), value: v });
    if (v >= 20000) hapticMedium();
    const t = setTimeout(() => setShot(s => (s?.key === String(trigger) ? null : s)), 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, value]);

  return (
    <AnimatePresence>
      {shot && (
        <motion.div
          key={shot.key}
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+18%)] z-[1300] flex justify-center"
          initial={{ opacity: 0, y: 16, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          data-testid="market-value-pop"
        >
          <CountUp value={shot.value} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now(); const dur = value >= 5000 ? 900 : 550;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(Math.round(value * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const tier = value >= 20000 ? 'legend' : value >= 5000 ? 'gold' : value >= 1000 ? 'big' : 'small';
  return (
    <span
      className={cn(
        'font-amount font-black tabular-nums tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]',
        tier === 'small' && 'text-[28px] text-white',
        tier === 'big' && 'text-[40px] text-white',
        tier === 'gold' && 'text-[46px] text-[#ffd54a] drop-shadow-[0_0_18px_rgba(255,200,60,0.85)]',
        tier === 'legend' && 'text-[56px] text-[#ffd54a] drop-shadow-[0_0_28px_rgba(255,200,60,1)] animate-pulse',
      )}
    >
      +{n.toLocaleString()}
    </span>
  );
}
