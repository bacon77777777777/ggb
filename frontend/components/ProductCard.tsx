
import Link from 'next/link';
import ProductBadge, { ProductType } from './ui/ProductBadge';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { getItemImageForId, thumbUrl, DEFAULT_ITEM_IMAGE as DEFAULT_IMAGE } from '@/lib/productImage';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { categoryState } from '@/lib/categoryFlags';
import { useProductPromotion } from '@/contexts/PromotionsContext';
import { asset } from '@/lib/asset';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prefetchPackArt } from '@/lib/prefetchPackArt';
import { prefetch } from '@/lib/swr';
import { productKey, fetchProductDetail } from '@/lib/queries/product';
import { recordImpression, recordClick } from '@/lib/feed/events';
import { noteInteraction } from '@/lib/feed/session';
import type { FeedBucket } from '@/lib/feed/assemble';

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
  /** 推薦 feed 的桶別／位置（首頁推薦頁籤才有）：有帶就記曝光與點擊（lib/feed/events） */
  feedBucket?: FeedBucket;
  feedPosition?: number;
  /** 首屏那幾張：高優先度、不 lazy（老闆 2026-09-03：第一次開首頁圖等很久） */
  priority?: boolean;
  /** 系列（session 意圖／item-to-item 用） */
  series?: string | null;
  unitLabel?: string;
  /** 抽卡卡包模式：一包幾張。>=2 時價格單位與庫存都以「包」呈現 */
  cardsPerPack?: number;
  showRemainingText?: boolean;
}

/**
 * 這次工作階段已經載完的圖片網址（模組層、跨掛載）。
 *
 * 首頁切頁籤、從商品頁返回都會把小卡整批卸載再掛載；以前真圖直接放，快取命中時瀏覽器
 * 同步畫出來，切來切去都是絲滑的。2026-09-03 上午改成「先墊預設圖、等 onLoad 再淡入」，
 * 結果每次重新掛載都從預設圖開始等事件、再淡入 —— 老闆當天就回報「今天之前都很絲滑」。
 * 所以載過的網址記下來：重新掛載時直接畫真圖、不墊、不淡入；預設圖只留給真的還沒載過的圖。
 */
const loadedImageSrcs = new Set<string>();

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
    feedBucket,
    feedPosition,
    priority = false,
    series,
    unitLabel,
    cardsPerPack,
    showRemainingText = true,
  } = props;

  /*
   * 列表上出現抽卡商品時，趁瀏覽器閒置先把內建的五款卡包圖抓進快取
   *（老闆 2026-09-01：進商品頁時卡包是純白的、要等圖）。
   * 那五張是 `?v=` 雜湊、一年 immutable，暖過一次之後點進任何抽卡商品
   * 都是本機讀取。一個 session 只會真的跑一次，重複呼叫沒有成本。
   */
  useEffect(() => { if (type === 'card') prefetchPackArt(); }, [type]);
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
  /* 先吃 400px 縮圖（thumbUrl），缺縮圖退回原圖，原圖也壞才退預設圖 */
  const preferred = thumbUrl(image) || fallbackImage;
  const [displayImage, setDisplayImage] = useState<string>(preferred);

  /*
   * 按下就預取（老闆 2026-08-22 頁面加載優化 ⑤）：touchstart 比 click 早 100ms 左右，
   * 先把商品頁的主資料（lib/queries/product，跟商品頁同一個 key）跟路由 JS 抓起來，
   * 手指放開換頁時資料多半已經到了。桌機用 mouseenter。5 秒內重複按不會重打。
   */
  const queryClient = useQueryClient();
  const router = useRouter();

  /*
   * 曝光埋點（階段二學習資料）：卡片有 ≥50% 進入視口就記一筆，同 session 同卡只記一次
   *（lib/feed/events 會去重）。只有首頁推薦頁籤帶 feedBucket，其他列表不記。
   */
  const cardRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (feedBucket === undefined || !cardRef.current || typeof IntersectionObserver === 'undefined') return;
    const el = cardRef.current;
    const numericId = Number(id);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          recordImpression(numericId, feedBucket, feedPosition);
          io.disconnect();
        }
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [id, feedBucket, feedPosition]);

  const warm = () => {
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      prefetch(queryClient, productKey(numericId), () => fetchProductDetail(createClient(), numericId));
    }
    router.prefetch(href);
  };
  const [imgError, setImgError] = useState(false);
  /* 真圖到了沒。這次工作階段載過的網址一開始就算已載入（見 loadedImageSrcs）；
     預設圖本身（沒有圖片網址、或載失敗退回）也不用等 */
  const [imgLoaded, setImgLoaded] = useState(() => loadedImageSrcs.has(preferred));
  const showFallback = !imgLoaded && displayImage !== DEFAULT_IMAGE;
  const imgRef = useRef<HTMLImageElement>(null);
  const markLoaded = () => { loadedImageSrcs.add(displayImage); setImgLoaded(true); };

  useEffect(() => {
    const next = thumbUrl(image) || fallbackImage;
    setDisplayImage(next);
    setImgError(false);
    setImgLoaded(loadedImageSrcs.has(next));
  }, [image, fallbackImage]);

  /*
   * 掛載當下就檢查：瀏覽器快取命中時 <img> 一建立就是完成狀態，load 事件可能在 React
   * 掛上 onLoad 之前就發過了 —— 只靠 onLoad 會一直停在預設圖。同步判定、第一幀就畫真圖。
   */
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0 && !imgLoaded) markLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayImage]);

  const handleImageError = () => {
    // 縮圖不存在（還沒回填、或不是我們產的圖）→ 退回原圖；原圖也壞 → 預設圖
    if (image && displayImage !== image && displayImage === thumbUrl(image)) {
      setDisplayImage(image);
      setImgLoaded(loadedImageSrcs.has(image));
      return;
    }
    if (!imgError) {
      setImgError(true);
      setDisplayImage(DEFAULT_IMAGE);
      setImgLoaded(true);   // 退回預設圖就不用再等了
    }
  };

  /* 抽卡買的是「一包」，張數是內部籤位數（migration 584）。
     這裡不換算的話，列表會顯示「1000/1000」而玩家只買得到 100 包。
     一包 1 張時換算前後一樣，但單位仍寫「/包」—— 商品頁已經統一成包
     （migration 666 拿掉了單抽／卡包兩種模式），兩邊的字要對得起來 */
  const perPack = type === 'card' && (cardsPerPack ?? 1) >= 2 ? (cardsPerPack as number) : 1
  const effUnitLabel = unitLabel ?? (type === 'card' ? '/包' : '/抽')
  const packTotal = typeof total === 'number' ? Math.floor(total / perPack) : total
  const packRemaining = typeof remaining === 'number' ? Math.floor(remaining / perPack) : remaining

  const remainingText =
    showRemainingText && typeof packTotal === 'number' && typeof packRemaining === 'number' && packTotal > 0
      ? `${Math.max(packRemaining, 0)}/${packTotal}`
      : null;

  return (
    <Link
      ref={cardRef}
      href={href}
      onTouchStart={warm}
      onMouseEnter={warm}
      className="group block h-full"
      onClick={() => {
        if (feedBucket !== undefined) recordClick(Number(id), feedBucket, feedPosition);
        // 這一趟的意圖：下一次刷新馬上偏向同系列／同類型（lib/feed/session.ts）
        noteInteraction({ id, series, type, price }, 'click');
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
            {/* 載入中先墊預設圖、真圖載完才蓋上去（老闆 2026-09-03：回首頁小卡一片白）。
                以前是真圖直接放、底下只有淺灰底色，網路慢或快取失效重新驗證的那段就是空格。
                做法同最新上架彈窗的 ProductThumb：預設圖永遠在底下，真圖用透明度切換 */}
            {showFallback && (
              <Image
                src={DEFAULT_IMAGE}
                alt=""
                aria-hidden
                fill
                className="object-contain"
                unoptimized
              />
            )}
            {/* 不淡入：快取命中要跟以前一樣同一幀出現；真的從網路來的圖載完直接換上 */}
            <Image 
              ref={imgRef}
              src={displayImage}
              alt={name}
              fill
              className={cn("object-contain", showFallback && "opacity-0")}
              unoptimized
              priority={priority}
              fetchPriority={priority ? 'high' : undefined}
              onLoad={markLoaded}
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
