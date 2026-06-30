'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Database } from '@/types/database.types';
import { X } from 'lucide-react';

type ProductRow = Database['public']['Tables']['products']['Row'];
type Product = ProductRow & {
  release_year?: number | null;
  release_month?: number | null;
  distributor?: string | null;
};
type Prize = Database['public']['Tables']['product_prizes']['Row'];

interface GachaCollectionListProps {
  productId: number;
  product: Product;
  prizes: Prize[];
  refreshKey?: number;
}

export function GachaCollectionList({ productId, product, prizes, refreshKey }: GachaCollectionListProps) {
  const { user } = useAuth();
  const [countByPrizeId, setCountByPrizeId] = useState<Record<number, number>>({});
  const [supabase] = useState(() => createClient());
  const [previewPrize, setPreviewPrize] = useState<Prize | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('draw_records')
          .select('product_prize_id')
          .eq('user_id', user.id)
          .eq('product_id', productId);

        const counts: Record<number, number> = {};
        (data ?? []).forEach((r: any) => {
          if (r.product_prize_id) counts[r.product_prize_id] = (counts[r.product_prize_id] || 0) + 1;
        });
        setCountByPrizeId(counts);
      } catch {}
    })();
  }, [user, productId, supabase, refreshKey]);

  const displayPrizes = prizes.filter(
    p => p.level !== 'Last One' && p.level !== 'LAST ONE' && !p.level?.includes('最後賞')
  );

  const totalCollected = displayPrizes.reduce((s, p) => s + (countByPrizeId[p.id] || 0), 0);
  const totalRemaining = displayPrizes.reduce((s, p) => s + (p.remaining || 0), 0);

  // 商品資訊 fields
  const infoRows: { label: string; value: string | null | undefined }[] = [
    { label: '類別', value: product.category || null },
    {
      label: '發行年月',
      value: product.release_year
        ? `${product.release_year}年${product.release_month ? product.release_month + '月' : ''}`
        : null,
    },
    { label: '發行商', value: product.distributor || null },
    { label: '單抽費用', value: product.price ? `${product.price} G` : null },
  ].filter(r => r.value);

  return (
    <div className="space-y-2 sm:space-y-5 w-full">

      {/* 總覽 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="p-2 sm:p-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
          <h2 className="text-sm sm:text-lg font-black text-neutral-900 dark:text-neutral-50 tracking-tight uppercase tracking-wider">
            總覽
          </h2>
        </div>

        <table className="w-full text-left table-fixed">
          <thead className="bg-neutral-50/50 dark:bg-neutral-800/50 text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 border-b border-neutral-50 dark:border-neutral-800">
            <tr>
              <th className="px-2 sm:px-6 py-2 sm:py-3 uppercase tracking-widest">獎項名稱</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-right uppercase tracking-widest w-[56px] sm:w-[72px] whitespace-nowrap">已收集</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-right uppercase tracking-widest w-[56px] sm:w-[72px] whitespace-nowrap">未收集</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
            {displayPrizes.map((prize) => {
              const collected = countByPrizeId[prize.id] || 0;
              const remaining = prize.remaining || 0;
              const imgSrc = prize.image_url && !prize.image_url.startsWith('blob:') ? prize.image_url : null;

              return (
                <tr
                  key={prize.id}
                  className={cn(
                    'hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors',
                    remaining === 0 && 'opacity-50'
                  )}
                >
                  <td className="px-2 sm:px-6 py-1.5 sm:py-3">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {/* 小圖 */}
                      <button
                        type="button"
                        onClick={() => imgSrc && setPreviewPrize(prize)}
                        className={cn(
                          'w-9 h-9 sm:w-11 sm:h-11 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 flex-shrink-0 relative overflow-hidden',
                          imgSrc ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'
                        )}
                      >
                        {imgSrc ? (
                          <Image src={imgSrc} alt={prize.name} fill className="object-cover" unoptimized />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-neutral-300 font-black">NO IMG</div>
                        )}
                      </button>

                      {/* 賞別 + 名稱 */}
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="text-[11px] sm:text-[13px] text-primary font-black uppercase tracking-widest bg-primary/5 px-1.5 py-0.5 rounded-lg border border-primary/10 whitespace-nowrap flex-shrink-0">
                          {prize.level}
                        </span>
                        <span className="font-black text-neutral-900 dark:text-neutral-50 text-[13px] sm:text-sm leading-tight tracking-tight truncate">
                          {prize.name}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* 已收集 */}
                  <td className="px-2 sm:px-3 py-1.5 sm:py-3 text-right w-[56px] sm:w-[72px] align-middle">
                    <span className={cn(
                      'font-black text-sm sm:text-base tracking-tighter',
                      collected > 0 ? 'text-accent-emerald' : 'text-neutral-300 dark:text-neutral-700'
                    )}>
                      {user ? collected : '—'}
                    </span>
                  </td>

                  {/* 未收集 */}
                  <td className="px-2 sm:px-3 py-1.5 sm:py-3 text-right w-[56px] sm:w-[72px] align-middle">
                    <span className="font-black text-sm sm:text-base tracking-tighter text-neutral-900 dark:text-neutral-50">
                      {remaining.toLocaleString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-4 bg-accent-red/5 dark:bg-accent-red/10 border-t-2 border-neutral-50 dark:border-neutral-800">
          <span className="font-black text-accent-red text-sm sm:text-base tracking-widest uppercase">合計</span>
          <div className="flex items-center gap-3 sm:gap-6 text-sm sm:text-base font-black tracking-tighter">
            {user && (
              <span className={cn('whitespace-nowrap', totalCollected > 0 ? 'text-accent-emerald' : 'text-neutral-300 dark:text-neutral-700')}>
                已收集 {totalCollected}
              </span>
            )}
            <span className="whitespace-nowrap">
              <span className="text-accent-red">{totalRemaining.toLocaleString()}</span>
              <span className="text-accent-red/30 mx-1">/</span>
              <span className="text-neutral-700 dark:text-neutral-400">
                {displayPrizes.reduce((s, p) => s + (p.total || 0), 0).toLocaleString()}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* 商品資訊 */}
      {infoRows.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-2 sm:space-y-4">
          <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">
            商品資訊
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 sm:gap-y-4 gap-x-12">
            {infoRows.map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">
                  {label}
                </span>
                <span className="text-neutral-900 dark:text-neutral-50 font-black text-[13px] text-right">
                  {value}
                </span>
              </div>
            ))}
          </div>
          {product.description && (
            <p className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed pt-1">
              {product.description}
            </p>
          )}
        </div>
      )}

      {/* 大圖預覽 modal */}
      {previewPrize && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[2600] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setPreviewPrize(null)}
        >
          <div
            className="relative max-w-[88vw] max-h-[88vh] flex flex-col items-center gap-3"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPrize(null)}
              className="absolute -top-4 -right-4 z-10 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-white/60 font-black uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded">
                {previewPrize.level}
              </span>
              <span className="text-white text-base font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]">
                {previewPrize.name}
              </span>
            </div>
            <Image
              src={previewPrize.image_url!}
              alt={previewPrize.name}
              width={600}
              height={600}
              className="max-w-full max-h-[75vh] object-contain rounded-2xl"
              unoptimized
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
