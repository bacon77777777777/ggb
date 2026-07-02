'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserMission } from '@/services/mission';
import { CheckCircle2, Trophy, Ticket, Share, Layers, Gift, Eye, Heart, Wallet, Sparkles, LogIn, Calendar, Users, Star, Coins } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { MissionService } from '@/services/mission';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface MissionListProps {
  type: UserMission['type'];
  missions: UserMission[];
  onRefresh: () => void;
}

const MissionIcon = ({ name }: { name: string | null }) => {
  switch (name) {
    case 'Ticket': return <Ticket className="w-5 h-5 text-amber-500" />;
    case 'Share': return <Share className="w-5 h-5 text-blue-500" />;
    case 'Layers': return <Layers className="w-5 h-5 text-purple-500" />;
    case 'Trophy': return <Trophy className="w-5 h-5 text-yellow-500" />;
    case 'Log-in': return <LogIn className="w-5 h-5 text-green-500" />;
    case 'Eye': return <Eye className="w-5 h-5 text-cyan-500" />;
    case 'Heart': return <Heart className="w-5 h-5 text-pink-500" />;
    case 'Wallet': return <Wallet className="w-5 h-5 text-emerald-500" />;
    case 'Sparkles': return <Sparkles className="w-5 h-5 text-amber-400" />;
    case 'Calendar': return <Calendar className="w-5 h-5 text-blue-500" />;
    case 'Users': return <Users className="w-5 h-5 text-indigo-500" />;
    case 'Star': return <Star className="w-5 h-5 text-yellow-500" />;
    case 'Coins': return <Coins className="w-5 h-5 text-orange-500" />;
    default: return <Gift className="w-5 h-5 text-primary" />;
  }
};

interface FloatingRewardProps {
  x: number;
  y: number;
  reward: number;
  onComplete: () => void;
}

const FloatingReward = ({ x, y, reward, onComplete }: FloatingRewardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 0, scale: 0.5 }}
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
      className="flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-lg border border-orange-100"
    >
      <div className="w-5 h-5 rounded-full bg-accent-yellow flex items-center justify-center shadow-sm">
        <Image
          src="/images/gcoin.png"
          alt="G"
          width={12}
          height={12}
          className="object-contain"
        />
      </div>
      <span className="text-orange-500 font-black text-lg">+{reward}</span>
    </motion.div>
  );
};

export default function MissionList({ type, missions, onRefresh }: MissionListProps) {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [claimingId, setClaimingId] = React.useState<string | null>(null);
  const [optimisticClaimedIds, setOptimisticClaimedIds] = React.useState<Set<string>>(new Set());
  const [floatingRewards, setFloatingRewards] = React.useState<{ id: number; x: number; y: number; reward: number }[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter and Sort: Move claimed items to bottom
  const filteredMissions = React.useMemo(() => {
    // Separate active and claimed/completed missions
    const active: UserMission[] = [];
    const completed: UserMission[] = [];

    missions.filter(m => m.type === type).forEach(m => {
      const isClaimed = m.is_claimed || optimisticClaimedIds.has(m.id);
      if (isClaimed) {
        completed.push(m);
      } else {
        active.push(m);
      }
    });

    // Return active first, then completed
    return [...active, ...completed];
  }, [missions, type, optimisticClaimedIds]);

  const handleClaim = async (mission: UserMission, e: React.MouseEvent<HTMLButtonElement>) => {
    if (claimingId || optimisticClaimedIds.has(mission.id)) return;
    
    // 1. Capture Position for floating animation
    const rect = e.currentTarget.getBoundingClientRect();
    // Position slightly above the button, centered
    const startX = rect.left + (rect.width / 2) - 30; 
    const startY = rect.top - 20;

    // 2. Add Floating Reward
    const rewardId = Date.now();
    setFloatingRewards(prev => [...prev, { id: rewardId, x: startX, y: startY, reward: mission.reward_coins }]);

    // 3. Optimistic Update (Immediate Gray & Reorder)
    setOptimisticClaimedIds(prev => new Set(prev).add(mission.id));
    setClaimingId(mission.id);

    try {
      const result = await MissionService.claimReward(mission.id, mission.period_key);
      if (result.success) {
        // showToast(`領取成功！獲得 ${result.reward} 代幣`, 'success'); // Optional: disable toast if animation is enough
        onRefresh();
        refreshProfile(); // Update user balance in header
      } else {
        showToast(result.message || '領取失敗', 'error');
        // Revert optimistic update if failed
        setOptimisticClaimedIds(prev => {
          const next = new Set(prev);
          next.delete(mission.id);
          return next;
        });
      }
    } catch {
      showToast('發生錯誤，請稍後再試', 'error');
      // Revert optimistic update
      setOptimisticClaimedIds(prev => {
        const next = new Set(prev);
        next.delete(mission.id);
        return next;
      });
    } finally {
      setClaimingId(null);
    }
  };

  const handleGo = async (mission: UserMission) => {
    if (mission.condition_type === 'spend_amount' || mission.condition_type === 'recharge') {
      router.push('/topup');
    } else if (mission.condition_type === 'draw_count' || mission.condition_type === 'win_sr' || mission.condition_type === 'play_unique_machine' || mission.condition_type === 'view_product') {
      router.push('/');
    } else if (mission.condition_type === 'like_ranking') {
      router.push('/ranking');
    } else if (mission.condition_type === 'share_app') {
      try {
        await navigator.clipboard.writeText(window.location.origin);
        showToast('已複製連結，快去分享吧！', 'success');
        await MissionService.trackShare(mission.id, mission.period_key);
        onRefresh();
        refreshProfile();
      } catch {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  };

  const removeFloatingReward = (id: number) => {
    setFloatingRewards(prev => prev.filter(r => r.id !== id));
  };

  if (filteredMissions.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        暫無任務
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {filteredMissions.map((mission) => {
           const isClaimed = mission.is_claimed || optimisticClaimedIds.has(mission.id);
           
           return (
            <div key={mission.id} className="bg-white rounded-lg p-4 shadow-sm border border-neutral-100 transition-all duration-500">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 p-2 rounded-lg">
                    <MissionIcon name={mission.icon_name} />
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-800">{mission.title}</h3>
                    <p className="text-xs text-neutral-500">{mission.description}</p>
                  </div>
                </div>
                {isClaimed ? (
                  <span className="text-xs font-bold text-neutral-400 bg-neutral-100 px-2 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> 已領取
                  </span>
                ) : (
                  <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                    +{mission.reward_coins} 積分
                  </span>
                )}
              </div>
              
              <div className="mt-3">
                <div className="flex justify-between text-xs text-neutral-500 mb-1">
                  <span>進度</span>
                  <span>{mission.progress} / {mission.target_value}</span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-2">
                  <div 
                    className="bg-orange-500 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(100, (mission.progress / mission.target_value) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                 {isClaimed ? (
                   <Button disabled size="sm" variant="outline" className="text-xs text-neutral-400 border-neutral-200 bg-neutral-50">已完成</Button>
                 ) : mission.progress >= mission.target_value ? (
                   <Button 
                     size="sm" 
                     className="bg-orange-500 hover:bg-orange-600 text-white text-xs relative"
                     onClick={(e) => handleClaim(mission, e)}
                     disabled={!!claimingId && claimingId !== mission.id}
                   >
                     {claimingId === mission.id ? '領取中...' : '領取獎勵'}
                   </Button>
                 ) : (
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
                     onClick={() => handleGo(mission)}
                   >
                     去完成
                   </Button>
                 )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Render Floating Rewards via Portal to ensure they are on top of everything and fixed to viewport */}
      {mounted && createPortal(
        <AnimatePresence>
          {floatingRewards.map(reward => (
            <FloatingReward
              key={reward.id}
              x={reward.x}
              y={reward.y}
              reward={reward.reward}
              onComplete={() => removeFloatingReward(reward.id)}
            />
          ))}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
