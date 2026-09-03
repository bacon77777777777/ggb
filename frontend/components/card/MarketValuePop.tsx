'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticMedium } from '@/lib/haptics';
import { isSoundMuted } from '@/lib/soundPrefs';

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
 * 進帳音（老闆 2026-09-03：要有進帳的聲音）。音效庫沒有現成的收銀機／金幣聲，
 * 這裡用 WebAudio 合成：先一聲金屬「叮」（兩個高頻正弦快速衰減＋一點噪音當敲擊），
 * 接著一串金幣叮噹（高頻短音、音高微亂數），等級越高金幣越多聲：
 * <1,000 兩聲、≥1,000 四聲、≥5,000 七聲、≥20,000 十聲。吃全站靜音鈕（lib/soundPrefs）。
 * AudioContext 只建一顆、每次用前 resume（iOS 要在手勢裡才能出聲，翻牌本來就是點的）。
 */
let audioCtx: AudioContext | null = null;
function playCashIn(value: number) {
  if (typeof window === 'undefined' || isSoundMuted()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const master = ctx.createGain(); master.gain.value = 0.28; master.connect(ctx.destination);

    // 「叮」：金屬鐘聲（兩個不諧和的高頻分音）＋敲擊噪音
    const bell = (freq: number, gainV: number, dur: number, at: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gainV, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.02);
    };
    bell(2640, 0.9, 0.55, t0); bell(3960, 0.5, 0.35, t0); bell(5280, 0.25, 0.22, t0);
    const noiseLen = 0.04; const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseLen), ctx.sampleRate);
    const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource(); noise.buffer = buf; const ng = ctx.createGain(); ng.gain.value = 0.35;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    noise.connect(hp); hp.connect(ng); ng.connect(master); noise.start(t0);

    // 金幣叮噹：等級越高越多聲，音高微亂數、間隔 70ms 起跳
    const coins = value >= 20000 ? 10 : value >= 5000 ? 7 : value >= 1000 ? 4 : 2;
    for (let i = 0; i < coins; i++) {
      const at = t0 + 0.12 + i * (0.07 + Math.random() * 0.02);
      const base = 3800 + Math.random() * 1800;
      bell(base, 0.35, 0.16, at); bell(base * 1.5, 0.18, 0.12, at);
    }
  } catch { /* 沒有 WebAudio 就安靜，不影響演出 */ }
}

/**
 * 示範值（老闆 2026-09-03：本地與 staging 都要看得到效果，照賞等給；**只有正式站用真行情**）。
 * 不看行情，直接依這張卡的賞等對到四個分級：A賞／SSR → 26,000、B賞／SR → 8,800、
 * C賞／R → 1,500、其他 → 350。
 * 判斷用網址不用 NODE_ENV：staging 也是 production build，用 NODE_ENV 會讓 staging 吃真資料
 *（老闆回報試試看只有最後一張跳 —— 真行情裡普卡都 <100）。
 */
const isDemoEnv = () => {
  if (process.env.NODE_ENV !== 'production') return true;
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h.startsWith('staging.') || h.endsWith('.vercel.app');
};
const devValueFor = (grade?: string | null) => {
  const g = String(grade ?? '').toUpperCase();
  if (g.includes('SSR') || g.includes('A賞') || g.includes('超稀有') || g.includes('最後賞')) return 26000;
  if (g.includes('SR') || g.includes('B賞')) return 8800;
  if (g.includes('R') || g.includes('C賞') || g.includes('稀有')) return 1500;
  return 350;
};

export default function MarketValuePop({ value, trigger, grade, enabled = true }: { value: number | null | undefined; trigger: string | number | null; grade?: string | null; /** 後台模組參數「翻牌市價數字」（machine_theme_params.marketPop），關掉完全不跳 */ enabled?: boolean }) {
  const [shot, setShot] = useState<{ key: string; value: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (trigger === null || trigger === undefined) return;
    const v = isDemoEnv() ? devValueFor(grade) : value;
    if (typeof v !== 'number' || v < MARKET_POP_MIN) return;
    setShot({ key: String(trigger), value: v });
    playCashIn(v);
    if (v >= 20000) hapticMedium();
    const t = setTimeout(() => setShot(s => (s?.key === String(trigger) ? null : s)), 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, value, enabled]);

  return (
    <AnimatePresence>
      {shot && (
        <motion.div
          key={shot.key}
          /* 位置：卡牌上方的背景上（老闆 2026-09-03：先壓卡牌上緣，再改成整個移到背景上） */
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+7%)] z-[1300] flex justify-center"
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
  /*
   * 全部白字、綠邊線、綠光暈（老闆 2026-09-03 定案，大賞也一樣，不用金色）。
   * font-amount（DIN Alternate）只有一個粗細，所以用**同色描邊**把筆畫撐粗；
   * 綠邊不能再用 text-stroke（一個元素只能一種描邊色），改用八方向的 text-shadow 畫，
   * 再疊一圈綠色光暈。等級只差在字級、邊粗與光暈強度；最高級保留脈動。
   */
  const outline = tier === 'legend' ? 5 : tier === 'gold' || tier === 'big' ? 4 : 3;
  const GREEN = '#16c25a';
  const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
  const glow = tier === 'legend' ? '0 0 30px rgba(34,220,110,1), 0 0 60px rgba(34,220,110,0.7)'
    : tier === 'gold' ? '0 0 22px rgba(34,220,110,0.95), 0 0 44px rgba(34,220,110,0.5)'
    : tier === 'big' ? '0 0 16px rgba(34,220,110,0.85)'
    : '0 0 10px rgba(34,220,110,0.7)';
  const textShadow = dirs.map(([x, y]) => `${x * outline}px ${y * outline}px 0 ${GREEN}`).join(', ') + ', ' + glow;
  return (
    <span
      className={cn(
        'font-amount font-black tabular-nums tracking-tight text-white',
        tier === 'small' && 'text-[34px]',
        tier === 'big' && 'text-[46px]',
        tier === 'gold' && 'text-[54px]',
        tier === 'legend' && 'text-[64px] animate-pulse',
      )}
      style={{ textShadow, WebkitTextStroke: `${tier === 'small' ? 1.5 : 2.5}px currentColor` }}
    >
      +{n.toLocaleString()}
    </span>
  );
}
