import React from 'react';
import Image from 'next/image';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { imgAvatar, img, imgAvatar1, img1, imgAvatar2, img2 } from '../assets';

// Global G Coin Icon
const imgGCoin = "/images/gcoin.png";
const imgRanking123 = "/images/rank/ranking123.png";
const imgDefaultAvatar = "/images/avatar.png";

const TITLE_STYLES: Record<string, string> = {
  gold:   'bg-gradient-to-r from-yellow-400 to-amber-500',
  purple: 'bg-gradient-to-r from-purple-500 to-violet-600',
  red:    'bg-gradient-to-r from-rose-500 to-pink-600',
  blue:   'bg-gradient-to-r from-blue-500 to-cyan-500',
  green:  'bg-gradient-to-r from-emerald-500 to-teal-500',
};

function TitleBadge({ title }: { title: { name: string; color_key: string } }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-white text-[18px] font-bold leading-none mb-1 ${TITLE_STYLES[title.color_key] || TITLE_STYLES.gold}`}>
      {title.name}
    </span>
  );
}

export type RankingItemData = {
  user_id: string;
  rank: number;
  nickname: string;
  avatar_url: string;
  amount: string | number;
  isPlaceholder?: boolean;
  title?: { name: string; color_key: string } | null;
};

type RankingTop3Props = {
  data: RankingItemData[];
  onWorship: (item: RankingItemData) => void;
  type: 'token' | 'gift' | 'percent';
};

export function RankingTop3({ data, onWorship, type }: RankingTop3Props) {
  // Ensure we have at least empty placeholders if data is missing
  const rank1 = data.find(d => d.rank === 1);
  const rank2 = data.find(d => d.rank === 2);
  const rank3 = data.find(d => d.rank === 3);

  return (
    <div className="absolute content-stretch flex gap-[14.844px] h-[395.313px] items-end justify-center left-[32.03px] overflow-clip py-[3.906px] top-[167.19px]">
      {/* 2nd Place */}
      <div className="content-stretch flex flex-col h-[300.781px] items-center relative shrink-0 w-[218.75px]">
        {rank2 ? (
          <>
            <div
              className={clsx("cursor-pointer active:scale-95 transition-transform", rank2.isPlaceholder && "pointer-events-none cursor-default")}
              onClick={() => !rank2.isPlaceholder && onWorship(rank2)}
            >
              <BackgroundImage>
                <div className="absolute inset-[15.79%] rounded-full overflow-hidden" data-name="avatar">
                  <Image alt="" className="object-cover" fill src={rank2.avatar_url || imgAvatar} unoptimized />
                </div>
                <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={img} />
              </BackgroundImage>
            </div>
            <div
              className={clsx("flex flex-col items-center relative shrink-0 w-[220.313px] cursor-pointer", rank2.isPlaceholder && "pointer-events-none cursor-default")}
              onClick={() => !rank2.isPlaceholder && onWorship(rank2)}
            >
              {rank2.title && !rank2.isPlaceholder && <TitleBadge title={rank2.title} />}
              <div className="h-[37.5px] flex items-center justify-center w-full">
                <BackgroundImageAndText6 text={rank2.nickname} additionalClassNames="justify-center text-center" />
              </div>
            </div>
            <BackgroundImageAndText3 text={rank2.amount.toString()} type={type} />
          </>
        ) : <div className="w-full h-full flex items-center justify-center opacity-30 text-white">虛位以待</div>}
      </div>

      {/* 1st Place */}
      <div className="content-stretch flex flex-col h-[359.375px] items-center relative shrink-0 w-[218.75px]">
        {rank1 ? (
          <>
            <div
              className={clsx("relative shrink-0 size-[187.5px] cursor-pointer active:scale-95 transition-transform", rank1.isPlaceholder && "pointer-events-none cursor-default")}
              data-name="头像组合/ 富豪榜/ 前三"
              onClick={() => !rank1.isPlaceholder && onWorship(rank1)}
            >
              <div className="absolute left-0 size-[187.5px] top-0" data-name="头像组合/ 一般">
                <div className="absolute inset-[15.79%] rounded-full overflow-hidden" data-name="avatar">
                  <Image alt="" className="object-cover" fill src={rank1.avatar_url || imgAvatar1} unoptimized />
                </div>
                <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={img1} />
              </div>
            </div>
            <div
              className={clsx("flex flex-col items-center relative shrink-0 w-full cursor-pointer", rank1.isPlaceholder && "pointer-events-none cursor-default")}
              onClick={() => !rank1.isPlaceholder && onWorship(rank1)}
            >
              {rank1.title && !rank1.isPlaceholder && <TitleBadge title={rank1.title} />}
              <div className="h-[37.5px] flex items-center justify-center w-full">
                <BackgroundImageAndText6 text={rank1.nickname} additionalClassNames="justify-center text-center" />
              </div>
            </div>
            <BackgroundImageAndText3 text={rank1.amount.toString()} type={type} />
          </>
        ) : <div className="w-full h-full flex items-center justify-center opacity-30 text-white">虛位以待</div>}
      </div>

      {/* 3rd Place */}
      <div className="content-stretch flex flex-col h-[263.281px] items-center relative shrink-0 w-[218.75px]">
        {rank3 ? (
          <>
            <div
              className={clsx("cursor-pointer active:scale-95 transition-transform", rank3.isPlaceholder && "pointer-events-none cursor-default")}
              onClick={() => !rank3.isPlaceholder && onWorship(rank3)}
            >
              <BackgroundImage>
                <div className="absolute inset-[15.79%] rounded-full overflow-hidden" data-name="avatar">
                  <Image alt="" className="object-cover" fill src={rank3.avatar_url || imgAvatar2} unoptimized />
                </div>
                <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={img2} />
              </BackgroundImage>
            </div>
            <div
              className={clsx("flex flex-col items-center relative shrink-0 w-[220.313px] cursor-pointer", rank3.isPlaceholder && "pointer-events-none cursor-default")}
              onClick={() => !rank3.isPlaceholder && onWorship(rank3)}
            >
              {rank3.title && !rank3.isPlaceholder && <TitleBadge title={rank3.title} />}
              <div className="h-[37.5px] flex items-center justify-center w-full">
                <BackgroundImageAndText6 text={rank3.nickname} additionalClassNames="justify-center text-center" />
              </div>
            </div>
            <BackgroundImageAndText3 text={rank3.amount.toString()} type={type} />
          </>
        ) : <div className="w-full h-full flex items-center justify-center opacity-30 text-white">虛位以待</div>}
      </div>
    </div>
  );
}

// WorshipModal removed - using shared AlertDialog instead

export function BackgroundImage({ children }: React.PropsWithChildren) {
  return (
    <div className="relative shrink-0 size-[156.25px]">
      <div className="absolute left-0 size-[156.25px] top-0" data-name="头像组合/ 一般">
        {children}
      </div>
    </div>
  );
}

export function TabsBackgroundImage({ children }: React.PropsWithChildren) {
  return (
    <div className="flex flex-col items-center justify-center size-full">
      <div className="content-stretch flex flex-col items-center justify-center py-[6.25px] relative size-full">{children}</div>
    </div>
  );
}

type MaskGroupBackgroundImageProps = {
  additionalClassNames?: string;
};

export function MaskGroupBackgroundImage({ children, additionalClassNames = "" }: React.PropsWithChildren<MaskGroupBackgroundImageProps>) {
  return (
    <div className={clsx("h-[202.859px] w-[213.967px]", additionalClassNames)}>
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 213.967 202.859">
        {children}
      </svg>
    </div>
  );
}

type BackgroundImageAndText6Props = {
  text: string;
  additionalClassNames?: string;
};

// Modified: text size to 28px, added flexibility for level and color
export function BackgroundImageAndText6({ text, additionalClassNames = "" }: BackgroundImageAndText6Props) {
  return (
    <div className={clsx("content-stretch flex flex-[1_0_0] gap-[7.813px] items-center min-h-px min-w-px relative", additionalClassNames)}>
      <p className="flex-[1_0_0] font-['Inter',sans-serif] font-normal leading-[1.2] min-h-px min-w-px not-italic overflow-hidden relative text-[28px] text-ellipsis text-shadow-[0px_1.744px_3.488px_black] text-white whitespace-nowrap">{text}</p>
    </div>
  );
}

type BackgroundImageAndText5Props = {
  text: string;
};

export function BackgroundImageAndText5({ text }: BackgroundImageAndText5Props) {
  return (
    <div className="bg-[rgba(255,255,255,0.1)] content-stretch flex flex-col items-center justify-center overflow-clip relative rounded-[78.125px] shrink-0 w-[37.5px]">
      <p className="font-['Inter',sans-serif] font-bold leading-[1.2] not-italic relative shrink-0 text-[28.125px] text-center text-white">{text}</p>
    </div>
  );
}

type BackgroundImageAndText4Props = {
  text: string;
};

export function BackgroundImageAndText4({ text, type = 'token' }: BackgroundImageAndText4Props & { type?: 'token' | 'gift' | 'percent' }) {
  return (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0">
      {type === 'token' && <GiftboxBackgroundImage />}
      {type === 'gift' && (
        <div className="relative shrink-0 size-[25px]">
          <img alt="" className="absolute inset-0 max-w-none object-contain pointer-events-none size-full" src="/images/gift.png" />
        </div>
      )}
      <p className="font-amount font-bold leading-[26px] not-italic relative shrink-0 text-[#ffc700] text-[28.125px]">{text}</p>
    </div>
  );
}

export function GiftboxBackgroundImage() {
  return (
    <div className="relative w-[18px] h-[18px] mr-1.5 flex-shrink-0">
      <Image src="/images/coin.png" alt="Coin" fill className="object-contain" unoptimized />
    </div>
  );
}

export function BackgroundImageAndText3({ text, type = 'token' }: { text: string; type?: 'token' | 'gift' | 'percent' }) {
  return (
    <div className="content-stretch flex gap-[7.813px] h-[37.5px] items-center justify-center relative shrink-0 w-full">
      {type === 'token' && (
        <div className="relative shrink-0 size-[23.438px]">
          <img alt="" className="absolute inset-0 max-w-none object-contain pointer-events-none size-full" src={imgGCoin} />
        </div>
      )}
      {type === 'gift' && (
        <div className="relative shrink-0 size-[23.438px]">
          <img alt="" className="absolute inset-0 max-w-none object-contain pointer-events-none size-full" src="/images/gift.png" />
        </div>
      )}
      <p className="font-amount font-bold leading-[1.2] not-italic relative shrink-0 text-[#ffc700] text-[28.125px]">{text}</p>
    </div>
  );
}



// New Components for Clean Architecture

export function RankingBackgroundBlobs() {
  return (
    <>
      <div className="absolute flex h-[235.449px] items-center justify-center left-[586.9px] mix-blend-color-dodge top-[105.74px] w-[236.027px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "19" } as React.CSSProperties}>
        <div className="flex-none rotate-[-13.4deg]">
          <div className="h-[195.313px] relative w-[196.094px]">
            <div className="absolute inset-[-80%_-79.68%]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 508.594 507.812">
                <g filter="url(#filter0_f_1_361)" id="Ellipse 998" opacity="0.7" style={{ mixBlendMode: "color-dodge" }}>
                  <ellipse cx="254.297" cy="253.906" fill="var(--fill-0, #97A0BF)" rx="98.0469" ry="97.6562" />
                </g>
                <defs>
                  <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="507.812" id="filter0_f_1_361" width="508.594" x="0" y="0">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
                    <feGaussianBlur result="effect1_foregroundBlur_1_361" stdDeviation="78.125" />
                  </filter>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute flex h-[254.645px] items-center justify-center left-[-106.52px] mix-blend-color-dodge top-[-79.91px] w-[316.584px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "19" } as React.CSSProperties}>
        <div className="flex-none rotate-[-13.4deg]">
          <div className="h-[195.313px] relative w-[278.906px]">
            <div className="absolute inset-[-80%_-56.02%]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 591.406 507.812">
                <g filter="url(#filter0_f_1_357)" id="Ellipse 999" opacity="0.7" style={{ mixBlendMode: "color-dodge" }}>
                  <ellipse cx="295.703" cy="253.906" fill="var(--fill-0, #B097BF)" fillOpacity="0.8" rx="139.453" ry="97.6562" />
                </g>
                <defs>
                  <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="507.812" id="filter0_f_1_357" width="591.406" x="0" y="0">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
                    <feGaussianBlur result="effect1_foregroundBlur_1_357" stdDeviation="78.125" />
                  </filter>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute flex h-[165.898px] items-center justify-center left-[200.02px] mix-blend-color-dodge top-[192.93px] w-[271.32px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "19" } as React.CSSProperties}>
        <div className="flex-none rotate-[-13.4deg]">
          <div className="h-[110.344px] relative w-[252.623px]">
            <div className="absolute inset-[-141.6%_-61.85%]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 565.123 422.844">
                <g filter="url(#filter0_f_1_355)" id="Ellipse 1000" style={{ mixBlendMode: "color-dodge" }}>
                  <ellipse cx="282.561" cy="211.422" fill="var(--fill-0, #C0BF9B)" fillOpacity="0.39" rx="126.311" ry="55.1719" />
                </g>
                <defs>
                  <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="422.844" id="filter0_f_1_355" width="565.123" x="0" y="0">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
                    <feGaussianBlur result="effect1_foregroundBlur_1_355" stdDeviation="78.125" />
                  </filter>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute h-[496.094px] left-[-51.56px] overflow-clip top-[45.31px] w-[835.938px]" />
    </>
  );
}

export function RankingTopDecorations() {
  return (
    <div className="absolute left-0 top-[167px] w-[750px]">
      <div className="relative w-full h-auto">
        <Image 
          src={imgRanking123} 
          alt="Ranking Top 3 Background" 
          width={750}
          height={400}
          className="w-full h-auto object-cover"
          unoptimized
        />
      </div>
      <div className="absolute bg-gradient-to-b blur-[1.563px] from-[rgba(35,36,42,0)] h-[78.906px] left-0 to-[#23242a] top-[125.79px] w-[750px]" data-name="image 269" />
    </div>
  );
}

export function RankingListItem({ rank, avatarSrc, nickname, amount, onWorship, isPlaceholder, type = 'token', title }: RankingListItemProps) {
  const resolvedAvatarSrc = (avatarSrc && avatarSrc.trim()) ? avatarSrc : imgDefaultAvatar
  return (
    <div className="content-stretch flex gap-[18.75px] items-center py-[18.75px] relative shrink-0 w-full">
      <div className="content-stretch flex flex-col items-center justify-center relative shrink-0 w-[53.125px]">
        <BackgroundImageAndText5 text={rank.toString()} />
      </div>
      <div 
        className={clsx("relative shrink-0 size-[84.375px] cursor-pointer active:scale-95 transition-transform", isPlaceholder && "pointer-events-none cursor-default")}
        onClick={() => !isPlaceholder && onWorship({ user_id: '', rank, nickname, avatar_url: avatarSrc, amount, isPlaceholder })}
      >
        <div className="absolute inset-0 rounded-full overflow-hidden border-[1.563px] border-[#3e3f43]" data-name="avatar">
          <Image 
            src={resolvedAvatarSrc} 
            alt={nickname || 'User'} 
            fill
            className="object-cover" 
            unoptimized 
          />
        </div>
      </div>
      <div
        className={clsx("flex flex-[1_0_0] flex-col items-start justify-center min-w-0 cursor-pointer", isPlaceholder && "pointer-events-none cursor-default")}
        onClick={() => !isPlaceholder && onWorship({ user_id: '', rank, nickname, avatar_url: avatarSrc, amount, isPlaceholder, title })}
      >
        {title && !isPlaceholder && (
          <TitleBadge title={title} />
        )}
        <p className="font-normal leading-[1.2] text-[28px] text-white overflow-hidden text-ellipsis whitespace-nowrap w-full" style={{ textShadow: '0px 1.744px 3.488px black' }}>
          {nickname}
        </p>
      </div>
      <div className="content-stretch flex gap-[20px] items-center relative shrink-0 ml-auto">
        <BackgroundImageAndText4 text={amount.toString()} type={type} />
      </div>
    </div>
  );
}

type RankingListItemProps = {
  rank: number;
  avatarSrc: string;
  nickname: string;
  amount: string | number;
  onWorship: (item: RankingItemData) => void;
  isPlaceholder?: boolean;
  type?: 'token' | 'gift' | 'percent';
  title?: { name: string; color_key: string } | null;
};


type BackgroundImageAndTextProps = {
  text: string;
};

export function BackgroundImageAndText({ text }: BackgroundImageAndTextProps) {
  return (
    <div className="grid-cols-[max-content] grid-rows-[max-content] inline-grid place-items-start relative shrink-0">
      <div className="bg-[rgba(255,255,255,0)] col-1 h-[6.25px] ml-[32.81px] mt-[45.31px] rounded-[78.125px] row-1 w-[37.5px]" />
      <p className="col-1 font-['Inter','Noto_Sans_JP',sans-serif] font-normal leading-[1.2] ml-0 mt-0 not-italic relative row-1 text-[34.375px] text-[rgba(255,255,255,0.6)] text-center">{text}</p>
    </div>
  );
}

type RankingCategoryTabsProps = {
  activeCategory: 'reward' | 'draws';
  onCategoryChange: (category: 'reward' | 'draws') => void;
};

export function RankingCategoryTabs({ activeCategory, onCategoryChange }: RankingCategoryTabsProps) {
  return (
    <div className="absolute z-10 top-[18.75px] left-[37.5px] content-stretch flex h-[80px] items-center shrink-0 w-[675px] justify-between px-8">
      {[
        { id: 'reward', label: '賞金狂人' },
        { id: 'draws', label: '轉蛋魔人' }
      ].map((tab) => (
        <div 
          key={tab.id}
          className="content-stretch flex flex-[1_0_0] h-full items-center justify-center min-h-px min-w-px relative cursor-pointer"
          onClick={() => onCategoryChange(tab.id as 'reward' | 'draws')}
        >
          {activeCategory === tab.id && (
            <motion.div 
              layoutId="activeCategoryIndicator"
              className="absolute border-[#577fe5] border-b-4 border-solid inset-0 pointer-events-none" 
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <p className={clsx(
            "font-sans font-medium leading-[normal] not-italic relative shrink-0 text-[28px] transition-colors duration-300",
            activeCategory === tab.id ? "text-white" : "text-[#818181]"
          )}>{tab.label}</p>
        </div>
      ))}
    </div>
  );
}

type RankingTimeTabsProps = {
  activeTab: 'daily' | 'weekly';
  onTabChange: (tab: 'daily' | 'weekly') => void;
};

export function RankingTimeTabs({ activeTab, onTabChange }: RankingTimeTabsProps) {
  return (
    <div className="absolute z-10 bg-[rgba(0,0,0,0.2)] left-[200px] rounded-[78.125px] top-[114.06px]" data-name="tabs">
      <div className="content-stretch flex items-center justify-center overflow-clip relative rounded-[inherit]">
        <div 
          className="h-[53.125px] relative shrink-0 w-[175px] cursor-pointer" 
          onClick={() => onTabChange('daily')}
          style={activeTab === 'daily' ? { backgroundImage: "linear-gradient(151.216deg, rgb(240, 224, 195) 32.138%, rgb(221, 189, 134) 57.06%)" } : {}}
        >
          <TabsBackgroundImage>
            <p className={clsx(
              "font-['Inter','Noto_Sans_JP',sans-serif] font-normal leading-none not-italic relative shrink-0 text-[28px] text-center w-full whitespace-pre-wrap",
              activeTab === 'daily' ? "text-[#493b17]" : "text-white"
            )}>日榜</p>
          </TabsBackgroundImage>
        </div>
        <div 
          className="h-[53.125px] relative shrink-0 w-[175px] cursor-pointer" 
          onClick={() => onTabChange('weekly')}
          style={activeTab === 'weekly' ? { backgroundImage: "linear-gradient(151.216deg, rgb(240, 224, 195) 32.138%, rgb(221, 189, 134) 57.06%)" } : {}}
        >
          <TabsBackgroundImage>
            <p className={clsx(
              "font-['Inter','Noto_Sans_JP',sans-serif] font-normal leading-none not-italic relative shrink-0 text-[28px] text-center w-full whitespace-pre-wrap",
              activeTab === 'weekly' ? "text-[#493b17]" : "text-white"
            )}>周榜</p>
          </TabsBackgroundImage>
        </div>
      </div>
      <div aria-hidden="true" className="absolute border-[1.563px] border-[rgba(255,255,255,0.2)] border-solid inset-0 pointer-events-none rounded-[78.125px]" />
    </div>
  );
}

export function RankingListContainer({ children }: React.PropsWithChildren) {
  return (
    <div className="relative content-stretch flex flex-col items-start left-[48.44px] mt-[604.69px] w-[653.125px] pb-64">
      {children}
    </div>
  );
}
