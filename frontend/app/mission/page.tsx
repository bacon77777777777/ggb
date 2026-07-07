'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MissionService } from '@/services/mission';
import MissionFrame, { Mission } from '@/components/mission/MissionFrame';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function MissionPage() {
  const { user, refreshProfile, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'achievement'>('daily');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [consecutiveDays, setConsecutiveDays] = useState(0);
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
    audioRef.current = new Audio('/audio/23424.mp3');
    audioRef.current.load();
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch Check-in Status
  const fetchCheckInStatus = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('get_check_in_status', { p_user_id: userId });
      if (error) {
        console.error('Error fetching check-in status:', error);
      } else if (data) {
        setConsecutiveDays(data.consecutive_days);
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

  useEffect(() => {
    if (userId) {
      fetchCheckInStatus();
      fetchMissions();
    } else if (!authLoading) {
      // If no user and auth finished, stop loading (will redirect via other effect)
      setLoading(false);
    }
  }, [userId, authLoading, fetchCheckInStatus, fetchMissions]);

  // Play Success Sound
  const playSuccessSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.error('Audio play failed', e));
    }
  }, []);

  const handleCheckIn = useCallback(async () => {
    if (checkingIn || !userId) return;
    
    setCheckingIn(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('daily_check_in', { p_user_id: userId });
      if (error) throw error;
      
      if (data.success) {
        showToast(`簽到成功！獲得 ${data.reward} 積分`, 'success');
        playSuccessSound();
        await refreshProfile();
        fetchCheckInStatus();
        fetchMissions(); // Refresh missions in case there's a "Daily Login" mission
      } else {
        showToast(data.message || '今日已簽到', 'info');
      }
    } catch (error) {
      console.error('Check-in Error:', error);
      showToast('簽到失敗', 'error');
    } finally {
      setCheckingIn(false);
    }
  }, [checkingIn, userId, showToast, refreshProfile, fetchCheckInStatus, fetchMissions, playSuccessSound]);

  const handleMissionAction = useCallback(async (mission: Mission) => {
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
      } else if (mission.title.includes('社群') || mission.title.includes('分享')) {
        try {
          if (mission.periodKey) {
            await navigator.clipboard.writeText(window.location.origin);
            await MissionService.trackShare(mission.id, mission.periodKey);
            showToast('已複製連結，快去分享吧！', 'success');
            fetchMissions();
          }
        } catch {
          router.push('/');
        }
      } else {
        router.push('/');
      }
    }
  }, [router, showToast, refreshProfile, fetchMissions, playSuccessSound]);

  const updateScale = useCallback(() => {
    if (typeof window === 'undefined') return;
    const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
    const viewportHeight = window.innerHeight;
    const nextScale = Math.min(1, (viewportWidth / 375) * 0.5);
    setScale(nextScale);
    setMinContentHeight(viewportHeight / nextScale);
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
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 overflow-x-hidden flex justify-center">
      <div
        className="overflow-hidden"
        style={{
          width: Math.ceil(750 * scale),
          height: scaledHeight ?? undefined,
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
            consecutiveDays={consecutiveDays}
            points={user?.points || 0}
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
