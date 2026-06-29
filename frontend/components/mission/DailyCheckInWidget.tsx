'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';

export default function DailyCheckInWidget() {
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [status, setStatus] = useState({
    consecutive_days: 0,
    checked_in_today: false,
    next_reward: 10
  });

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('get_check_in_status', { p_user_id: user.id });
      
      if (error) {
        if (error.code === '42883') {
           // Function not found, maybe ignore or show placeholder
           console.warn('Check-in function not found');
        } else {
           console.error('Check-in status error:', JSON.stringify(error, null, 2));
        }
      }
      if (data) setStatus(data);
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleCheckIn = async () => {
    if (checkingIn) return;
    setCheckingIn(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('daily_check_in', { p_user_id: user!.id });
      if (error) throw error;
      
      if (data.success) {
        showToast(`簽到成功！獲得 ${data.reward} 代幣`, 'success');
        await refreshProfile();
        fetchStatus();
      } else {
        showToast(data.message === 'Today already checked in' ? '今日已簽到' : data.message || '今日已簽到', 'info');
      }
    } catch (error) {
      console.error('Check-in Error:', error);
      showToast((error as Error).message || '簽到失敗', 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const dayNum = i + 1;
    let itemStatus = 'upcoming';
    
    const streak = status.consecutive_days;
    const cycleStreak = streak % 7;
    
    if (status.checked_in_today) {
       // Checked in today: 1..streak are checked.
       // If streak=7, then cycleStreak=0, treat as 7.
       const displayStreak = cycleStreak === 0 ? 7 : cycleStreak;
       if (dayNum <= displayStreak) itemStatus = 'checked';
    } else {
       // Not checked in today.
       // 1..streak are checked. Next is today.
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
    };
  });

  if (loading) return (
      <div className="bg-white rounded-xl p-6 border border-neutral-100 shadow-sm flex items-center justify-center h-[200px]">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
  );

  return (
    <div className="bg-white rounded-xl p-4 border border-neutral-100 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
           <div className="bg-orange-100 p-2 rounded-full">
             <CalendarCheck className="w-5 h-5 text-orange-600" />
           </div>
           <div>
             <h3 className="font-bold text-neutral-900">每日簽到</h3>
             <p className="text-xs text-neutral-500">連續簽到 7 天獲得大獎</p>
           </div>
        </div>
        <div className="text-right">
           <span className="text-xs font-medium text-neutral-400">已連簽</span>
           <p className="text-lg font-bold text-orange-600 leading-none">{status.consecutive_days} <span className="text-xs text-neutral-400 font-normal">天</span></p>
        </div>
      </div>
      
      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {days.map((item, idx) => (
          <div 
            key={idx}
            className={cn(
              "aspect-[0.8] rounded-lg border flex flex-col items-center justify-center gap-0.5 relative",
              item.status === 'checked' && "bg-orange-50 border-orange-200 text-orange-600",
              item.status === 'today' && "bg-white border-orange-500 ring-2 ring-orange-100 shadow-sm z-10 scale-105",
              item.status === 'upcoming' && "bg-neutral-50 border-neutral-100 text-neutral-400"
            )}
          >
             <span className="text-[9px] font-bold opacity-60">D{item.day}</span>
             <span className="text-[10px] font-bold">+{item.points}</span>
             {item.status === 'checked' && (
               <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-lg">
                 <CheckCircle2 className="w-4 h-4 text-orange-500 fill-white" />
               </div>
             )}
          </div>
        ))}
      </div>

      {!status.checked_in_today ? (
        <Button 
          onClick={handleCheckIn}
          disabled={checkingIn}
          fullWidth
          className="h-10 text-sm font-bold bg-gradient-to-r from-orange-500 to-red-600 border-0 shadow-md"
        >
          {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : '立即簽到'}
        </Button>
      ) : (
        <div className="w-full h-10 rounded-lg bg-neutral-100 text-neutral-400 flex items-center justify-center gap-2 text-sm font-bold">
          <CheckCircle2 className="w-4 h-4" />
          今日已簽到
        </div>
      )}
    </div>
  );
}
