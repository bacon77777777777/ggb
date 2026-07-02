import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import Image from 'next/image';
import { missionSvgs as svgPaths } from './mission-svgs';
import RulesModal from '@/components/ui/RulesModal';

const imgImage22 = "/images/mission/bg-overlay.png";
const imgImage20 = "/images/mission/bg-pattern.png";
const imgCoin = "/images/coin.png";
const imgCheck = "/images/check.png";

const FloatingReward = ({ x, y, reward, onComplete }: { x: number; y: number; reward: number; onComplete: () => void }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 0, scale: 0.8 }}
      animate={{ opacity: [0, 1, 1, 0], y: -40, scale: 1 }}
      transition={{ duration: 1.2, times: [0, 0.2, 0.8, 1], ease: "easeOut" }}
      onAnimationComplete={onComplete}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
      className="flex items-center gap-1"
    >
      <div className="relative w-5 h-5 shrink-0">
        <Image src={imgCoin} alt="Coin" fill className="object-contain" unoptimized />
      </div>
      <span className="text-[#ff5e00] text-[20px] font-bold">+{reward}</span>
    </motion.div>
  );
};



type Text3Props = {
  text: string;
  onClick?: () => void;
};

function Text3({ text, onClick }: Text3Props) {
  return (
    <div onClick={onClick} className="content-stretch flex h-[48px] items-center justify-center relative rounded-[100px] shrink-0 w-[112px] cursor-pointer active:scale-95 transition-transform">
      <div aria-hidden="true" className="absolute border border-[#ff5e00] border-solid inset-0 pointer-events-none rounded-[100px]" />
      <p className="font-sans font-medium leading-[normal] not-italic relative shrink-0 text-[#ff5e00] text-[26px] text-center">{text}</p>
    </div>
  );
}

type Text2Props = {
  text: string;
  onClick?: (e: React.MouseEvent) => void;
};

function Text2({ text, onClick }: Text2Props) {
  return (
    <div onClick={onClick} className="bg-gradient-to-r content-stretch flex from-[#ffa048] h-[48px] items-center justify-center relative rounded-[100px] shrink-0 to-[#fd4703] w-[112px] cursor-pointer active:scale-95 transition-transform">
      <p className="font-sans font-medium leading-[normal] not-italic relative shrink-0 text-[26px] text-center text-white">{text}</p>
    </div>
  );
}

function Helper1() {
  return (
    <div className="relative shrink-0 size-[80px]">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 80 80">
        <circle cx="40" cy="40" fill="var(--fill-0, #D9D9D9)" id="Ellipse 4" r="40" />
      </svg>
    </div>
  );
}

type HelperProps = {
  text: string;
  text1: string;
};

function Helper({ text, text1 }: HelperProps) {
  return (
    <div className="content-stretch flex gap-[12px] items-end relative shrink-0 w-full">
      <p className="font-sans font-medium relative shrink-0 text-[#1b1b1b] text-[28px]">{text}</p>
      <p className="font-sans font-normal relative shrink-0 text-[#ff5e00] text-[24px]">{text1}</p>
    </div>
  );
}

type Text1Props = {
  text: string;
};

function Text1({ text }: Text1Props) {
  return (
    <div className="content-stretch flex flex-col gap-[10px] items-center relative shrink-0">
      <ImageAndText text="+20" additionalClassNames="bg-[#f1f3f4]" />
      <p className="font-sans font-normal leading-[normal] not-italic relative shrink-0 text-[#a8a8a8] text-[22px] text-right">{text}</p>
    </div>
  );
}

type ImageAndTextProps = {
  text: string;
  additionalClassNames?: string;
};

function ImageAndText({ text, additionalClassNames = "" }: ImageAndTextProps) {
  return (
    <div className={clsx("content-stretch flex flex-col gap-[8px] h-[104px] items-center justify-center overflow-clip pt-[6px] relative rounded-[8px] shrink-0 w-[88px]", additionalClassNames)}>
      <div className="relative w-[88px] h-[60px] flex items-center justify-center">
         <Image alt="" width={40} height={40} className="object-contain" src={imgCoin} unoptimized />
      </div>
      <p className="font-['DIN_Alternate:Bold',sans-serif] font-bold leading-[normal] min-w-full not-italic relative shrink-0 text-[#711e15] text-[26px] text-center w-[min-content] whitespace-pre-wrap">{text}</p>
    </div>
  );
}

type TextProps = {
  text: string;
};

function Text({ text }: TextProps) {
  return (
    <div className="content-stretch flex flex-col gap-[10px] items-center relative shrink-0">
      <div className="bg-[#ffe8e7] content-stretch flex flex-col gap-[8px] h-[104px] items-center justify-center overflow-clip pt-[6px] relative rounded-[8px] shrink-0 w-[88px]">
        <div className="relative w-[88px] h-[60px] flex items-center justify-center">
           <img alt="" className="w-[40px] h-[40px] object-contain" src={imgCheck} />
        </div>
        <p className="font-['DIN_Alternate:Bold',sans-serif] font-bold leading-[normal] min-w-full not-italic relative shrink-0 text-[#711e15] text-[26px] text-center w-[min-content] whitespace-pre-wrap">{"+20"}</p>
      </div>
      <p className="font-sans font-normal leading-[normal] not-italic relative shrink-0 text-[#1b1b1b] text-[22px] text-right">{text}</p>
    </div>
  );
}

type BgImageProps = {
  additionalClassNames?: string;
};

function BgImage({ additionalClassNames = "" }: BgImageProps) {
  return (
    <div className={clsx("absolute inset-0 overflow-hidden pointer-events-none", additionalClassNames)}>
      <img alt="" className="absolute h-[152.67%] left-0 max-w-none top-[-52.17%] w-full" src={imgImage22} />
    </div>
  );
}

export interface Mission {
  id: string;
  title: string;
  reward: number;
  description: string;
  status: 'pending' | 'completed' | 'claimed';
  type: 'daily' | 'weekly' | 'achievement';
  periodKey?: string;
  condition_type?: string;
  target_value?: number;
  current_value?: number;
}

const TITLE_STYLES: Record<string, string> = {
  gold:   'from-yellow-400 to-amber-500',
  purple: 'from-purple-500 to-violet-600',
  red:    'from-rose-500 to-pink-600',
  blue:   'from-blue-500 to-cyan-500',
  green:  'from-emerald-500 to-teal-500',
};

const ACHIEVEMENT_TITLE: Record<string, { name: string; color: string }> = {
  'draw_count:500':        { name: '轉蛋狂熱者', color: 'purple' },
  'draw_count:1000':       { name: '抽蛋之神',   color: 'gold'   },
  'draw_count:5000':       { name: '命運支配者', color: 'red'    },
  'login_streak:30':       { name: '全勤戰士',   color: 'green'  },
  'login_streak:100':      { name: '吉吉比居民', color: 'blue'   },
  'recharge_amount:20000': { name: '小課玩家',   color: 'purple' },
  'recharge_amount:100000':{ name: '傳說課長',   color: 'gold'   },
  'topup_streak:10':       { name: '真愛玩家',   color: 'red'    },
  'invite_friend:20':      { name: '人氣王',     color: 'blue'   },
  'invite_friend:100':     { name: '推廣大使',   color: 'green'  },
  'top_prize_day3:3':      { name: '歐皇',       color: 'gold'   },
  'top_prize_count:10':    { name: '天選之人',   color: 'purple' },
  'top_prize_count:50':    { name: '命運代行者', color: 'red'    },
  'single_day_draws:100':  { name: '火力全開',   color: 'red'    },
};

const ACHIEVEMENT_MASK: Record<string, number> = {
  'draw_count:1': 1, 'draw_count:30': 2, 'draw_count:100': 3, 'draw_count:500': 4,
  'draw_count:1000': 5, 'draw_count:5000': 6, 'draw_streak:10': 7, 'draw_streak:20': 8,
  'login_streak:7': 9, 'login_streak:30': 10, 'login_streak:100': 11,
  'recharge:1': 1, 'recharge_amount:1000': 2, 'recharge_amount:5000': 3,
  'recharge_amount:20000': 4, 'recharge_amount:100000': 5, 'topup_streak:5': 6,
  'topup_streak:10': 7, 'invite_friend:1': 8, 'invite_friend:5': 9,
  'invite_friend:20': 10, 'invite_friend:100': 11, 'top_prize_first:1': 1,
  'top_prize_day3:3': 2, 'top_prize_count:10': 3, 'top_prize_count:50': 4,
  'bad_luck_streak:10': 5, 'single_day_draws:100': 6, 'birthday_draw:1': 7,
};

interface MissionFrameProps {
  consecutiveDays: number;
  points: number;
  missions: Mission[];
  activeTab: 'daily' | 'weekly' | 'achievement';
  onTabChange: (tab: 'daily' | 'weekly' | 'achievement') => void;
  onCheckIn: () => void;
  onMissionAction: (mission: Mission) => void;
  minHeight?: number;
}

function MissionFrame({ 
  consecutiveDays, 
  points, 
  missions, 
  activeTab, 
  onTabChange, 
  onCheckIn, 
  onMissionAction,
  minHeight
}: MissionFrameProps) {
  const [optimisticClaimedIds, setOptimisticClaimedIds] = useState<Set<string>>(new Set());
  const [floatingRewards, setFloatingRewards] = useState<{ id: number; x: number; y: number; reward: number }[]>([]);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const sortedMissions = useMemo(() => {
    const filtered = missions.filter(m => m.type === activeTab);
    return filtered.sort((a, b) => {
      const aClaimed = a.status === 'claimed' || optimisticClaimedIds.has(a.id);
      const bClaimed = b.status === 'claimed' || optimisticClaimedIds.has(b.id);
      if (aClaimed === bClaimed) return 0;
      return aClaimed ? 1 : -1;
    });
  }, [missions, activeTab, optimisticClaimedIds]);

  const [direction, setDirection] = useState(0);

  const tabOrder: Array<'daily' | 'weekly' | 'achievement'> = ['daily', 'weekly', 'achievement'];

  const handleTabClick = (tab: 'daily' | 'weekly' | 'achievement') => {
    if (tab === activeTab) return;
    const currentIndex = tabOrder.indexOf(activeTab);
    const nextIndex = tabOrder.indexOf(tab);
    setDirection(nextIndex > currentIndex ? 1 : -1);
    onTabChange(tab);
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  const handleDragEnd = (e: MouseEvent | TouchEvent | PointerEvent, { offset, velocity }: PanInfo) => {
    const swipe = swipePower(offset.x, velocity.x);
    const currentIndex = tabOrder.indexOf(activeTab);

    if (swipe < -swipeConfidenceThreshold) {
      const next = tabOrder[currentIndex + 1];
      if (next) {
        setDirection(1);
        onTabChange(next);
      }
    } else if (swipe > swipeConfidenceThreshold) {
      const prev = tabOrder[currentIndex - 1];
      if (prev) {
        setDirection(-1);
        onTabChange(prev);
      }
    }
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0
    })
  };

  const handleClaim = (mission: Mission, e: React.MouseEvent) => {
    if (mission.status === 'claimed' || optimisticClaimedIds.has(mission.id)) return;
    
    // Capture Position
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = rect.left + (rect.width / 2) - 40; 
    const startY = rect.top - 10;

    // Add Floating Reward
    const rewardId = Date.now();
    setFloatingRewards(prev => [...prev, { id: rewardId, x: startX, y: startY, reward: mission.reward }]);

    // Optimistic Update
    setOptimisticClaimedIds(prev => {
        const next = new Set(prev);
        next.add(mission.id);
        return next;
    });
    
    // Call Action
    onMissionAction(mission);
  };

  const removeFloatingReward = (id: number) => {
    setFloatingRewards(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div 
      className="bg-gradient-to-b from-[#ff2d14] relative size-full to-[#fff0ea] via-[#ff7c46] via-[35.757%] w-[750px] h-auto overflow-visible"
      style={{ minHeight: minHeight ? `${minHeight}px` : undefined }}
    >
      {/* Top Section s1 */}
      <div className="relative min-h-[722px] w-[750px]" data-name="s1">
        <div className="absolute h-[722px] left-0 top-0 w-[750px]" data-name="bg">
          <div className="absolute h-[418px] left-[-2px] top-[20px] w-[492px]">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 492 418">
              <path d="M0 0L492 60V418L0 358V0Z" fill="url(#paint0_linear_1_156)" fillOpacity="0.15" id="Rectangle 34624748" />
              <defs>
                <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_1_156" x1="0" x2="492" y1="119" y2="119">
                  <stop stopColor="white" />
                  <stop offset="1" stopColor="white" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="absolute h-[56px] left-[343px] top-[111px] w-[63px]" data-name="image 22">
            <BgImage />
          </div>
          <div className="absolute flex h-[104.676px] items-center justify-center left-[-44.44px] top-[23.62px] w-[116.558px]" style={{ "--transform-inner-width": "1200", "--transform-inner-height": "19" } as React.CSSProperties}>
            <div className="-scale-y-100 flex-none rotate-[175.26deg]">
              <div className="blur-[3px] h-[96px] relative w-[109px]" data-name="image 23">
                <BgImage additionalClassNames="opacity-50" />
              </div>
            </div>
          </div>
          <div className="absolute h-[378px] right-0 top-[20px] w-[267px]" data-name="image 20">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img alt="" className="absolute h-full left-0 max-w-none top-0 w-full object-cover" src={imgImage20} />
            </div>
          </div>
          <div className="absolute h-[36.543px] left-[29px] top-[210px] w-[234px]">
            <div className="absolute inset-[-4.11%_-0.64%]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 237 39.5432">
                <path d={svgPaths.p34a12740} id="Vector 5" stroke="var(--stroke-0, #FFE489)" strokeLinecap="round" strokeWidth="3" />
              </svg>
            </div>
          </div>
          <div className="absolute left-[178px] size-[334px] top-[4px]" data-name="Vector">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 334 334">
              <g id="Vector">
                <path d={svgPaths.p1116880} fill="url(#paint0_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.pb9eae00} fill="url(#paint1_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p22203500} fill="url(#paint2_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p1dc79100} fill="url(#paint3_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p2fe16970} fill="url(#paint4_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p1e94aca0} fill="url(#paint5_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p2b933000} fill="url(#paint6_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p24511100} fill="url(#paint7_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p9d8b500} fill="url(#paint8_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p1ccd2040} fill="url(#paint9_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.pd968400} fill="url(#paint10_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p397801a0} fill="url(#paint11_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p5434170} fill="url(#paint12_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p49a2d00} fill="url(#paint13_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p269ea100} fill="url(#paint14_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p2869a400} fill="url(#paint15_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p24a587f0} fill="url(#paint16_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p3f3f0300} fill="url(#paint17_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p1f9c6af0} fill="url(#paint18_radial_1_144)" fillOpacity="0.5" />
                <path d={svgPaths.p1f0c2500} fill="url(#paint19_radial_1_144)" fillOpacity="0.5" />
              </g>
              <defs>
                <radialGradient cx="0" cy="0" gradientTransform="translate(167 167) rotate(90) scale(167)" gradientUnits="userSpaceOnUse" id="paint0_radial_1_144" r="1">
                  <stop stopColor="white" />
                  <stop offset="1" stopColor="white" stopOpacity="0" />
                </radialGradient>
                {/* Simplified radial gradients - assuming standard white fade */}
                {[...Array(19)].map((_, i) => (
                  <radialGradient key={i} cx="0" cy="0" gradientTransform="translate(167 167) rotate(90) scale(167)" gradientUnits="userSpaceOnUse" id={`paint${i+1}_radial_1_144`} r="1">
                    <stop stopColor="white" />
                    <stop offset="1" stopColor="white" stopOpacity="0" />
                  </radialGradient>
                ))}
              </defs>
            </svg>
          </div>
          <div className="absolute h-[36px] left-[390px] top-[165px] w-[33.5px]">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 33.5 36">
              <path d={svgPaths.p21220500} fill="var(--fill-0, white)" fillOpacity="0.23" id="Vector 6" />
            </svg>
          </div>
        </div>
        
        {/* Check-in Card */}
        <div className="absolute h-[468px] left-[24px] top-[254px] w-[702px]" data-name="card">
          <div className="absolute h-[468px] left-0 top-0 w-[702px]" data-name="bg1">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 702 468">
              <g id="bg1">
                <path d={svgPaths.p26dcd400} fill="url(#paint0_linear_1_152)" id="Vector 4" stroke="url(#paint1_linear_1_152)" strokeWidth="2" />
                <path d={svgPaths.p15805500} data-figma-bg-blur-radius="4" fill="url(#paint2_linear_1_152)" id="Vector 3" />
              </g>
              <defs>
                <clipPath id="bgblur_0_1_152_clip_path" transform="translate(4 4)">
                  <path d={svgPaths.p15805500} />
                </clipPath>
                <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_1_152" x1="2" x2="273" y1="12" y2="105">
                  <stop stopColor="#FF3820" />
                  <stop offset="1" stopColor="#FF8460" />
                </linearGradient>
                <linearGradient gradientUnits="userSpaceOnUse" id="paint1_linear_1_152" x1="2" x2="34.5" y1="12" y2="92.5">
                  <stop stopColor="white" />
                  <stop offset="1" stopColor="white" stopOpacity="0" />
                </linearGradient>
                <linearGradient gradientUnits="userSpaceOnUse" id="paint2_linear_1_152" x1="702" x2="611.5" y1="0" y2="166">
                  <stop stopColor="white" stopOpacity="0.8" />
                  <stop offset="1" stopColor="white" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <p className="absolute font-sans font-normal leading-[normal] left-[35px] not-italic text-[32px] text-white top-[27px]">簽到拿積分</p>
          <div className="absolute content-stretch flex gap-[12px] items-end justify-end leading-[normal] left-[37px] not-italic top-[103px]">
            <p className="font-sans font-medium relative shrink-0 text-[#1b1b1b] text-[28px]">已連續簽到</p>
            <p className="font-['DIN_Alternate:Bold',sans-serif] relative shrink-0 text-[#ff5e00] text-[32px] font-bold">{consecutiveDays}</p>
            <p className="font-sans font-medium relative shrink-0 text-[#1b1b1b] text-[28px]">天</p>
          </div>
          <p className="-translate-x-full absolute font-sans font-normal leading-[normal] left-[672px] not-italic text-[#a8a8a8] text-[24px] text-right top-[34px] whitespace-nowrap">每連續簽到7天，可獲得額外積分</p>
          
          {/* Check-in Days - Dynamic Mock for now */}
          <div className="absolute content-stretch flex gap-[7px] items-center left-[22px] top-[164px]">
            {/* Logic to show days 1-7. If consecutiveDays is 2, then days 1,2 are "已簽到", 3 is current/next, etc. */}
            {[1, 2, 3, 4, 5, 6].map((day) => {
               if (day <= consecutiveDays) {
                 return <Text key={day} text="已簽到" />;
               } else {
                 return <Text1 key={day} text={`第${day}天`} />;
               }
            })}
            
            <div className="content-stretch flex flex-col gap-[10px] items-center relative shrink-0">
              <ImageAndText text="+100" additionalClassNames="bg-gradient-to-b from-[#fca062] to-[#feecde]" />
              <p className="font-sans font-normal leading-[normal] not-italic relative shrink-0 text-[#a8a8a8] text-[22px] text-right">第7天</p>
            </div>
          </div>
          
          <div 
            className="absolute bg-gradient-to-r content-stretch flex from-[#ffa048] h-[86px] items-center justify-center left-[111px] rounded-[100px] shadow-[0px_10px_30px_0px_rgba(213,78,0,0.25)] to-[#fd4703] top-[345px] w-[480px] cursor-pointer active:scale-95 transition-transform" 
            data-name="button"
            onClick={onCheckIn}
          >
            <p className="font-sans font-medium leading-[normal] not-italic relative shrink-0 text-[32px] text-white">立即簽到</p>
          </div>
        </div>
        
        {/* My Points */}
        <div className="relative flex flex-col gap-[8px] items-start ml-[24px] pt-[87px] w-full" data-name="mypoint">
          <p className="font-sans font-medium text-[28px] text-white">我的積分</p>
          <p className="font-['DIN_Alternate:Bold',sans-serif] text-[70px] font-bold text-white leading-none">{points.toLocaleString()}</p>
        </div>
      </div>
      
      {/* Bottom Section s2 */}
      <div className="relative mt-[24px] w-[750px]" data-name="s2">
        <div className="relative h-auto left-[24px] top-0 w-[702px] pt-[97px]" data-name="card">
          <div className="absolute h-[97px] left-0 top-0 w-[702px] z-10">
            <div className="absolute h-[97px] left-0 top-0 w-[702px]" data-name="bg2">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 702 97">
                <g clipPath="url(#clip0_1_139)" id="bg2">
                  <path d={svgPaths.p26dcd400} fill="url(#paint0_linear_1_139)" id="Vector 4" stroke="url(#paint1_linear_1_139)" strokeWidth="2" />
                  <path d={svgPaths.p377fd870} data-figma-bg-blur-radius="4" fill="url(#paint2_linear_1_139)" id="Vector 3" />
                  <g id="Frame 1000001344" />
                </g>
                <defs>
                  <clipPath id="bgblur_1_1_139_clip_path" transform="translate(4 4)">
                    <path d={svgPaths.p377fd870} />
                  </clipPath>
                  <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_1_139" x1="2" x2="273" y1="12" y2="105">
                    <stop stopColor="#5B77E2" />
                    <stop offset="1" stopColor="#31C6FF" />
                  </linearGradient>
                  <linearGradient gradientUnits="userSpaceOnUse" id="paint1_linear_1_139" x1="2" x2="34.5" y1="12" y2="92.5">
                    <stop stopColor="white" />
                    <stop offset="1" stopColor="white" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient gradientUnits="userSpaceOnUse" id="paint2_linear_1_139" x1="444.5" x2="444.5" y1="2.95643e-06" y2="97">
                    <stop stopColor="#E5F5FF" />
                    <stop offset="1" stopColor="white" />
                  </linearGradient>
                  <clipPath id="clip0_1_139">
                    <rect fill="white" height="97" width="702" />
                  </clipPath>
                </defs>
              </svg>
            </div>
            <p className="absolute font-sans font-normal leading-[normal] left-[35px] not-italic text-[32px] text-white top-[27px]">任務中心站</p>
            <p className="-translate-x-full absolute font-sans font-normal leading-[normal] left-[672px] not-italic text-[#a8a8a8] text-[24px] text-right top-[34px] whitespace-nowrap">完成任務，即可領取積分哦</p>
          </div>
          
          <div className="relative bg-white content-stretch flex flex-col items-center left-0 px-[24px] rounded-bl-[16px] rounded-br-[16px] w-[702px] h-auto pb-[140px] overflow-visible" data-name="list">
            {/* Tabs */}
            <div className="content-stretch flex h-[100px] items-center relative shrink-0 w-full">
              <div 
                className="content-stretch flex flex-[1_0_0] h-full items-center justify-center min-h-px min-w-px relative cursor-pointer"
                onClick={() => handleTabClick('daily')}
              >
                {activeTab === 'daily' && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="absolute border-[#577fe5] border-b-4 border-solid inset-0 pointer-events-none" 
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <p className={clsx(
                  "font-sans font-medium leading-[normal] not-italic relative shrink-0 text-[28px] transition-colors duration-300",
                  activeTab === 'daily' ? "text-[#1b1b1b]" : "text-[#818181]"
                )}>每日任務</p>
              </div>
              <div 
                className="content-stretch flex flex-[1_0_0] h-full items-center justify-center min-h-px min-w-px relative cursor-pointer"
                onClick={() => handleTabClick('weekly')}
              >
                 {activeTab === 'weekly' && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="absolute border-[#577fe5] border-b-4 border-solid inset-0 pointer-events-none" 
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <p className={clsx(
                  "font-sans font-medium leading-[normal] not-italic relative shrink-0 text-[28px] transition-colors duration-300",
                  activeTab === 'weekly' ? "text-[#1b1b1b]" : "text-[#818181]"
                )}>每週任務</p>
              </div>
              <div
                className="content-stretch flex flex-[1_0_0] h-full items-center justify-center min-h-px min-w-px relative cursor-pointer"
                onClick={() => handleTabClick('achievement')}
              >
                {activeTab === 'achievement' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute border-[#577fe5] border-b-4 border-solid inset-0 pointer-events-none"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <p className={clsx(
                  "font-sans font-medium leading-[normal] not-italic relative shrink-0 text-[28px] transition-colors duration-300",
                  activeTab === 'achievement' ? "text-[#1b1b1b]" : "text-[#818181]"
                )}>成就</p>
              </div>
            </div>

            {/* Mission Items */}
            <div className="w-full overflow-hidden">
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={activeTab}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={handleDragEnd}
                  className="w-full cursor-grab active:cursor-grabbing touch-pan-y"
                >
                  {sortedMissions.map((mission, index) => (
                    <div key={mission.id} className="content-stretch flex min-h-[143px] py-[16px] items-center justify-between relative shrink-0 w-full select-none">
                      {index !== sortedMissions.length - 1 && (
                        <div aria-hidden="true" className="absolute border-[#eee] border-b border-solid inset-0 pointer-events-none" />
                      )}
                      <div className="content-stretch flex gap-[16px] items-center relative shrink-0">
                        {mission.type === 'achievement' && mission.condition_type != null && (
                          <div className="relative shrink-0 size-[80px] flex items-center justify-center">
                            <img
                              src={`/images/mask/${ACHIEVEMENT_MASK[`${mission.condition_type}:${mission.target_value}`] ?? 1}.png`}
                              alt=""
                              width={72}
                              height={72}
                              style={{ width: 72, height: 72, objectFit: 'contain' }}
                            />
                          </div>
                        )}
                        <div className="content-stretch flex flex-col gap-[8px] items-start leading-[normal] not-italic relative shrink-0 w-[232px]">
                          <Helper text={mission.title} text1={`+${mission.reward}積分`} />
                          <p className="font-sans font-normal relative shrink-0 text-[#797979] text-[24px] whitespace-nowrap">{mission.description}</p>
                          {(() => {
                            const key = `${mission.condition_type}:${mission.target_value}`;
                            const titleInfo = mission.type === 'achievement' ? ACHIEVEMENT_TITLE[key] : undefined;
                            if (!titleInfo) return null;
                            return (
                              <span className={`inline-flex items-center px-[10px] py-[2px] rounded-full text-white text-[20px] font-semibold bg-gradient-to-r ${TITLE_STYLES[titleInfo.color] ?? TITLE_STYLES.gold}`}>
                                {titleInfo.name}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="content-stretch flex gap-[20px] items-center relative shrink-0">
                        {/* 進度顯示：pending 且 target > 1 時才顯示 */}
                        {mission.status === 'pending' &&
                          mission.current_value !== undefined && (
                          <span className="shrink-0 text-[24px] font-medium text-[#999] whitespace-nowrap">
                            <span className="text-[#ff6b35]">{Math.min(mission.current_value, mission.target_value ?? 1)}</span>/{mission.target_value}
                          </span>
                        )}
                        {(mission.status === 'claimed' || optimisticClaimedIds.has(mission.id)) ? (
                          <div className="w-[112px] text-center text-gray-400 text-[24px]">已領取</div>
                        ) : mission.status === 'completed' ? (
                          <Text2 text="領取" onClick={(e) => handleClaim(mission, e)} />
                        ) : (
                          <Text3 text="去完成" onClick={() => onMissionAction(mission)} />
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {sortedMissions.length === 0 && (
                    <div className="py-10 text-center text-gray-500 text-2xl">
                      暫無任務
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      
      {/* Rules Button */}
      <div 
        className="absolute h-[90px] left-[702px] top-[98px] w-[48px] cursor-pointer active:scale-95 transition-transform"
        onClick={() => setIsRulesModalOpen(true)}
      >
        <div className="absolute h-[90px] left-0 overflow-clip top-0 w-[48px]">
          <div className="absolute bg-[#ff1a16] h-[90px] left-0 pointer-events-none rounded-bl-[16px] rounded-tl-[16px] top-0 w-[49px]">
            <div aria-hidden="true" className="absolute border border-[#ffd29d] border-solid inset-0 rounded-bl-[16px] rounded-tl-[16px]" />
            <div className="absolute inset-0 rounded-[inherit] shadow-[inset_8px_0px_10px_0px_rgba(255,255,255,0.41)]" />
          </div>
        </div>
        <div className="absolute font-sans font-medium leading-[normal] left-[15px] not-italic text-[24px] text-white top-[16px] whitespace-nowrap flex flex-col items-center">
          <p className="mb-0">規</p>
          <p>則</p>
        </div>
      </div>

      <RulesModal 
        isOpen={isRulesModalOpen} 
        onClose={() => setIsRulesModalOpen(false)}
        title="積分規則"
        rules={[
          "每日登入簽到可獲得積分獎勵，連續簽到天數越多，獎勵越豐富。",
          "連續簽到中斷後，將重新計算天數。",
          "完成每日任務可獲得大量積分，任務於每日 00:00 重置。",
          "每週任務於每週一 00:00 重置，請把握時間完成。",
          "積分可用於兌換商城商品或參與特定活動。",
          "如發現惡意刷分行為，平台有權回收積分並凍結帳號。"
        ]}
      />

      {/* Spacer for bottom navigation removed per user request */}
      
      {mounted && createPortal(
        <>
          {floatingRewards.map(reward => (
            <FloatingReward
              key={reward.id}
              x={reward.x}
              y={reward.y}
              reward={reward.reward}
              onComplete={() => removeFloatingReward(reward.id)}
            />
          ))}
        </>,
        document.body
      )}
    </div>
  );
}

export default React.memo(MissionFrame);
