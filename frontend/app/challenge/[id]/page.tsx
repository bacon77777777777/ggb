'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, ArrowLeft, Zap, Trophy, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';

interface BetTier {
  label: string;
  coins: number;
}

interface SlotMachine {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price_per_spin: number;
  trigger_rate: number;
  continue_rate: number;
  min_rush_hits: number;
  floor_spin_count: number;
  bet_tiers: BetTier[];
}

interface SlotPoolItem {
  id: number;
  min_bet: number | null;
  is_floor: boolean;
  rush_only: boolean;
  normal_only: boolean;
  remaining: number | null;
  product_prizes: {
    id: number;
    name: string;
    level: string;
    image_url: string | null;
    recycle_value: number;
  } | null;
}

interface SlotSession {
  state: 'normal' | 'rush';
  rush_hits_remaining: number;
  spins_since_rush: number;
  total_spins: number;
  locked_bet: number | null;
}

interface SpinResult {
  success: boolean;
  new_balance: number;
  draw_record_id: number;
  bet: number;
  prize: {
    pool_item_id: number;
    prize_id: number;
    name: string;
    level: string;
    image_url: string;
    recycle_value: number;
  };
  session: SlotSession;
  rush_triggered: boolean;
  is_floor: boolean;
  error?: string;
}

type SpinState = 'idle' | 'spinning' | 'result' | 'rush';

const LEVEL_COLORS: Record<string, string> = {
  'A': 'from-yellow-400 to-amber-500',
  'B': 'from-violet-400 to-purple-600',
  'C': 'from-sky-400 to-blue-500',
  'D': 'from-neutral-400 to-neutral-500',
  'Last One': 'from-rose-400 to-red-600',
  'LAST ONE': 'from-rose-400 to-red-600',
};

const TIER_LS_KEY = (machineId: number) => `ggb_slot_tier_${machineId}`;

export default function MachinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [machine, setMachine] = useState<SlotMachine | null>(null);
  const [pool, setPool] = useState<SlotPoolItem[]>([]);
  const [session, setSession] = useState<SlotSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [spinState, setSpinState] = useState<SpinState>('idle');
  const [lastResult, setLastResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tierIndex, setTierIndex] = useState(0);

  const reelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const machineId = parseInt(id);
    Promise.all([
      fetch(`/api/slot/machines/${machineId}`).then(r => r.json()),
      fetch(`/api/slot/${machineId}/session`).then(r => r.json()),
    ])
      .then(([machineData, sessionData]) => {
        const m: SlotMachine = machineData.machine ?? null;
        setMachine(m);
        setPool(machineData.pool ?? []);
        const s: SlotSession = sessionData.session ?? null;
        setSession(s);

        // Restore saved tier from localStorage, honouring RUSH lock
        if (m && Array.isArray(m.bet_tiers) && m.bet_tiers.length > 0) {
          if (s?.state === 'rush' && s.locked_bet != null) {
            const idx = m.bet_tiers.findIndex(t => t.coins === s.locked_bet);
            if (idx >= 0) setTierIndex(idx);
          } else {
            const saved = localStorage.getItem(TIER_LS_KEY(m.id));
            if (saved) {
              const idx = m.bet_tiers.findIndex(t => t.coins === parseInt(saved));
              if (idx >= 0) setTierIndex(idx);
            }
          }
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [id]);

  const tiers: BetTier[] = machine?.bet_tiers ?? [];
  const currentTier: BetTier = tiers[tierIndex] ?? { label: '小注', coins: machine?.price_per_spin ?? 100 };

  const isRushActive = session?.state === 'rush' && (session?.rush_hits_remaining ?? 0) > 0;
  const isRushLocked = isRushActive;

  const changeTier = useCallback((delta: number) => {
    if (isRushLocked || tiers.length <= 1) return;
    setTierIndex(prev => {
      const next = Math.max(0, Math.min(tiers.length - 1, prev + delta));
      if (machine) localStorage.setItem(TIER_LS_KEY(machine.id), String(tiers[next].coins));
      return next;
    });
  }, [isRushLocked, tiers, machine]);

  const startReelSpin = () => {
    reelTimerRef.current = setInterval(() => {}, 50); // tick kept for future use
  };

  const stopReelSpin = () => {
    if (reelTimerRef.current) {
      clearInterval(reelTimerRef.current);
      reelTimerRef.current = null;
    }
  };

  const handleSpin = async () => {
    if (spinState !== 'idle' || !user) return;
    setError(null);
    setSpinState('spinning');
    startReelSpin();

    try {
      const res = await fetch(`/api/slot/${id}/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet: currentTier.coins }),
      });
      const data: SpinResult = await res.json();

      await new Promise(r => setTimeout(r, 1200));
      stopReelSpin();

      if (!res.ok || data.error) {
        setError(data.error ?? '挑戰失敗');
        setSpinState('idle');
        return;
      }

      setLastResult(data);
      setSession(data.session);

      // Sync tierIndex if RUSH locked the bet server-side
      if (data.session.state === 'rush' && data.session.locked_bet != null && tiers.length > 0) {
        const idx = tiers.findIndex(t => t.coins === data.session.locked_bet);
        if (idx >= 0) setTierIndex(idx);
      }

      if (data.rush_triggered) {
        setSpinState('rush');
        setTimeout(() => setSpinState('result'), 2000);
      } else {
        setSpinState('result');
      }

      if (refreshProfile) refreshProfile();
    } catch {
      stopReelSpin();
      setError('連線失敗，請重試');
      setSpinState('idle');
    }
  };

  const handleClose = () => {
    setLastResult(null);
    setSpinState('idle');
  };

  if (isLoading) return <ProductLoadingScreen />;
  if (!machine) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-neutral-500">
        <p>機台不存在</p>
        <button onClick={() => router.back()} className="mt-4 text-sm underline">返回</button>
      </div>
    );
  }

  const floorProgress = session ? Math.min((session.spins_since_rush / machine.floor_spin_count) * 100, 100) : 0;

  // Non-floor pool items for preview (sorted: unlocked first)
  const previewItems = pool
    .filter(item => !item.is_floor && item.product_prizes)
    .sort((a, b) => {
      const aLocked = a.min_bet != null && a.min_bet > currentTier.coins;
      const bLocked = b.min_bet != null && b.min_bet > currentTier.coins;
      return Number(aLocked) - Number(bLocked);
    });

  return (
    <div className={cn(
      "min-h-screen flex flex-col transition-colors duration-500",
      isRushActive
        ? "bg-gradient-to-b from-yellow-950 via-amber-950 to-neutral-950"
        : "bg-gradient-to-b from-indigo-950 via-violet-950 to-neutral-950"
    )}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white active:scale-90 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-white font-bold text-sm truncate max-w-[180px]">{machine.name}</h1>
        <div className="flex items-center gap-1 text-amber-300 text-sm font-bold">
          <Coins className="w-4 h-4" />
          <span>{user ? (user as any).tokens ?? '—' : '—'}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center px-6 py-2">
        {/* RUSH banner */}
        <AnimatePresence>
          {isRushActive && (
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              className="mb-3 px-6 py-2 bg-yellow-400 rounded-full shadow-lg shadow-yellow-900/50"
            >
              <span className="text-yellow-950 font-black text-lg tracking-widest">
                ⚡ RUSH ⚡
              </span>
              <span className="ml-2 text-yellow-800 text-sm font-bold">
                ×{session?.rush_hits_remaining}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Slot drums */}
        <div className="relative w-full max-w-xs aspect-[4/3] rounded-2xl overflow-hidden bg-black/40 border-2 border-white/10 shadow-2xl">
          {machine.image_url ? (
            <Image src={machine.image_url} alt={machine.name} fill className="object-cover opacity-60" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-20 h-20 text-violet-400/40" />
            </div>
          )}

          {/* Drum overlay */}
          <div className="absolute inset-0 flex items-center justify-center gap-3 px-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-1 h-[70%] rounded-xl bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
                <motion.div
                  animate={spinState === 'spinning' ? { y: [0, -40, 0, 40, 0] } : { y: 0 }}
                  transition={spinState === 'spinning' ? { duration: 0.3, repeat: Infinity, delay: i * 0.05 } : { duration: 0.2 }}
                  className="text-4xl select-none"
                >
                  {spinState === 'result' && lastResult
                    ? ['🎁', '⭐', '💎'][i]
                    : ['🎰', '🎯', '🎲'][i]}
                </motion.div>
              </div>
            ))}
          </div>

          {spinState === 'spinning' && (
            <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]" />
          )}
        </div>

        {/* Prize preview strip */}
        {previewItems.length > 0 && (
          <div className="mt-3 w-full max-w-xs overflow-x-auto scrollbar-none">
            <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
              {previewItems.map(item => {
                const isLocked = item.min_bet != null && item.min_bet > currentTier.coins;
                const tierForItem = tiers.find(t => t.coins === item.min_bet);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs whitespace-nowrap transition-opacity",
                      isLocked
                        ? "opacity-30 border-white/10 text-white/40"
                        : "border-white/20 text-white/80"
                    )}
                  >
                    <span className={cn(
                      "font-mono text-[10px] px-1 rounded",
                      item.product_prizes?.level === 'A' ? "bg-yellow-500/30 text-yellow-300" :
                      item.product_prizes?.level === 'B' ? "bg-violet-500/30 text-violet-300" :
                      "bg-white/10 text-white/50"
                    )}>
                      {item.product_prizes?.level}
                    </span>
                    <span>{item.product_prizes?.name}</span>
                    {isLocked && tierForItem && (
                      <span className="text-white/30">{tierForItem.label}↑</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Floor progress */}
        {session && (
          <div className="mt-3 w-full max-w-xs">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>保底進度</span>
              <span>{session.spins_since_rush} / {machine.floor_spin_count}</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-violet-400 to-amber-400 rounded-full"
                animate={{ width: `${floorProgress}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-3 space-y-3">
        {error && (
          <p className="text-center text-red-400 text-sm">{error}</p>
        )}

        {/* Tier selector */}
        {tiers.length > 0 && (
          <div className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors",
            isRushLocked
              ? "bg-yellow-900/30 border-yellow-500/30"
              : "bg-white/5 border-white/10"
          )}>
            <button
              onClick={() => changeTier(-1)}
              disabled={isRushLocked || tierIndex === 0}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all active:scale-90"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex-1 text-center">
              {isRushLocked ? (
                <span className="text-yellow-400/70 text-xs font-medium">⚡ RUSH 檔次鎖定</span>
              ) : null}
              <div className={cn("flex items-center justify-center gap-2", isRushLocked && "mt-0.5")}>
                <span className="text-white font-bold text-sm">{currentTier.label}</span>
                <span className="text-amber-300 text-sm font-mono">{currentTier.coins} G幣</span>
              </div>
            </div>

            <button
              onClick={() => changeTier(1)}
              disabled={isRushLocked || tierIndex === tiers.length - 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all active:scale-90"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Spin button */}
        <motion.button
          onClick={handleSpin}
          disabled={spinState !== 'idle'}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "w-full py-4 rounded-2xl font-black text-lg tracking-wide transition-all shadow-lg",
            isRushActive
              ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-yellow-950 shadow-yellow-900/50"
              : "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-violet-900/50",
            spinState !== 'idle' && "opacity-60 cursor-not-allowed"
          )}
        >
          {spinState === 'spinning' ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}>
                <RotateCcw className="w-5 h-5" />
              </motion.span>
              挑戰中...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" />
              挑戰！
            </span>
          )}
        </motion.button>
      </div>

      {/* RUSH triggered overlay */}
      <AnimatePresence>
        {spinState === 'rush' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -15 }}
              animate={{ scale: [0.5, 1.2, 1], rotate: [-15, 5, 0] }}
              transition={{ duration: 0.5, times: [0, 0.6, 1] }}
              className="text-center"
            >
              <div className="text-8xl mb-4">⚡</div>
              <div className="text-yellow-400 font-black text-4xl tracking-widest drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]">
                RUSH!!
              </div>
              <div className="text-white/70 text-sm mt-2">
                {lastResult?.is_floor ? '保底觸發！' : '觸發連續大獎！'}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prize result overlay */}
      <AnimatePresence>
        {spinState === 'result' && lastResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="mx-6 w-full max-w-xs bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10"
            >
              <div className={cn(
                "h-2 w-full bg-gradient-to-r",
                LEVEL_COLORS[lastResult.prize.level] ?? 'from-neutral-600 to-neutral-700'
              )} />

              <div className="p-6 text-center">
                {lastResult.rush_triggered && (
                  <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-400/20 text-yellow-400 rounded-full text-xs font-bold">
                    <Zap className="w-3 h-3" />
                    RUSH 獎勵
                  </div>
                )}

                <div className="relative w-32 h-32 mx-auto mb-4 rounded-2xl overflow-hidden bg-neutral-800">
                  {lastResult.prize.image_url ? (
                    <Image src={lastResult.prize.image_url} alt={lastResult.prize.name} fill className="object-contain p-2" />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full">
                      <Trophy className="w-12 h-12 text-amber-400" />
                    </div>
                  )}
                </div>

                <div className="inline-block px-2 py-0.5 rounded bg-white/10 text-white/60 text-xs font-mono mb-2">
                  {lastResult.prize.level}
                </div>

                <h3 className="text-white font-bold text-lg">{lastResult.prize.name}</h3>
                <p className="text-white/50 text-xs mt-1">已放入倉庫</p>

                <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/40">
                  <span>累計 {lastResult.session.total_spins} 次</span>
                  {lastResult.session.state === 'rush' && (
                    <span className="text-yellow-400">⚡ RUSH 剩餘 ×{lastResult.session.rush_hits_remaining}</span>
                  )}
                </div>
              </div>

              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white/80 text-sm font-bold active:bg-white/20"
                >
                  繼續挑戰
                </button>
                <button
                  onClick={() => router.push('/item')}
                  className="flex-1 py-3 rounded-xl bg-violet-600 text-white text-sm font-bold active:bg-violet-700"
                >
                  查看倉庫
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
