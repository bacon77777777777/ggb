'use client';

import { useEffect, useState } from 'react';

/**
 * 機台結束警示條（頂部導航正下方）
 *
 * 與中獎彈幕刻意分開：警示是必看的系統訊息，混進彈幕會被其他訊息淹掉，
 * 玩家錯過就是客訴。故固定在導航下方，且不可關閉。
 *
 * 倒數固定在左側、文案跑馬燈在右側 —— 秒數若塞進跑馬燈裡，
 * 數字每秒變動會造成文字重排與閃爍。
 */
const WARN_BEFORE_MS = 5 * 60 * 1000;   // 剩 5 分鐘開始警示
const URGENT_MS = 60 * 1000;            // 最後 1 分鐘轉深紅並呼吸

export default function EndingBar({ endAt, onEnded }: { endAt?: string | null; onEnded?: () => void }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!endAt) { setLeft(null); return; }
    const tick = () => {
      const ms = new Date(endAt).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) onEnded?.();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endAt, onEnded]);

  if (left === null || left > WARN_BEFORE_MS || left <= 0) return null;

  const total = Math.floor(left / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  const urgent = left <= URGENT_MS;

  return (
    <div
      className="absolute inset-x-0 top-0 z-40 flex items-center gap-2 h-7 overflow-hidden border-b border-white/10"
      style={{ background: urgent ? '#2a0004' : '#0b0b0d' }}
    >
      <span
        className="shrink-0 pl-3 pr-2 text-[13px] font-black tabular-nums leading-none"
        style={{ color: '#ff3b3b', animation: urgent ? 'endbar-pulse 1s ease-in-out infinite' : undefined }}
      >
        {mm}:{ss}
      </span>
      <div className="relative flex-1 h-full overflow-hidden">
        <span
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[12px] font-black"
          style={{ color: '#ff5a5a', animation: 'endbar-scroll 11s linear infinite' }}
        >
          機台即將結束，請抓緊時間　·　結束後將無法再旋轉，已獲得的卡牌不受影響　·
        </span>
      </div>

      <style jsx global>{`
        @keyframes endbar-scroll {
          from { transform: translate(100%, -50%); }
          to   { transform: translate(-100%, -50%); }
        }
        @keyframes endbar-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
