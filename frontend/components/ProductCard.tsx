
import Link from 'next/link';
import ProductBadge, { ProductType } from './ui/ProductBadge';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { getItemImageForId, DEFAULT_ITEM_IMAGE as DEFAULT_IMAGE } from '@/lib/productImage';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { categoryState } from '@/lib/categoryFlags';
import { useProductPromotion } from '@/contexts/PromotionsContext';
import { asset } from '@/lib/asset';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prefetch } from '@/lib/swr';
import { productKey, fetchProductDetail } from '@/lib/queries/product';

interface ProductCardProps {
  id: string | number;
  name: string;
  image: string;
  price: number;
  originalPrice?: number;
  remaining?: number;
  total?: number;
  isHot?: boolean;
  isNew?: boolean;
  hasTicket?: boolean;
  category?: string;
  type?: ProductType;
  status?: 'active' | 'pending' | 'ended' | string;
  onNavigate?: () => void;
  hrefOverride?: string;
  unitLabel?: string;
  /** 抽卡卡包模式：一包幾張。>=2 時價格單位與庫存都以「包」呈現 */
  cardsPerPack?: number;
  showRemainingText?: boolean;
}

export default function ProductCard(props: ProductCardProps) {
  // 維護中的類別照常列出（跟關閉不同），但卡片上要看得出來買不到 ——
  // 不然玩家點進去才發現，白跑一趟。用字跟商品頁一致
  const { states: flagStates, isLoading: isFlagsLoading } = useFeatureFlags();
  // 促銷標籤掛在左上角。右上角是「熱門」，兩個都有的時候各佔一角不會疊
  const promo = useProductPromotion(props.id);
  const {
    id,
    name,
    image,
    price,
    remaining,
    total,
    isHot = false,
    isNew = false,
    type,
    status,
    onNavigate,
    hrefOverride,
    unitLabel,
    cardsPerPack,
    showRemainingText = true,
  } = props;
  const href =
    hrefOverride ||
    (type === 'blindbox'
      ? `/blindbox/${id}`
      : type === 'gacha'
        ? `/gacha/${id}`
        : type === 'card'
          ? `/card/${id}`
          : `/item/${id}`);
  const fallbackImage = getItemImageForId(id);
  const [displayImage, setDisplayImage] = useState<string>(image || fallbackImage);

  /*
   * 按下就預取（老闆 2026-08-22 頁面加載優化 ⑤）：touchstart 比 click 早 100ms 左右，
   * 先把商品頁的主資料（lib/queries/product，跟商品頁同一個 key）跟路由 JS 抓起來，
   * 手指放開換頁時資料多半已經到了。桌機用 mouseenter。5 秒內重複按不會重打。
   */
  const queryClient = useQueryClient();
  const router = useRouter();
  const warm = () => {
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      prefetch(queryClient, productKey(numericId), () => fetchProductDetail(createClient(), numericId));
    }
    router.prefetch(href);
  };
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setDisplayImage(image || fallbackImage);
    setImgError(false);
  }, [image, fallbackImage]);

  const handleImageError = () => {
    if (!imgError) {
      setImgError(true);
      setDisplayImage(DEFAULT_IMAGE);
    }
  };

  /* 卡包模式（migration 584）：玩家買的是包，張數是內部籤位數。
     這裡不換算的話，列表會顯示「1000/1000」而玩家只買得到 100 包 */
  const perPack = type === 'card' && (cardsPerPack ?? 1) >= 2 ? (cardsPerPack as number) : 1
  const isPackMode = perPack >= 2
  const effUnitLabel = unitLabel ?? (isPackMode ? '/包' : '/抽')
  const packTotal = typeof total === 'number' ? Math.floor(total / perPack) : total
  const packRemaining = typeof remaining === 'number' ? Math.floor(remaining / perPack) : remaining

  const remainingText =
    showRemainingText && typeof packTotal === 'number' && typeof packRemaining === 'number' && packTotal > 0
      ? `${Math.max(packRemaining, 0)}/${packTotal}`
      : null;

  return (
    <Link
      href={href}
      onTouchStart={warm}
      onMouseEnter={warm}
      className="group block h-full"
      onClick={() => {
        onNavigate?.()
      }}
    >
      <div className="relative h-full flex flex-col bg-white dark:bg-neutral-900 rounded-[8px] border border-neutral-100 dark:border-neutral-800 overflow-hidden transition-transform duration-300">
        {/* Image Container */}
        <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800 rounded-t-[8px]">
          <div className="w-full h-full flex items-center justify-center text-white/20 group-hover:scale-105 transition-transform duration-500 relative">
            {/* 完整顯示商品圖、不裁切（老闆 2026-08-18）。
                原本是 object-cover，非正方形的商品圖會被切掉上下或左右 ——
                卡包／盒裝的圖常是直式，切掉的往往正好是商品名那一截。
                留白處用同色底，看起來是刻意留白而不是破圖 */}
            <Image 
              src={displayImage}
              alt={name}
              fill
              className="object-contain"
              unoptimized
              onError={handleImageError}
            />
          </div>
          
          <div className="absolute top-0 left-0 z-10 flex flex-col pointer-events-none">
            {promo && (
              <div className="h-6 px-2 inline-flex items-center rounded-tl-lg rounded-br-lg bg-accent-red text-white text-[11px] font-black border border-white/10 leading-none">
                {promo.badgeText}
              </div>
            )}
            {isNew && !isHot && (
              <ProductBadge
                type="new"
                className="h-6 rounded-2xl rounded-tr-none rounded-bl-none text-[11px]"
              />
            )}
          </div>
          
          <div className="absolute top-0 right-0 z-10 flex flex-col items-end pointer-events-none">
            {isHot && (
              <div className="h-6 px-2 inline-flex items-center rounded-tr-lg rounded-bl-lg bg-primary text-white text-[11px] font-black border border-white/10 leading-none">
                熱門
              </div>
            )}
          </div>

          {((typeof remaining === 'number' && remaining <= 0) || status === 'ended') ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 rounded-[8px]">
              <Image 
                src={asset("/images/sale.svg")} 
                alt="完抽" 
                width={96}
                height={96}
                className="w-24 h-auto transform scale-110"
                unoptimized
              />
            </div>
          ) : categoryState(type, flagStates, isFlagsLoading) !== 'on' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[8px] bg-black/50">
              <span className="rounded-full bg-amber-400 px-3 py-1 text-[12px] font-black text-amber-950">
                關閉中
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1 p-2 md:pt-2 md:-mt-0.5">
          <div className="mb-1 h-[2.75rem]">
            <h3 className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25] group-hover:text-primary transition-colors break-all">
              {/* Safari 的 -webkit-line-clamp 有兩類誤判觸發源，這裡都踩過：
                  1. 有定位的 inline 元素（relative -top-*）→ 改 vertical-align
                  2. 原子行內盒（inline-flex / inline-block / backdrop-filter）
                     → badge 必須是純 inline，膠囊高度用 py 撐（≈原 h-4）
                  兩類都會讓名稱明明放得下也硬加刪節號（桌機 Chrome 正常、
                  iPhone 全系瀏覽器都是 WebKit 所以全中）。名稱 13 字全顯示
                  還加點點點就是這裡的病 —— clamp 範圍內只准放純 inline */}
              {type && (
                <ProductBadge
                  type={type}
                  className="inline align-[2px] mr-1 py-[3px] backdrop-blur-none"
                />
              )}
              <span className="inline">
                {name}
              </span>
            </h3>
          </div>
          
          <div className="mt-auto pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-end justify-between gap-1">
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <div className="w-3.5 h-3.5">
                    <Image src={asset("/images/gcoin.webp")} alt="G" width={14} height={14} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[24px] leading-none font-black font-amount text-amount tracking-tight">{price.toLocaleString()}</span>
                    {!!effUnitLabel && <span className="text-[11px] font-black text-neutral-400">{effUnitLabel}</span>}
                  </div>
                </div>
              </div>

              {remainingText !== null && (
                <span className="text-[10px] font-medium text-neutral-600">
                  {remainingText}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
