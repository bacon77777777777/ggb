'use client';

/**
 * 電腦端首頁的輪播區 —— 照 cardx 首頁的 banner 列做（老闆 2026-09-04：「輪播區塊要做的跟 cardx 一樣」）
 *
 * cardx 的做法（HomeClient.tsx）：一列橫向捲、卡片固定寬、間距 20、圓角 12，右邊露出半張表示還能捲；
 * 下方一排圓點；每 4.5 秒自動往右一張；清單複製三份頭尾接起來做無限輪播，
 * 捲到頭尾那份時無聲跳回中間那份。
 *
 * 我們的輪播圖是後台上傳的 3:1 圖（沒有標題文字），卡片維持 3:1、高度取 cardx 的 187，
 * 所以寬 560。1920 的螢幕一排看得到兩張半。
 *
 * 手機那棵樹仍用 HeroBanner（滿版單張淡入淡出），這裡只給 ≥1024。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { isInternalUrl, toInternalPath } from '@/lib/internalUrl';
import { asset } from '@/lib/asset';

export interface RowBanner {
  id: string;
  image: string;
  link: string;
}

const DEFAULT_BANNER: RowBanner = { id: '__default__', image: asset('/images/banner_defaulet.png'), link: '#' };
const CARD_W = 560;
const GAP = 20;
const CYCLES = 3;
const AUTO_MS = 4500;

export default function DesktopBannerRow({ banners, onBannerClick }: { banners: RowBanner[]; onBannerClick?: (banner: RowBanner) => void }) {
  const items = banners.length > 0 ? banners : [DEFAULT_BANNER];
  const count = items.length;
  const loop = count >= 2;
  const cycles = loop ? CYCLES : 1;
  const base = loop ? count : 0; // 中間那份的起點
  const total = count * cycles;

  const ref = useRef<HTMLDivElement>(null);
  const childIdxRef = useRef(base);
  const settleTimer = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  const step = CARD_W + GAP;
  const scrollToChild = useCallback((idx: number, behavior: ScrollBehavior) => {
    ref.current?.scrollTo({ left: step * idx, behavior });
  }, [step]);

  // 一開始停在中間那份的第一張
  useEffect(() => {
    childIdxRef.current = base;
    scrollToChild(base, 'auto');
  }, [base, scrollToChild]);

  // 捲動停下來：算出停在第幾張、更新圓點；停在頭尾那份就跳回中間那份
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        const idx = Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / step)));
        childIdxRef.current = idx;
        setActive(idx % count);
        if (!loop) return;
        const normalized = idx < count ? idx + count : idx >= count * 2 ? idx - count : idx;
        if (normalized !== idx) {
          childIdxRef.current = normalized;
          scrollToChild(normalized, 'auto');
        }
      }, 80);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    };
  }, [count, loop, step, total, scrollToChild]);

  // 自動輪播（照 cardx 4.5 秒）；滑鼠停在上面時暫停
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!loop || paused) return;
    const t = window.setInterval(() => {
      let next = childIdxRef.current + 1;
      if (next > total - 1) next = base;
      childIdxRef.current = next;
      setActive(next % count);
      scrollToChild(next, 'smooth');
    }, AUTO_MS);
    return () => window.clearInterval(t);
  }, [loop, paused, total, base, count, scrollToChild]);

  const goTo = (i: number) => {
    const target = base + i;
    childIdxRef.current = target;
    setActive(i);
    scrollToChild(target, 'smooth');
  };

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div
        ref={ref}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-hide"
        style={{ gap: GAP }}
      >
        {Array.from({ length: cycles }).flatMap((_, c) =>
          items.map((banner, i) => {
            const src = broken.has(banner.id) || !banner.image ? asset('/images/banner_defaulet.png') : banner.image;
            const img = (
              <Image
                src={src}
                alt="Banner"
                fill
                className="select-none object-fill"
                draggable={false}
                unoptimized
                // 中間那份的第一張是首屏 LCP，先載
                priority={c === (loop ? 1 : 0) && i === 0}
                onError={() => setBroken((prev) => new Set(prev).add(banner.id))}
              />
            );
            const cls = 'relative block shrink-0 snap-start overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800';
            const style = { width: CARD_W, aspectRatio: '3 / 1' } as React.CSSProperties;
            return isInternalUrl(banner.link) ? (
              <Link key={`${banner.id}-${c}`} href={toInternalPath(banner.link)} className={cls} style={style} onClick={() => onBannerClick?.(banner)}>
                {img}
              </Link>
            ) : (
              <a key={`${banner.id}-${c}`} href={banner.link} target="_blank" rel="noopener noreferrer" className={cls} style={style} onClick={() => onBannerClick?.(banner)}>
                {img}
              </a>
            );
          }),
        )}
      </div>
      {loop && (
        <div className="mt-3 flex justify-center gap-1.5">
          {items.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`第 ${i + 1} 張`}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === active ? 'w-5 bg-primary' : 'w-1.5 bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-700',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
