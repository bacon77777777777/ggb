'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Database } from '@/types/database.types';
import { X } from 'lucide-react';
import ProductCard from '@/components/ProductCard';

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
  const [previewPrize, setPreviewPrize] = useState<Prize | null>(null);
  const [brokenPrizeIds, setBrokenPrizeIds] = useState<Set<number>>(new Set());
  const markBroken = (id: number) => setBrokenPrizeIds(prev => new Set(prev).add(id));

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

  // 猜你喜歡：抓同類型其他商品
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('type', product.type)
          .eq('status', 'active')
          .neq('id', productId)
          .limit(4);
        setRecommendations(data ?? []);
      } catch {}
    })();
  }, [productId, product.type, supabase]);

  const displayPrizes = prizes.filter(
    p => p.level !== 'Last One' && p.level !== 'LAST ONE' && !p.level?.includes('最後賞')
  );

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

      {/* 總覽 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="p-2 sm:p-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
          <h2 className="text-sm sm:text-lg font-black text-neutral-900 dark:text-neutral-50 tracking-tight uppercase tracking-wider">
            總覽
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
                  className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <td className="px-2 sm:px-6 py-1.5 sm:py-3">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {/* 小圖 */}
                      <button
                        type="button"
                        onClick={() => setPreviewPrize(prize)}
                        className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 flex-shrink-0 relative overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <Image
                          src={imgSrc ?? '/images/item_defaulet.png'}
                          alt={prize.name}
                          fill
                          className="object-cover"
                          unoptimized
                          onError={() => markBroken(prize.id)}
                        />
                      </button>

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
        <div className="pt-1">
          <p className="text-[13px] sm:text-sm font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">
            注意事項
          </p>
          <ol className="space-y-1 list-decimal list-inside">
            {[
              '轉蛋商品均為隨機出獎，抽到什麼出什麼。',
              '轉出後即確認結果，不可退款或更換款式。',
              '實體獎品由廠商備貨出貨，出貨時間約 3-7 個工作日。',
              '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
              '商品圖片僅供參考，實物以實際出貨為準。',
              '本平台保留對所有活動及商品之最終解釋權。',
            ].map((item, i) => (
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
            <Link href="/" className="text-[13px] sm:text-sm font-black text-primary hover:text-primary/80 uppercase tracking-widest">
              查看更多
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
              src={brokenPrizeIds.has(previewPrize.id) || !previewPrize.image_url ? '/images/item_defaulet.png' : previewPrize.image_url}
              alt={previewPrize.name}
              width={600}
              height={600}
              className="max-w-full max-h-[75vh] object-contain rounded-2xl"
              unoptimized
              onError={() => markBroken(previewPrize.id)}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
