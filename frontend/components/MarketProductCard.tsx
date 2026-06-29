'use client';

import Image from 'next/image';
import { useState } from 'react';

const ITEM_IMAGES = [
  '/images/item/10001.jpg',
  '/images/item/10002.jpg',
  '/images/item/10003.jpg',
  '/images/item/10004.jpg',
  '/images/item/10005.jpg',
  '/images/item/10006.jpg',
  '/images/item/10007.jpg',
  '/images/item/10008.jpg',
  '/images/item/10009.jpg',
  '/images/item/10010.jpg',
  '/images/item/10011.jpg',
  '/images/item/10012.jpg',
  '/images/item/10013.jpg',
  '/images/item/10014.jpg',
  '/images/item/10015.jpg',
  '/images/item/10016.jpg',
  '/images/item/10017.jpg',
  '/images/item/10018.jpg',
  '/images/item/10019.jpg',
  '/images/item/10020.jpg',
];

const DEFAULT_IMAGE = '/images/item.png';

const getItemImageForId = (id: string | number) => {
  if (ITEM_IMAGES.length === 0) return DEFAULT_IMAGE;
  const key = typeof id === 'number' ? id.toString() : id;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const index = hash % ITEM_IMAGES.length;
  return ITEM_IMAGES[index] || DEFAULT_IMAGE;
};

interface MarketProductCardProps {
  id: string | number;
  productId?: number;
  name: string;
  image: string;
  price: number;
  grade?: string;
  series?: string;
  isUserOwned?: boolean;
  onClick?: () => void;
}

export default function MarketProductCard({
  id,
  name,
  image,
  price,
  grade,
  series,
  onClick,
}: MarketProductCardProps) {

  const [displayImage, setDisplayImage] = useState(image || getItemImageForId(id));

  return (
    <div 
      onClick={onClick}
      className="group block h-full cursor-pointer"
    >
      <div className="relative h-full flex flex-col bg-white dark:bg-neutral-900 rounded-[8px] border border-neutral-100 dark:border-neutral-800 overflow-hidden transition-transform duration-300">
        <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800 rounded-t-[8px]">
          <div className="w-full h-full flex items-center justify-center text-white/20 group-hover:scale-105 transition-transform duration-500 relative">
            <Image 
              src={displayImage} 
              alt={name}
              fill
              className="object-cover"
              unoptimized
              onError={() => setDisplayImage(DEFAULT_IMAGE)}
            />
          </div>
        </div>

        <div className="flex flex-col flex-1 p-2 md:pt-2 md:-mt-0.5">
          <div className="mb-1 min-h-[2.75rem]">
            {series && (
              <p className="text-[11px] font-medium text-neutral-400 mb-0.5 line-clamp-1">
                {series}
              </p>
            )}
            <h3 className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25] group-hover:text-primary transition-colors break-all">
              {grade && (
                <span className="inline-flex align-middle mr-1 relative -top-[0.1rem] h-4 px-1 text-[8px] font-medium text-white rounded-[4px] shadow-lg uppercase tracking-wider items-center gap-1 backdrop-blur-sm bg-opacity-90 bg-accent-red">
                  {grade}賞
                </span>
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
                    <Image src="/images/gcoin.png" alt="G" width={14} height={14} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[24px] leading-none font-black font-amount text-[#EE4D2D] tracking-tight">{price.toLocaleString()}</span>
                    <span className="text-[11px] font-black text-neutral-400">/個</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
