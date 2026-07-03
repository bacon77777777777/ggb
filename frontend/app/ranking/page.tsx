'use client';

import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  RankingListItem,
  RankingTop3,
  RankingCategoryTabs,
  RankingTimeTabs,
  RankingListContainer,
  RankingItemData
} from './components/RankingComponents';
import { imgAvatar } from './assets';
import { useAlert } from '@/components/ui/AlertDialog';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import PlayerProfileCard from '@/components/ranking/PlayerProfileCard';

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
  const { user } = useAuth();
  const [scale, setScale] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');
  const [activeCategory, setActiveCategory] = useState<'reward' | 'draws'>('reward');
  const [rankingData, setRankingData] = useState<RankingItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState(0);
  const [profileItem, setProfileItem] = useState<RankingItemData | null>(null);

  const [scaledHeight, setScaledHeight] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const { showAlert } = useAlert();
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
          avatar_url: '/images/default.png',
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

  // 點頭像 → 打開個人資料卡
  const handleAvatarClick = (item: RankingItemData) => {
    setProfileItem(item);
  };

  // 膜拜（從資料卡觸發）
  const handleWorshipFromCard = async () => {
    if (!profileItem) return;
    const item = profileItem;
    setProfileItem(null);
    handleWorshipClick(item);
  };

  // Handle Worship Click
  const handleWorshipClick = (item: RankingItemData) => {
    if (item.isPlaceholder) return;

    // Check if user is worshiping themselves
    if (user && item.user_id === user.id) {
      showAlert({ title: '提示', message: '不可膜拜自己', type: 'info' });
      return;
    }

    showAlert({
      title: '膜拜大佬',
      message: `是否膜拜 ${item.nickname}？\n(膜拜後可獲得 10 積分，每日限一次)`,
      type: 'confirm',
      confirmText: '確認膜拜',
      onConfirm: async () => {
        try {
          const { data, error } = await supabase.rpc('worship_player', {
            p_target_id: item.user_id
          });

          if (error) throw error;

          if (data && data.success) {
            showAlert({ title: '膜拜成功', message: data.message || '膜拜成功！獲得 10 積分', type: 'success' });
          } else {
            showAlert({ title: '膜拜失敗', message: data?.message || '膜拜失敗', type: 'error' });
          }
        } catch (err: unknown) {
          console.error('Worship error:', err);
          showAlert({ title: '錯誤', message: (err as Error).message || '發生錯誤，請稍後再試', type: 'error' });
        }
      },
    });
  };

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
    <div className="bg-[#232429] min-h-screen w-full overflow-x-hidden flex justify-center">
      <div 
        className="overflow-hidden"
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
          <div className="absolute top-0 left-0 w-full z-0 pointer-events-none">
            <Image
              src="/images/rank/topbg.png"
              alt="Ranking Background"
              width={750}
              height={561}
              sizes="(max-width: 750px) 100vw, 750px"
              className="w-full h-auto mix-blend-overlay"
              unoptimized
              priority
            />
          </div>
          
          <RankingCategoryTabs activeCategory={activeCategory} onCategoryChange={handleCategoryChange} />
          <RankingTimeTabs activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="grid grid-cols-1 grid-rows-1">
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
                {/* Top 3 Section */}
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
                        每日限膜拜一位大佬，可獲得 10 積分獎勵
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
          onWorship={handleWorshipFromCard}
          onClose={() => setProfileItem(null)}
          isPlaceholder={profileItem.isPlaceholder}
        />
      )}
    </>
  );
}
