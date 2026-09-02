'use client';

import { useEffect, useMemo, useRef } from 'react';

/**
 * 三滾輪日期選擇（年／月／日），老闆 2026-09-02 指定：不要日曆，要簡單滾動。
 *
 * 純 CSS scroll-snap 實作，不拉套件：每欄是一個可捲容器，上下各墊兩格
 * 讓第一與最後一個選項也能停在中線；捲動停下來後取最接近中線的那格。
 * 中線那兩條 hairline 是唯一的裝飾，配全站的極簡風。
 */

const ITEM_H = 40;   // 每格高度
const VISIBLE = 5;   // 顯示五格，中間那格是選中值

function WheelColumn({ options, value, onChange, suffix }: {
  options: number[];
  value: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settling = useRef(false);

  // value 由外部改變（例如換月份後日數被夾住）時，把捲動位置對回去
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = options.indexOf(value);
    if (idx < 0) return;
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 1) {
      settling.current = true;
      el.scrollTop = target;
      requestAnimationFrame(() => { settling.current = false; });
    }
  }, [value, options]);

  const onScroll = () => {
    if (settling.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
      if (options[idx] !== value) onChange(options[idx]);
    }, 120);
  };

  return (
    <div className="relative flex-1 min-w-0">
      <div
        ref={ref}
        onScroll={onScroll}
        className="overflow-y-auto overscroll-contain scrollbar-hide"
        style={{ height: ITEM_H * VISIBLE, scrollSnapType: 'y mandatory' }}
      >
        {/* 上下墊片：讓頭尾選項也能捲到中線 */}
        <div style={{ height: ITEM_H * 2 }} />
        {options.map(o => (
          <div
            key={o}
            className={
              o === value
                ? 'flex items-center justify-center text-[17px] text-neutral-900 dark:text-white'
                : 'flex items-center justify-center text-[15px] text-neutral-400 dark:text-neutral-500'
            }
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
          >
            {o}{suffix}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
      {/* 中線框（不吃事件） */}
      <div
        className="pointer-events-none absolute left-0 right-0 border-y border-neutral-200 dark:border-neutral-700"
        style={{ top: ITEM_H * 2, height: ITEM_H }}
      />
    </div>
  );
}

export function WheelDatePicker({ value, onChange, minYear, maxYear }: {
  /** 目前選到的日期（一定有值，外層給預設） */
  value: { y: number; m: number; d: number };
  onChange: (v: { y: number; m: number; d: number }) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const thisYear = new Date().getFullYear();
  const lo = minYear ?? thisYear - 100;
  const hi = maxYear ?? thisYear;

  const years = useMemo(() => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), [lo, hi]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const dayCount = new Date(value.y, value.m, 0).getDate();
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  return (
    <div className="flex gap-2">
      <WheelColumn options={years} value={value.y} suffix="年"
        onChange={y => onChange({ y, m: value.m, d: Math.min(value.d, new Date(y, value.m, 0).getDate()) })} />
      <WheelColumn options={months} value={value.m} suffix="月"
        onChange={m => onChange({ y: value.y, m, d: Math.min(value.d, new Date(value.y, m, 0).getDate()) })} />
      <WheelColumn options={days} value={Math.min(value.d, dayCount)} suffix="日"
        onChange={d => onChange({ y: value.y, m: value.m, d })} />
    </div>
  );
}

export default WheelDatePicker;
