'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

/**
 * 中獎彈幕層（機台上緣窄帶）
 *
 * 刻意限制在上緣一條窄帶，不覆蓋滾輪與大当り燈板 —— 那是演出主體，
 * 被彈幕壓過去等於洗掉 RUSH 停 777 的高潮。
 * 同理，RUSH 演出期間整層淡出暫停。
 *
 * 動畫用 CSS transform（GPU 合成），不用 JS 逐幀：
 * 機台頁本身已有滾輪動畫與音效，逐幀動畫在手機上會掉幀。
 */

export interface DanmakuItem {
  id: string;
  name: string;
  avatar: string | null;
  prize: string;
  value: number;
}

const MAX_ON_SCREEN = 6;   // 同時最多幾條，多的排隊
const LANES = 4;           // 窄帶內的軌道數，避免互相重疊
const SPAWN_MS = 2600;     // 出現間隔

interface Flying extends DanmakuItem {
  key: string;
  lane: number;
  duration: number;
}

export default function DanmakuLayer({ items, paused }: { items: DanmakuItem[]; paused?: boolean }) {
  const [flying, setFlying] = useState<Flying[]>([]);
  const cursor = useRef(0);
  const seq = useRef(0);

  useEffect(() => {
    if (paused || items.length === 0) return;
    const timer = setInterval(() => {
      setFlying(prev => {
        if (prev.length >= MAX_ON_SCREEN) return prev;
        const src = items[cursor.current % items.length];
        cursor.current += 1;
        seq.current += 1;
        // 隨機軌道與速度，避免整齊劃一像跑馬燈
        const lane = Math.floor(Math.random() * LANES);
        const duration = 8 + Math.random() * 6;   // 8~14 秒橫越
        return [...prev, { ...src, key: `${src.id}-${seq.current}`, lane, duration }];
      });
    }, SPAWN_MS);
    return () => clearInterval(timer);
  }, [items, paused]);

  const remove = (key: string) => setFlying(prev => prev.filter(f => f.key !== key));

  if (items.length === 0) return null;

  return (
    <div
      aria-hidden
      // z-10：高於機台內部元素（最高 z=8），低於頂部操作列（z-20）與結束警示條（z-30），
      // 彈幕從按鈕與警示條「後面」通過，不遮擋必看資訊
      className="pointer-events-none absolute inset-x-0 z-10 overflow-hidden transition-opacity duration-500"
      // 起點下移到頂部操作列之下（返回/彈幕/音效鈕高 38px + 上下各 10px 邊距）：
      // 即使 z-index 已低於操作列，重疊時彈幕仍會從鈕的後方穿過去，視覺很雜
      style={{ top: 'calc(env(safe-area-inset-top) + 62px)', height: '22%', opacity: paused ? 0 : 1 }}
    >
      {flying.map(f => (
        <div
          key={f.key}
          onAnimationEnd={() => remove(f.key)}
          className="absolute whitespace-nowrap will-change-transform"
          style={{
            top: `${6 + f.lane * 22}%`,
            animation: `dmk-fly ${f.duration}s linear forwards`,
          }}
        >
          <div className="flex items-center gap-1.5 pl-0.5 pr-3 py-0.5 rounded-full bg-black/55 backdrop-blur-sm border border-white/15">
            <span className="relative w-5 h-5 rounded-full overflow-hidden shrink-0 bg-white/20">
              <Image src={f.avatar || '/images/avatar.png'} alt="" fill className="object-cover" unoptimized />
            </span>
            <span className="text-[11px] font-black text-white leading-none">
              {f.name}
              <span className="text-white/60 mx-1">抽中</span>
              <span className="text-[#facc15]">{f.prize.length > 14 ? `${f.prize.slice(0, 14)}…` : f.prize}</span>
            </span>
          </div>
        </div>
      ))}

      <style jsx global>{`
        @keyframes dmk-fly {
          from { transform: translateX(100vw); }
          to   { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
