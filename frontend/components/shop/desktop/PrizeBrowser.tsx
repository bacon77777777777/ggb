'use client';

/**
 * 電腦版／平板商品頁的「品項總覽」格子（老闆 2026-09-04：照 packs.com 的 Set Contents）
 *
 * 只放手機版本來就有的資訊：圖、名稱、已收集狀態；點一格開 PrizeDetailSheet 看大圖，
 * 左右切換照同一份清單走。
 *
 * ⚠️ 老闆 2026-09-04：**原本沒有的不要自己加，先問過**。搜尋、排序、賞等篩選、機率、
 * 「N 款」這些第一版加過又拿掉了。之後別的類別要露出賞等／剩餘／行情值，
 * 用下面那幾個旗標開，預設全關。
 *
 * 不包卡片容器、圓角小（照 packs）；直接鋪在頁面底色上。
 */

import React, { useState } from 'react';
import Image from 'next/image';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { asset } from '@/lib/asset';
import { GradeBadge } from '@/components/ui/GradeBadge';
import PrizeDetailSheet from '@/components/ui/PrizeDetailSheet';
import type { Database } from '@/types/database.types';

type PrizeRow = Database['public']['Tables']['product_prizes']['Row'];

export interface PrizeBrowserProps {
  prizes: PrizeRow[];
  title?: string;
  /** 標題列右側（公平性連結之類） */
  headerRight?: React.ReactNode;
  /** 已收集的品項 id；null＝未登入（不顯示收集狀態） */
  collectedIds?: Set<number> | null;
  /** 一番賞／自製賞：圖上壓賞等 */
  showLevel?: boolean;
  showRemaining?: boolean;
  /** 抽卡：行情值（跟後台開關走），有值才顯示 */
  showMarketValue?: boolean;
  columns?: 2 | 3 | 4;
}

const ITEM_DEFAULT_IMG = asset('/images/item_defaulet.webp');

export function PrizeBrowser({
  prizes, title = '品項總覽', headerRight, collectedIds = null,
  showLevel = false, showRemaining = false, showMarketValue = false, columns = 3,
}: PrizeBrowserProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const preview = previewIndex !== null ? prizes[previewIndex] ?? null : null;

  return (
    <div>
      {/* 標題列 */}
      <div className="flex items-center gap-3 pb-4">
        <h2 className="text-xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">{title}</h2>
        {headerRight && <div className="ml-auto flex items-center gap-2">{headerRight}</div>}
      </div>

      {/* 格子 */}
      {prizes.length === 0 ? (
        <div className="py-16 text-center text-[14px] font-bold text-neutral-400">尚無品項</div>
      ) : (
        <div className={cn('grid gap-3', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-3', columns === 4 && 'grid-cols-4')}>
          {prizes.map((prize, idx) => {
            const collected = !!collectedIds?.has(prize.id);
            const soldOut = typeof prize.remaining === 'number' && prize.remaining <= 0;
            const src = prize.image_url && !prize.image_url.startsWith('blob:') && !broken.has(prize.id) ? prize.image_url : ITEM_DEFAULT_IMG;
            // 行情值欄位比產生的 DB 型別新（migration 690），用型別斷言讀
            const mv = showMarketValue ? (prize as { market_display_value?: number | null }).market_display_value : null;
            return (
              <button
                key={prize.id}
                type="button"
                onClick={() => setPreviewIndex(idx)}
                className={cn(
                  'group flex flex-col overflow-hidden rounded-xl border border-neutral-100 bg-white text-left transition-all',
                  'hover:border-neutral-200 hover:shadow-card dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700',
                  soldOut && 'opacity-60',
                )}
              >
                <div className="relative aspect-square w-full bg-neutral-50 dark:bg-neutral-800">
                  <Image
                    src={src}
                    alt={prize.name}
                    fill
                    sizes="280px"
                    className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.04]"
                    unoptimized
                    onError={() => setBroken(prev => new Set(prev).add(prize.id))}
                  />
                  {showLevel && prize.level && (
                    <div className="absolute left-2 top-2"><GradeBadge grade={prize.level} size="sm" /></div>
                  )}
                  {collected && (
                    <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent-emerald px-2 py-0.5 text-[11px] font-black text-white">
                      <Check className="h-3 w-3 stroke-[3]" />已收集
                    </div>
                  )}
                  {soldOut && (
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[11px] font-black tracking-widest text-white">已抽完</div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <div className="line-clamp-2 text-[13px] font-black leading-tight text-neutral-900 dark:text-neutral-50">
                    {prize.name}
                  </div>
                  {showRemaining && (
                    <div className="mt-1.5 font-amount text-[12px] font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                      {(prize.remaining ?? 0).toLocaleString()}
                      <span className="mx-0.5 text-neutral-300 dark:text-neutral-600">/</span>
                      {(prize.total ?? 0).toLocaleString()}
                    </div>
                  )}
                  {typeof mv === 'number' && mv > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 font-amount text-[15px] font-black text-accent-red">
                      <Image src={asset('/images/gcoin.webp')} alt="G" width={14} height={14} className="h-3.5 w-3.5" unoptimized />
                      {mv.toLocaleString()}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <PrizeDetailSheet
        onPrev={previewIndex !== null && prizes.length > 1
          ? () => setPreviewIndex(i => ((i ?? 0) - 1 + prizes.length) % prizes.length)
          : undefined}
        onNext={previewIndex !== null && prizes.length > 1
          ? () => setPreviewIndex(i => ((i ?? 0) + 1) % prizes.length)
          : undefined}
        prize={preview ? {
          name: preview.name,
          image_url: broken.has(preview.id) ? null : preview.image_url,
          level: preview.level,
          total: preview.total,
          remaining: preview.remaining,
        } : null}
        onClose={() => setPreviewIndex(null)}
      />
    </div>
  );
}
