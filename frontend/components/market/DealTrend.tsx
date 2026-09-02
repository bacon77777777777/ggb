'use client';

import { useState } from 'react';
import { gnum } from './ui';
import type { DealPoint } from '@/app/market/data';

/**
 * 近 90 天成交走勢 —— 單一序列迷你折線。
 *
 * 成交是逐筆的稀疏事件（一款十來筆），不畫日 K 也不補零：X 軸照成交時間、
 * 每筆一個點，線只是把點串起來。最新一筆給實心點＋直接標價，其餘只在
 * 按住／滑過時浮出「日期＋價格」。圖下方列最近三筆當文字對照（表格視圖）。
 * 顏色只有主題紅一條線，文字一律用文字色（dataviz：text wears text tokens）。
 */
export function DealTrend({ deals }: { deals: DealPoint[] }) {
  const [sel, setSel] = useState<number | null>(null);
  // 成交列表預設只露兩筆半（限高＋底部淡出），展開才全列（老闆 2026-09-02）
  const [rowsOpen, setRowsOpen] = useState(false);
  if (deals.length < 2) return null;

  const W = 320, H = 88, T = 18, R = 14, B = 20, L = 10;
  const ts = deals.map(d => new Date(d.createdAt).getTime());
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const span = Math.max(1, t1 - t0);
  const lo = Math.min(...deals.map(d => d.price));
  const hi = Math.max(...deals.map(d => d.price));
  const range = Math.max(1, hi - lo);
  const px = (i: number) => L + ((ts[i] - t0) / span) * (W - L - R);
  const py = (p: number) => T + (1 - (p - lo) / range) * (H - T - B);
  const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

  const line = deals.map((d, i) => `${px(i).toFixed(1)},${py(d.price).toFixed(1)}`).join(' ');
  const last = deals.length - 1;
  const cur = sel ?? last;

  /** 按住／滑過找最近的點 */
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let best = 0, dist = Infinity;
    deals.forEach((_, i) => { const dd = Math.abs(px(i) - x); if (dd < dist) { dist = dd; best = i; } });
    setSel(best);
  };

  return (
    <div className="mqtrend">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        onPointerDown={pick}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') pick(e); }}
        onPointerLeave={() => setSel(null)}
      >
        <polyline points={`${line} ${px(last).toFixed(1)},${H - B} ${px(0).toFixed(1)},${H - B}`}
          fill="var(--red)" fillOpacity=".06" stroke="none" />
        <polyline points={line} fill="none" stroke="var(--red)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        {deals.map((d, i) => (
          <circle key={i} cx={px(i)} cy={py(d.price)}
            r={i === cur ? 3.5 : 2.5}
            fill={i === cur ? 'var(--red)' : '#fff'}
            stroke="var(--red)" strokeWidth="1.5" />
        ))}
        {/* 目前選到（預設最新一筆）的直接標籤：日期＋價格 */}
        <text x={Math.min(Math.max(px(cur), 44), W - 44)} y={12} textAnchor="middle"
          fontSize="11" fontWeight="700" fill="var(--txt)">
          {md(deals[cur].createdAt)}・{gnum(deals[cur].price)} G
        </text>
        <text x={L} y={H - 6} fontSize="9.5" fill="var(--sub)">{md(deals[0].createdAt)}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="9.5" fill="var(--sub)">{md(deals[last].createdAt)}</text>
      </svg>
      <div className={`mqrows${rowsOpen ? '' : ' mqrows--clip'}`}>
        {[...deals].reverse().map((d, i) => (
          <div key={i}><span>{md(d.createdAt)} 成交</span><b>{gnum(d.price)} G</b></div>
        ))}
      </div>
      {deals.length > 2 && (
        <button className="mqmore" onClick={() => setRowsOpen(o => !o)}>
          {rowsOpen ? '收起' : `展開全部 ${deals.length} 筆`}
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ width: 12, height: 12, transform: rowsOpen ? 'rotate(180deg)' : undefined }}
          ><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}
    </div>
  );
}
