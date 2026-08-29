'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * 導覽列登入鈕的輪替文案（老闆 2026-08-30）：「登入」↔「拿積分」
 *
 * ⚠️ 不能用「兩段字疊在同一格互相淡入淡出」：交叉的那 0.3 秒兩組字會同時半透明
 * 疊在一起，看起來是「拿登入分」（老闆截圖）。改成同一個節點先淡出、換完字再
 * 淡入，任何一刻都只有一組字。
 *
 * 寬度由底下那個 invisible 的最長字串撐住，膠囊才不會一寬一窄地跳。
 */
const WORDS = ['登入', '拿積分'];
const HOLD_MS = 2600;
const FADE_MS = 220;

export function LoginCtaText() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const swapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      swapRef.current = setTimeout(() => {
        setIndex(i => (i + 1) % WORDS.length);
        setVisible(true);
      }, FADE_MS);
    }, HOLD_MS);
    return () => {
      clearInterval(timer);
      if (swapRef.current) clearTimeout(swapRef.current);
    };
  }, []);

  return (
    /* 寬度用 min-width 撐（3 個中文字 ≒ 3em），不放隱形的佔位字 ——
       畫面上從頭到尾只有一個文字節點，就不可能兩組字疊在一起 */
    <span
      className={cn(
        'inline-block min-w-[3em] text-center whitespace-nowrap transition-opacity',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {WORDS[index]}
    </span>
  );
}
