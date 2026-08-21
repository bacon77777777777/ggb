'use client';

import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  RankingListItem,
  RankingTop3,
  RankingTopDecorations,
  RankingTimeTabs,
  RankingListContainer,
  RankingItemData
} from './components/RankingComponents';
import { imgAvatar } from './assets';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import PlayerProfileCard from '@/components/ranking/PlayerProfileCard';
import InkFlowField from '@/components/ranking/InkFlowField';
import { trackPageView, trackScrollDepth, trackEvent } from '@/lib/trackEvent';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwipeTabs } from '@/lib/useSwipeTabs';

interface RankingRpcItem {
  user_id: string;
  rank: number;
  nickname?: string;
  avatar_url?: string;
  total_spent?: number;
  draw_count?: number;
  title_name?: string | null;
  title_color?: string | null;
}

export default function RankingPage() {
  const router = useRouter();

  useLayoutEffect(() => {
    if (window.innerWidth >= 768) router.replace('/');
  }, []);
  const [scale, setScale] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily')
  const swipeTabs = useSwipeTabs(['daily', 'weekly'] as const, activeTab, setActiveTab);
  const [activeCategory, setActiveCategory] = useState<'reward' | 'draws'>('reward');
  /*
   * 頂部導航（賞金狂人／轉蛋魔人）在頁面頂端時是透明的、浮在主視覺上；
   * 往下滑就墊一層深藍色模糊透明底（老闆 2026-08-20 指定），不然白字會
   * 跟榜單內容打架。
   */
  const [navScrolled, setNavScrolled] = useState(false);
  // 全螢幕流體背景（InkFlowField）：省電/無障礙 → prefers-reduced-motion 時退回靜態深色底
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const on = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [rankingData, setRankingData] = useState<RankingItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState(0);
  const [profileItem, setProfileItem] = useState<RankingItemData | null>(null);

  const [scaledHeight, setScaledHeight] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const supabase = createClient();

  const categories = ['reward', 'draws'] as const;

  // Responsive Scaling (Mission Page Strategy)
  const updateScale = useCallback(() => {
    if (typeof window === 'undefined') return;
    const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
    // Base design is 750px. If viewport is 375px, scale should be 0.5.
    // Formula: (viewportWidth / 375) * 0.5
    // If viewportWidth = 375, scale = 0.5. 750 * 0.5 = 375. Fits.
    // If viewportWidth = 750, scale = 1.0. 750 * 1.0 = 750. Fits.
    const nextScale = Math.min(1, (viewportWidth / 375) * 0.5);
    setScale(nextScale);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    window.addEventListener('orientationchange', updateScale);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateScale);
    }

    return () => {
      window.removeEventListener('resize', updateScale);
      window.removeEventListener('orientationchange', updateScale);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateScale);
      }
    };
  }, [updateScale]);

  // Height measurement
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateHeight = () => {
      // scrollHeight includes the full content height
      const baseHeight = el.scrollHeight;
      // We set the wrapper height to the scaled content height
      setScaledHeight(Math.ceil(baseHeight * scale));
    };

    updateHeight();

    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);

    return () => ro.disconnect();
  }, [scale, rankingData, activeCategory, loading]); // Update when data changes

  // Fetch Ranking Data
  const fetchRanking = useCallback(async () => {
    setLoading(true);
    try {
      const rpcName = activeCategory === 'draws' ? 'get_leaderboard_draws' : 'get_leaderboard_whales';
      const rangeParam = activeTab === 'weekly' ? 'week' : 'day';

      const { data, error } = await supabase.rpc(rpcName, {
        p_range: rangeParam
      });

      if (error) {
        console.error('Error fetching ranking:', error);
        setRankingData([]);
        return;
      }

      // Transform data to match component props
      const formattedData: RankingItemData[] = (data || []).map((item: RankingRpcItem) => {
        let amountStr = '0';
        
        if (activeCategory === 'draws') {
          amountStr = (item.total_spent || item.draw_count || 0).toLocaleString();
        } else {
          amountStr = Math.floor(Number(item.total_spent || 0)).toLocaleString();
        }

        return {
          user_id: item.user_id,
          rank: item.rank,
          nickname: item.nickname || '神秘玩家',
          avatar_url: item.avatar_url || imgAvatar,
          amount: amountStr,
          title: item.title_name ? { name: item.title_name, color_key: item.title_color || 'gold' } : null,
        };
      });

      // Fill with placeholders if less than 20
      const filledData = [...formattedData];
      for (let i = filledData.length + 1; i <= 20; i++) {
        filledData.push({
          user_id: `placeholder-${i}`,
          rank: i,
          nickname: '虛位以待',
          avatar_url: '/images/avatar.webp',
          amount: '0',
          isPlaceholder: true
        });
      }

      setRankingData(filledData);
    } catch (err) {
      console.error('Unexpected error fetching ranking:', err);
      setRankingData([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeTab, supabase]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  useEffect(() => {
    const c1 = trackPageView();
    const c2 = trackScrollDepth();
    trackEvent('leaderboard_view');
    return () => { c1(); c2(); };
  }, []);

  // 點頭像 → 打開個人資料卡
  const handleAvatarClick = (item: RankingItemData) => {
    setProfileItem(item);
  };

  // 膜拜一律由 PlayerProfileCard 自己處理（跑馬燈／挑戰頁／排行榜同一套流程）

  const handleCategoryChange = (newCategory: typeof activeCategory) => {
    if (newCategory === activeCategory) return;
    const oldIndex = categories.indexOf(activeCategory);
    const newIndex = categories.indexOf(newCategory);
    setDirection(newIndex > oldIndex ? 1 : -1);
    setActiveCategory(newCategory);
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  const handleDragEnd = (e: MouseEvent | TouchEvent | PointerEvent, { offset, velocity }: PanInfo) => {
    const swipe = swipePower(offset.x, velocity.x);

    if (swipe < -swipeConfidenceThreshold) {
      const currentIndex = categories.indexOf(activeCategory);
      if (currentIndex < categories.length - 1) {
        handleCategoryChange(categories[currentIndex + 1]);
      }
    } else if (swipe > swipeConfidenceThreshold) {
      const currentIndex = categories.indexOf(activeCategory);
      if (currentIndex > 0) {
        handleCategoryChange(categories[currentIndex - 1]);
      }
    }
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const displayType = activeCategory === 'draws' ? 'gift' : 'token';

  return (
    <>
    {/*
      固定頂部導航（老闆 2026-08-20 指定）：賞金狂人／轉蛋魔人從縮放畫布裡
      搬出來，變成真正 fixed 的頂欄 —— 捲動時不跟著走，下拉更新時也不動
      （這頁用 data-ptr-content 只拖內容，<main> 沒有 transform，fixed 才靠得住）。
      頁面頂端時透明、浮在主視覺上；往下滑墊深藍色模糊透明底。
    */}
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-10 pt-[env(safe-area-inset-top)] transition-colors duration-200',
        navScrolled ? 'bg-[#1b2148]/80 backdrop-blur-md border-b border-white/10' : 'bg-transparent',
      )}
    >
      <div className="flex h-[52px] items-center justify-center gap-12">
        {([
          { id: 'reward', label: '賞金狂人' },
          { id: 'draws', label: '轉蛋魔人' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleCategoryChange(tab.id)}
            className="relative flex h-full items-center text-[16px] font-black transition-colors"
          >
            <span className={activeCategory === tab.id ? 'text-white' : 'text-white/50'}>
              {tab.label}
            </span>
            {activeCategory === tab.id && (
              <span className="absolute inset-x-0 bottom-[7px] mx-auto h-[3px] w-9 rounded-full bg-[#577fe5]" />
            )}
          </button>
        ))}
      </div>
    </div>
    {/* 返回鈕疊在頂欄上層，維持可按 */}
    <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between pt-[env(safe-area-inset-top)] pointer-events-none">
      <Link href="/"
        className="pointer-events-auto m-[10px] w-[38px] h-[38px] bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
        <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
      </Link>
    </div>
    <div className="relative bg-[#0E0B1E] min-h-screen w-full overflow-x-hidden flex justify-center" {...swipeTabs}>
      {/* 全螢幕流體背景（Ink Flow Field，WebGL2）：fixed 鋪滿視窗、當純背景、
          z-0 疊在內容(z-[1])下、fixed nav(z-10)/返回鍵(z-20)上。
          reduce-motion 時不掛（退回 bg-[#0E0B1E] 靜態深色底，省電/無障礙）。*/}
      {!reduceMotion && (
        <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
          <InkFlowField style={{ width: '100%', height: '100%' }} />
        </div>
      )}
      <div
        className="relative z-[1] overflow-hidden"
        style={{
          width: Math.ceil(750 * scale),
          height: scaledHeight ?? undefined
        }}
      >
        <div 
          ref={contentRef}
          className={`relative w-full min-h-[1334px] origin-top-left transition-opacity duration-200 ${isInitialized ? 'opacity-100' : 'opacity-0'}`}
          data-name="排行榜"
          style={{
            width: '750px',
            transform: `scale(${scale})`,
            // minHeight removed from here, let the content define height, but keep min-h-[1334px] class for background coverage
          }}
        >
          {/* 主視覺背景改為全螢幕 Ink Flow Field（見上方 fixed 層），這裡不再放頂部光暈 */}
          
          {/* 賞金狂人／轉蛋魔人已搬到頁面層級的固定頂欄（見上方），畫布裡只剩日榜／週榜 */}
          <RankingTimeTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {/* data-ptr-content：下拉更新只拖這一塊（榜單本體）。tab 與背景是
              絕對定位在縮放畫布裡的，拖整個 <main> 再反向抵銷會被畫布的
              overflow-hidden 裁掉 —— 所以反過來，讓它們原地不動 */}
          <div className="grid grid-cols-1 grid-rows-1" data-ptr-content>
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={activeCategory}
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
                dragElastic={1}
                onDragEnd={handleDragEnd}
                className="touch-pan-y col-start-1 row-start-1 w-full"
              >
                {/* Top 3 Section：podium 底圖（top123.png）先畫、角色疊在上面 */}
                <RankingTopDecorations />
                <RankingTop3 data={rankingData} onWorship={handleAvatarClick} type={displayType} />

                {/* List Section (4th - 10th) */}
                <RankingListContainer>
                {loading ? (
                  <div className="text-white text-center py-10 w-full text-xl font-bold">載入中...</div>
                ) : rankingData.length === 0 ? (
                  <div className="text-white/50 text-center py-10 w-full text-xl">暫無數據</div>
                ) : (
                  <>
                    {rankingData.filter(d => d.rank > 3).map((item) => (
                      <RankingListItem
                        key={item.user_id ?? `rank-${item.rank}`}
                        rank={item.rank}
                        avatarSrc={item.avatar_url}
                        nickname={item.nickname}
                        amount={item.amount.toString()}
                        onWorship={() => handleAvatarClick(item)}
                        isPlaceholder={item.isPlaceholder}
                        type={displayType}
                        title={item.title}
                      />
                    ))}
                    
                    <div className="w-full text-center pt-8 border-t border-white/10 pb-0 mb-0">
                      <p className="text-[#818181] text-[24px] font-normal">
                        {activeTab === 'daily' ? '排行榜數據每日00:00更新' : '排行榜數據每週一00:00更新'}<br/>
                        每日限膜拜一位大神，可獲得 10 積分獎勵
                      </p>
                    </div>
                  </>
                )}
                </RankingListContainer>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>

      {/* 個人資料卡 */}
      {profileItem && (
        <PlayerProfileCard
          userId={profileItem.user_id}
          nickname={profileItem.nickname}
          avatarUrl={profileItem.avatar_url}
          titleFromRanking={profileItem.title}
          onClose={() => setProfileItem(null)}
          isPlaceholder={profileItem.isPlaceholder}
        />
      )}
    </>
  );
}
