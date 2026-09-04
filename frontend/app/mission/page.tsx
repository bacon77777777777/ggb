'use client';

import CardxPage from '@/components/cardx/CardxPage';
import { useMinWidth } from '@/lib/useMinWidth';

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MissionService } from '@/services/mission';
import MissionFrame, { Mission } from '@/components/mission/MissionFrame';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { MissionSkeleton } from '@/components/Skeletons';
import { useRouter } from 'next/navigation';
import { useSwipeTabs } from '@/lib/useSwipeTabs';
import { TopFadeBlur } from '@/components/ui/TopFadeBlur';
import { asset } from '@/lib/asset';
import { useStatusBarText } from '@/components/native/StatusBarStyle';
import { useRequireLogin } from '@/hooks/useRequireLogin';

function MissionPageMobile() {
  const { user, refreshProfile, isLoading: authLoading } = useAuth();

  /* 動態島文字：整頁底色是 #ff2d14 橘紅，白字。 */
  useStatusBarText('white', '#ff2d14');
  const { showToast } = useToast();
  const router = useRouter();
  /*
   * 未登入也看得到這一頁（老闆 2026-08-30）
   *
   * 原本是「沒登入就踢去 /login」。但簽到頁本身就是**招募畫面** ——
   * 看得到連續 7 天送多少、有哪些任務，才會想登入；先踢走等於把誘因藏起來。
   * 訪客看到的是同一張版：積分改成「登入後顯示」（跟會員中心同一套樣式）、
   * 任務清單照列（讀公開的 tasks 表），按簽到／領取才跳登入提示。
   */
  const requireLogin = useRequireLogin();
  
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'achievement'>('daily');
  const swipeTabs = useSwipeTabs(['daily', 'weekly', 'achievement'] as const, activeTab, setActiveTab);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalDays, setTotalDays] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);
  const [minContentHeight, setMinContentHeight] = useState<number | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const userId = user?.id;

  useLayoutEffect(() => {
    if (window.innerWidth >= 768) router.replace('/');
  }, []);

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio(asset('/audio/23424.mp3'));
    audioRef.current.load();
  }, []);

  // Fetch Check-in Status
  const fetchCheckInStatus = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('get_check_in_status', { p_user_id: userId });
      if (error) {
        console.error('Error fetching check-in status:', error);
      } else if (data) {
        setTotalDays(data.total_days ?? 0);
        setCheckedInToday(!!data.checked_in_today);
      }
    } catch (error) {
      console.error('Error fetching check-in status:', error);
    }
  }, [userId]);

  // Fetch Missions
  const fetchMissions = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const data = await MissionService.getUserMissions();
      
      // Map UserMission to MissionFrame Mission interface
      const mappedMissions: Mission[] = data.map(m => ({
        id: m.id,
        title: m.title,
        reward: m.reward_coins,
        description: m.description || '',
        status: m.is_claimed ? 'claimed' : (m.is_completed ? 'completed' : 'pending'),
        type: m.type as 'daily' | 'weekly' | 'achievement',
        periodKey: m.period_key,
        condition_type: m.condition_type,
        target_value: m.target_value,
        current_value: m.progress ?? 0,
      }));
      
      setMissions(mappedMissions);
    } catch (error) {
      console.error('Error fetching missions:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * 訪客的任務清單：直接讀 tasks 表（公開可讀），全部當成未完成。
   * 不能用 get_user_missions —— 那支是照 auth.uid() 算進度的，訪客拿不到東西，
   * 版面會只剩一張空的任務卡。
   */
  const fetchPublicTasks = useCallback(async () => {
    const supabase = createClient();
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tasks')
        .select('id, type, title, description, target_value, reward_coins, condition_type, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setMissions((data ?? []).map((t: any) => ({
        id: String(t.id),
        title: t.title,
        reward: t.reward_coins,
        description: t.description || '',
        status: 'pending' as const,
        type: t.type as 'daily' | 'weekly' | 'achievement',
        condition_type: t.condition_type,
        target_value: t.target_value,
        current_value: 0,
      })));
    } catch (error) {
      console.error('Error fetching public tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchCheckInStatus();
      fetchMissions();
    } else if (!authLoading) {
      fetchPublicTasks();
    }
  }, [userId, authLoading, fetchCheckInStatus, fetchMissions, fetchPublicTasks]);

  // Play Success Sound
  const playSuccessSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.error('Audio play failed', e));
    }
  }, []);

  const handleCheckIn = useCallback(async () => {
    // 訪客按「立即簽到」→ 跳登入提示（登入完回到這一頁）
    if (!requireLogin('登入後就可以簽到領積分')) return;
    if (checkingIn || !userId) return;
    
    setCheckingIn(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('daily_check_in', { p_user_id: userId });
      if (error) throw error;
      
      if (data.success) {
        showToast(`簽到成功！獲得 ${data.reward} 積分`, 'success');
        // 先把畫面切成「今天簽過了」，不等重讀狀態
        setCheckedInToday(true);
        if (typeof data.total_days === 'number') setTotalDays(data.total_days);
        playSuccessSound();
        await refreshProfile();
        fetchCheckInStatus();
        fetchMissions(); // Refresh missions in case there's a "Daily Login" mission
      } else {
        showToast(data.message || '今日已簽到', 'info');
        setCheckedInToday(true);
      }
    } catch (error) {
      console.error('Check-in Error:', error);
      showToast('簽到失敗', 'error');
    } finally {
      setCheckingIn(false);
    }
  }, [checkingIn, userId, requireLogin, showToast, refreshProfile, fetchCheckInStatus, fetchMissions, playSuccessSound]);

  const handleMissionAction = useCallback(async (mission: Mission) => {
    // 訪客點任何一顆任務按鈕都先問登入 —— 任務進度本來就要有帳號才算得出來
    if (!requireLogin('登入後就可以做任務領積分')) return;
    if (mission.status === 'claimed') return;

    if (mission.status === 'completed') {
      // Claim Reward
      // Optimistically play sound for better UX
      playSuccessSound();

      try {
        if (mission.periodKey) {
          await MissionService.claimReward(mission.id, mission.periodKey);
          showToast(`領取成功！獲得 ${mission.reward} 積分`, 'success');
          await refreshProfile();
          fetchMissions();
        }
      } catch (error) {
        console.error('Claim Error:', error);
        showToast('領取失敗', 'error');
      }
    } else if (mission.status === 'pending') {
      // Go to Task
      if (mission.title.includes('手機') || mission.title.includes('驗證')) {
        router.push('/profile?tab=settings');
      } else if (mission.title.includes('儲值') || mission.title.includes('免費仔')) {
        router.push('/topup');
      } else if (mission.title.includes('上架')) {
        router.push('/profile?tab=warehouse');
      } else if (mission.condition_type === 'invite_friend') {
        // 邀請好友：導去專門的邀請頁（QR code + 複製訊息 + 系統分享）
        router.push('/invite');
      } else if (mission.condition_type === 'share_app' || mission.title.includes('社群') || mission.title.includes('分享')) {
        // 分享任務：導去首頁（實際計數在商品頁點分享圖標時觸發）
        router.push('/');
      } else {
        router.push('/');
      }
    }
  }, [router, requireLogin, showToast, refreshProfile, fetchMissions, playSuccessSound]);

  const updateScale = useCallback(() => {
    if (typeof window === 'undefined') return;
    const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
    // 用 dvh 或 innerHeight，扣掉底部 nav 高度（60px）讓內容不被蓋住
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const bottomNav = 60; // BottomNav 高度
    const nextScale = Math.min(1, (viewportWidth / 375) * 0.5);
    setScale(nextScale);
    setMinContentHeight((viewportHeight - bottomNav) / nextScale);
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateHeight = () => {
      const baseHeight = el.scrollHeight;
      setScaledHeight(Math.ceil(baseHeight * scale));
    };

    updateHeight();

    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);

    return () => ro.disconnect();
  }, [scale, loading]);

  if (loading && missions.length === 0) {
    return <MissionSkeleton />;
  }

  return (
    /*
     * App 滿版模式（v2026.08.21c）：外層背景鋪設計稿漸層的頂色 #ff2d14，
     * 內容用 env(safe-area-inset-top) 內縮 —— 動態島背後是橘紅、
     * 簽到畫面本體從安全區下開始。網頁 env=0，跟原本一模一樣。
     */
    /* data-ptr-strip：下拉的空隙鋪同一個紅，不然一拖走就露出 body 的白
       （老闆 2026-08-21：「簽到頁下拉，背景底色不該跟著動」）—— 底色是畫在
       這個「會被拖走」的元素身上的，空隙得自己補一條同色的才看不出破綻 */
    <div className="overflow-x-hidden flex justify-center" data-ptr-strip="#ff2d14"
      style={{ minHeight: '100dvh', background: '#ff2d14', paddingTop: 'env(safe-area-inset-top)' }} {...swipeTabs}>
      {/* 動態島底下的漸層毛玻璃（老闆 2026-08-22）：底是純橘紅，只模糊不帶色 */}
      <TopFadeBlur />
      <div
        className="overflow-hidden"
        style={{
          width: Math.ceil(750 * scale),
          // 確保容器恰好等於內容高度，不產生多餘空白
          height: scaledHeight ?? undefined,
          minHeight: scaledHeight ?? undefined,
        }}
      >
        <div
          ref={contentRef}
          style={{
            width: 750,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <MissionFrame 
            totalDays={totalDays}
            checkedInToday={checkedInToday}
            points={user?.points || 0}
            isGuest={!user}
            missions={missions}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onCheckIn={handleCheckIn}
            onMissionAction={handleMissionAction}
            minHeight={minContentHeight}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 768 以下：我們原本的手機版（MissionPageMobile，一字沒動）；
 * 768 以上：cardx 的頁面（老闆 2026-09-04，整套原封不動搬）。量到寬度才掛其中一棵（手機那棵有 effect，藏著也會跑）。
 */
export default function MissionPage() {
  const isMd = useMinWidth(768);
  if (isMd === null) return null;
  return isMd ? <CardxPage page="missions" /> : <MissionPageMobile />;
}
