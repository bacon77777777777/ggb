'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Database } from '@/types/database.types';
import ProductCard from '@/components/ProductCard';
import PrizeDetailSheet from '@/components/ui/PrizeDetailSheet';
import { PRODUCT_PUBLIC_COLUMNS } from '@/lib/productColumns'
import { fetchProductPromotion, type ProductPromotion } from '@/lib/promotions';

type ProductRow = Database['public']['Tables']['products']['Row'];
type Prize = Database['public']['Tables']['product_prizes']['Row'];

interface GachaCollectionListProps {
  productId: number;
  product: ProductRow;
  prizes: Prize[];
  refreshKey?: number;
}

export function GachaCollectionList({ productId, product, prizes, refreshKey }: GachaCollectionListProps) {
  const { user } = useAuth();
  const [collectedIds, setCollectedIds] = useState<Set<number>>(new Set());
  const [recommendations, setRecommendations] = useState<ProductRow[]>([]);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());
  /** 看大圖時記的是「第幾項」而不是那一項本身 —— 才有辦法左右切換 */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [brokenPrizeIds, setBrokenPrizeIds] = useState<Set<number>>(new Set());
  const markBroken = (id: number) => setBrokenPrizeIds(prev => new Set(prev).add(id));
  // 進行中的促銷：商品資訊要列出來，玩家才知道這一檔有活動
  const [promo, setPromo] = useState<ProductPromotion | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchProductPromotion(supabase, productId).then(p => { if (alive) setPromo(p); });
    return () => { alive = false; };
  }, [productId, supabase]);

  // 取得用戶已抽到的 prize_id 集合
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('draw_records')
          .select('product_prize_id')
          .eq('user_id', user.id)
          .eq('product_id', productId);

        const ids = new Set(
          (data ?? []).map((r: any) => r.product_prize_id).filter((id: any): id is number => id !== null)
        );
        setCollectedIds(ids);
      } catch {}
    })();
  }, [user, productId, supabase, refreshKey]);

  useEffect(() => {
    const supplierId = (product as any).supplier_id;
    if (!supplierId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('suppliers')
          .select('name')
          .eq('id', supplierId)
          .single();
        setSupplierName(data?.name ?? null);
      } catch {}
    })();
  }, [(product as any).supplier_id, supabase]);

  // 猜你喜歡：任意類型 active 商品
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('products')
          .select(PRODUCT_PUBLIC_COLUMNS)
          .eq('status', 'active')
          .neq('type', 'slot')
          .neq('id', productId)
          .limit(4);
        setRecommendations(data ?? []);
      } catch {}
    })();
  }, [productId, supabase]);

  const displayPrizes = prizes.filter(
    p => p.level !== 'Last One' && p.level !== 'LAST ONE' && !p.level?.includes('最後賞')
  );
  const previewPrize = previewIndex !== null ? displayPrizes[previewIndex] ?? null : null;

  const typeLabel: Record<string, string> = {
    ichiban: '一番賞',
    blindbox: '盒玩',
    gacha: '轉蛋',
    card: '抽卡',
    custom: '自製賞',
  };

  const infoRows = [
    { label: '類別', value: typeLabel[product.type] || product.category || '-' },
    { label: '廠商', value: supplierName || '-' },
    { label: '代理商', value: product.distributor || '-' },
    { label: '條碼', value: (product as any).barcode || '-' },
  ];

  return (
    <div className="space-y-2 sm:space-y-5 w-full">

      {/* 品項總覽 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="p-2 sm:p-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
          <h2 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight">
            品項總覽
          </h2>
        </div>

        <table className="w-full text-left table-fixed">
          <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
            {displayPrizes.map((prize) => {
              const isCollected = user ? collectedIds.has(prize.id) : false;
              const imgSrc = prize.image_url && !prize.image_url.startsWith('blob:') && !brokenPrizeIds.has(prize.id)
                ? prize.image_url
                : null;

              return (
                <tr
                  key={prize.id}
                  className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
                  onClick={() => setPreviewIndex(displayPrizes.indexOf(prize))}
                >
                  <td className="px-2 sm:px-6 py-1.5 sm:py-3">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {/* 小圖 */}
                      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 flex-shrink-0 relative overflow-hidden">
                        <Image
                          src={imgSrc ?? '/images/item_defaulet.png'}
                          alt={prize.name}
                          fill
                          className="object-cover"
                          unoptimized
                          onError={() => markBroken(prize.id)}
                        />
                      </div>

                      {/* 名稱 */}
                      <span className="font-black text-neutral-900 dark:text-neutral-50 text-[13px] sm:text-sm leading-tight tracking-tight truncate min-w-0">
                        {prize.name}
                      </span>
                    </div>
                  </td>

                  {/* 收集狀態 */}
                  <td className="px-2 sm:px-3 py-1.5 sm:py-3 text-right w-[64px] sm:w-[80px] align-middle">
                    {!user ? (
                      <span className="text-[12px] sm:text-[13px] font-black text-neutral-300 dark:text-neutral-600">—</span>
                    ) : isCollected ? (
                      <span className="text-[12px] sm:text-[13px] font-black text-accent-emerald">已收集</span>
                    ) : (
                      <span className="text-[12px] sm:text-[13px] font-black text-neutral-300 dark:text-neutral-600">未收集</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 商品資訊 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
          <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight">
            商品資訊
          </h3>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {/* 促銷列：有進行中的方案才出現，紅色標出（例：開學買五送一） */}
          {promo && (
            <div className="flex justify-between items-center py-2 sm:py-3 px-3 sm:px-6">
              <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">
                促銷
              </span>
              <span className="inline-flex items-center rounded-full bg-accent-red/10 px-2.5 py-0.5 text-[13px] font-black text-accent-red">
                {promo.name || promo.badgeText}
              </span>
            </div>
          )}
          {infoRows.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-2 sm:py-3 px-3 sm:px-6">
              <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">
                {label}
              </span>
              <span className="text-neutral-900 dark:text-neutral-50 font-black text-[13px] text-right">
                {value}
              </span>
            </div>
          ))}
        </div>
        <div className="px-3 sm:px-6 py-3 sm:py-5">
          <p className="text-[13px] sm:text-sm font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
            注意事項
          </p>
          <ol className="space-y-1 list-decimal list-inside">
            {(product.type === 'blindbox' ? [
              '盒玩商品均為隨機出獎，抽到什麼出什麼。',
              '抽出後即確認結果，不可退款或更換款式。',
              '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
              '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
              '商品圖片僅供參考，實物以實際配送為準。',
              '本平台保留對所有活動及商品之最終解釋權。',
            ] : [
              '轉蛋商品均為隨機出獎，抽到什麼出什麼。',
              '轉出後即確認結果，不可退款或更換款式。',
              '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
              '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
              '商品圖片僅供參考，實物以實際配送為準。',
              '本平台保留對所有活動及商品之最終解釋權。',
            ]).map((item, i) => (
              <li key={i} className="text-[12px] sm:text-[13px] text-neutral-400 dark:text-neutral-500 font-bold leading-relaxed">
                {item}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* 猜你喜歡 */}
      {recommendations.length > 0 && (
        <div className="pt-1 sm:pt-2">
          <div className="flex items-center justify-between mb-2 sm:mb-4 px-1">
            <h2 className="text-base sm:text-xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">猜你喜歡</h2>
            <Link href="/search" className="text-[13px] sm:text-sm font-black text-primary hover:text-primary/80 uppercase tracking-widest">
              查看更多
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            {recommendations.map((item) => (
              <ProductCard
                key={item.id}
                id={item.id}
                name={item.name}
                image={item.image_url || ''}
                price={item.price}
                remaining={item.remaining}
                total={item.total_count}
                isHot={item.is_hot || false}
                category={item.category || ''}
                type={item.type}
                status={item.status}
              />
            ))}
          </div>
        </div>
      )}

      <PrizeDetailSheet
        onPrev={previewIndex !== null && displayPrizes.length > 1
          ? () => setPreviewIndex(i => ((i ?? 0) - 1 + displayPrizes.length) % displayPrizes.length)
          : undefined}
        onNext={previewIndex !== null && displayPrizes.length > 1
          ? () => setPreviewIndex(i => ((i ?? 0) + 1) % displayPrizes.length)
          : undefined}
        prize={previewPrize ? {
          name: previewPrize.name,
          image_url: brokenPrizeIds.has(previewPrize.id) ? null : previewPrize.image_url,
          level: previewPrize.level,
          total: previewPrize.total,
          remaining: previewPrize.remaining,
        } : null}
        onClose={() => setPreviewIndex(null)}
      />
    </div>
  );
}
