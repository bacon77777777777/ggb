import React, { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

export default function DailyCheckInTab() {
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [status, setStatus] = useState({
    consecutive_days: 0,
    checked_in_today: false,
    next_reward: 10
  });
  const [supabase] = useState(() => createClient());

  const t = (msg?: string) => {
    const m = (msg || '').toLowerCase();
    if (m.includes('already checked in')) return '今日已簽到';
    if (m.includes('check-in success') || m.includes('checked in successfully')) return '簽到成功';
    if (m.includes('function') && m.includes('not found')) return '簽到功能未初始化';
    return msg || '';
  };

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_check_in_status', { p_user_id: user!.id });
      if (error) {
        if (error.code === '42883') {
          console.warn('Check-in function not found');
        } else {
          throw error;
        }
      }
      if (data) setStatus(data);
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, user]);

  const handleCheckIn = useCallback(async () => {
    setCheckingIn(true);
    try {
      const { data, error } = await supabase.rpc('daily_check_in', { p_user_id: user!.id });
      if (error) throw error;
      
      if (data.success) {
        showToast(`簽到成功！獲得 ${data.reward} 代幣`, 'success');
        await refreshProfile();
        fetchStatus();
      } else {
        const msg = t(data.message) || '今日已簽到';
        showToast(msg, 'info');
      }
    } catch (err: unknown) {
      console.error('Check-in Error:', err);
      const errorMessage = err instanceof Error ? err.message : (err as { message?: string })?.message || '簽到失敗';
      showToast(t(errorMessage) || '簽到失敗', 'error');
    } finally {
      setCheckingIn(false);
    }
  }, [supabase, user, refreshProfile, fetchStatus, showToast, t]);

  useEffect(() => {
    const initCheckIn = async () => {
      if (user) {
        // Fetch status first
        await fetchStatus();
      }
    };
    initCheckIn();
  }, [user, fetchStatus]);

  const hasAttemptedCheckIn = React.useRef(false);

  // Auto Check-in when status is loaded and not checked in
  useEffect(() => {
    if (!loading && !status.checked_in_today && !checkingIn && !hasAttemptedCheckIn.current) {
      hasAttemptedCheckIn.current = true;
      handleCheckIn();
    }
  }, [loading, status.checked_in_today, checkingIn, handleCheckIn]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const dayNum = i + 1;
    let itemStatus = 'upcoming';
    
    // Calculate display status
    const streak = status.consecutive_days;
    // If streak is multiple of 7 and we checked in today, we show full board (days 1-7 checked)
    // If streak is multiple of 7 and NOT checked in today, we show empty board (day 1 today)
    
    const cycleStreak = streak % 7;
    
    if (status.checked_in_today) {
       // e.g. streak 1 -> day 1 checked.
       // e.g. streak 7 -> day 7 checked (cycleStreak 0 -> treat as 7)
       const displayStreak = cycleStreak === 0 ? 7 : cycleStreak;
       if (dayNum <= displayStreak) itemStatus = 'checked';
    } else {
       // e.g. streak 0 -> day 1 today.
       // e.g. streak 1 -> day 1 checked, day 2 today.
       // e.g. streak 7 -> day 1 today (new cycle).
       if (dayNum <= cycleStreak) {
           itemStatus = 'checked';
       } else if (dayNum === cycleStreak + 1) {
           itemStatus = 'today';
       }
    }

    return {
      day: dayNum.toString(),
      points: 10 + (i * 5),
      status: itemStatus,
      isBig: i === 6
    };
  });

  if (loading) return (
      <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 lg:mb-8">
        <div className="hidden md:block">
          <h3 className="text-3xl font-black text-neutral-900 dark:text-white tracking-tight">每日簽到</h3>
          <p className="text-sm text-neutral-400 font-black uppercase tracking-widest mt-2">每日簽到領取獎勵，連續簽到獲得更多</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-6 md:p-8 shadow-card border border-neutral-100 dark:border-neutral-800 text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CalendarCheck className="w-10 h-10 text-primary" />
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 font-bold mb-8">
              連續簽到 7 天可獲得大獎！
              <br/>
              <span className="text-xs font-normal text-neutral-400">目前連簽: {status.consecutive_days} 天</span>
          </p>
          
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 mb-8">
          {days.map((item, idx) => (
            <div 
              key={idx}
              className={`
                relative p-2 md:p-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all
                ${item.status === 'checked' ? 'bg-primary/5 border-primary/20 text-primary' : ''}
                ${item.status === 'today' ? 'bg-white dark:bg-neutral-800 border-primary ring-2 ring-primary/10 scale-110 z-10' : ''}
                ${item.status === 'upcoming' ? 'bg-neutral-50 dark:bg-neutral-800 border-neutral-100 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400' : ''}
                ${item.isBig ? 'col-span-2 sm:col-span-1 aspect-auto py-4 sm:aspect-square' : 'aspect-square'}
              `}
            >
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Day {item.day}</span>
              <div className="flex items-center gap-1">
                <Image
                    src="/images/gcoin.png"
                    alt="G Coin"
                    width={12}
                    height={12}
                    className="w-3 h-3 object-contain"
                  />
                <span className="text-xs md:text-sm font-black font-amount">+{item.points.toLocaleString()}</span>
              </div>
              {item.status === 'checked' && (
                <CheckCircle2 className="absolute -top-1.5 -right-1.5 w-4 h-4 text-primary fill-white" />
              )}
            </div>
          ))}
        </div>

        {/* Auto Check-in Feedback - Button Removed */}
        {status.checked_in_today && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full h-14 rounded-2xl bg-accent-emerald/10 text-accent-emerald flex items-center justify-center gap-2 font-black border border-accent-emerald/20"
          >
            <CheckCircle2 className="w-6 h-6" />
            今日已簽到
          </motion.div>
        )}
        
        {/* Loading state for auto check-in */}
        {!status.checked_in_today && checkingIn && (
           <div className="w-full h-14 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center gap-2 font-bold animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>正在為您簽到...</span>
           </div>
        )}
      </div>

      <div className="mt-6 bg-accent-yellow/5 border border-accent-yellow/20 rounded-2xl p-4 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-accent-yellow shrink-0 mt-0.5" />
        <div className="text-sm font-bold text-neutral-600 dark:text-neutral-400 leading-relaxed text-left">
          簽到獎勵將直接發放至您的錢包中。若中斷簽到，將重新從第一天開始計算。
        </div>
      </div>
    </div>
  </div>
  );
}
