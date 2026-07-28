'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coins, ArrowLeft, Zap, Trophy, RotateCcw,
  ChevronLeft, ChevronRight, ChevronDown, Lock,
} from 'lucide-react';
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
    products: { type: string } | null;
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
  const [showExplanation, setShowExplanation] = useState(false);
  const [winCount, setWinCount] = useState(0);
  const [isAuto, setIsAuto] = useState(false);
  const isAutoRef = useRef(false);
  const reelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { isAutoRef.current = isAuto; }, [isAuto]);

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
    reelTimerRef.current = setInterval(() => {}, 50);
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
        // Error recovery: re-sync session
        fetch(`/api/slot/${id}/session`)
          .then(r => r.json())
          .then(d => { if (d.session) setSession(d.session); })
          .catch(() => {});
        return;
      }

      setLastResult(data);
      setSession(data.session);
      setWinCount(prev => prev + 1);

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

      // Auto-close in auto mode
      if (isAutoRef.current) {
        autoCloseTimerRef.current = setTimeout(() => {
          if (isAutoRef.current) {
            setLastResult(null);
            setSpinState('idle');
            setTimeout(() => {
              if (isAutoRef.current) handleSpin();
            }, 600);
          }
        }, 2000);
      }
    } catch {
      stopReelSpin();
      setError('連線失敗，已自動復原，請再試一次');
      setSpinState('idle');
      fetch(`/api/slot/${id}/session`)
        .then(r => r.json())
        .then(d => { if (d.session) setSession(d.session); })
        .catch(() => {});
    }
  };

  const handleClose = () => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    setIsAuto(false);
    setLastResult(null);
    setSpinState('idle');
  };

  const floorProgress = session ? Math.min((session.spins_since_rush / (machine?.floor_spin_count ?? 30)) * 100, 100) : 0;

  const rushPool = pool.filter(item => item.rush_only && item.product_prizes);
  const normalPool = pool.filter(item => !item.rush_only && item.product_prizes);

  if (isLoading) return <ProductLoadingScreen />;
  if (!machine) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-neutral-500 bg-neutral-50 dark:bg-neutral-950">
        <p>機台不存在</p>
        <button onClick={() => router.back()} className="mt-4 text-sm underline text-primary">返回</button>
      </div>
    );
  }

  const userTokens = (user as any)?.tokens ?? 0;
  const isLowBalance = userTokens < currentTier.coins;

  // ── Shared renderers ──────────────────────────────────────────

  const renderTopNav = (compact = false) => (
    <div className={cn(
      "flex items-center justify-between px-4 pb-3",
      compact ? "pt-4" : "pt-[max(env(safe-area-inset-top),14px)]"
    )}>
      <button
        onClick={() => router.back()}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 active:scale-90 transition-transform"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <h1 className="text-sm font-bold text-neutral-900 dark:text-white truncate max-w-[180px]">{machine.name}</h1>
      <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400 text-sm font-bold">
        <Coins className="w-4 h-4" />
        <span>{user ? userTokens.toLocaleString() : '—'}</span>
      </div>
    </div>
  );

  const renderDrums = () => (
    <div className={cn(
      "relative mx-4 rounded-2xl overflow-hidden border-2 transition-colors duration-500",
      isRushActive
        ? "border-yellow-400/40 bg-yellow-950/60"
        : "border-neutral-200/50 dark:border-white/10 bg-neutral-900/60 dark:bg-black/50",
    )} style={{ aspectRatio: '4/3' }}>
      {machine.image_url ? (
        <Image src={machine.image_url} alt={machine.name} fill className={cn("object-cover transition-opacity duration-500", isRushActive ? "opacity-40" : "opacity-50")} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap className="w-20 h-20 text-violet-400/30" />
        </div>
      )}

      {/* Drum slots */}
      <div className="absolute inset-0 flex items-center justify-center gap-3 px-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex-1 h-[68%] rounded-xl bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
            <motion.div
              animate={spinState === 'spinning' ? { y: [0, -40, 0, 40, 0] } : { y: 0 }}
              transition={spinState === 'spinning'
                ? { duration: 0.3, repeat: Infinity, delay: i * 0.05 }
                : { duration: 0.2 }}
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

      {/* RUSH inline banner inside visual */}
      <AnimatePresence>
        {isRushActive && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 bg-yellow-400 rounded-full shadow-lg shadow-yellow-900/50"
          >
            <Zap className="w-3.5 h-3.5 text-yellow-950" />
            <span className="text-yellow-950 font-black text-sm tracking-widest">RUSH</span>
            <span className="text-yellow-800 text-sm font-bold">×{session?.rush_hits_remaining}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const renderStatusBar = () => (
    <div className="flex justify-between items-center px-5 py-2">
      <div className="text-xs text-neutral-400 dark:text-neutral-500">
        累計 <span className="font-mono font-medium text-neutral-600 dark:text-neutral-300">{session?.total_spins ?? 0}</span> 次
      </div>
      <div className="text-xs text-neutral-400 dark:text-neutral-500">
        WIN <span className="font-mono font-medium text-emerald-500">{winCount}</span>
      </div>
      <div className="text-xs text-neutral-400 dark:text-neutral-500">
        <span className="font-mono font-medium text-neutral-600 dark:text-neutral-300">{currentTier.coins}</span> G/轉
      </div>
    </div>
  );

  const renderControls = () => (
    <div className="px-4 pb-4 space-y-2.5">
      {/* Tier selector + SPIN + AUTO */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => changeTier(-1)}
          disabled={isRushLocked || tierIndex === 0}
          className="w-12 h-12 flex items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-bold text-xl disabled:opacity-25 active:scale-90 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <motion.button
          onClick={handleSpin}
          disabled={spinState !== 'idle' || !user}
          whileTap={{ scale: 0.97 }}
          className={cn(
            "flex-1 py-3 rounded-xl font-black text-base tracking-wide transition-all shadow-md",
            isRushActive
              ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-yellow-950 shadow-yellow-900/30"
              : "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-violet-900/20",
            spinState !== 'idle' && "opacity-60 cursor-not-allowed"
          )}
        >
          {spinState === 'spinning' ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}>
                <RotateCcw className="w-4 h-4" />
              </motion.span>
              挑戰中...
            </span>
          ) : (
            `SPIN  ${currentTier.coins} G`
          )}
        </motion.button>

        <button
          onClick={() => changeTier(1)}
          disabled={isRushLocked || tierIndex === tiers.length - 1}
          className="w-12 h-12 flex items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-bold text-xl disabled:opacity-25 active:scale-90 transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <button
          onClick={() => setIsAuto(v => !v)}
          className={cn(
            "h-12 px-3 rounded-xl text-xs font-bold transition-all",
            isAuto
              ? "bg-amber-400 text-amber-950 shadow-md"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
          )}
        >
          AUTO
        </button>
      </div>

      {/* Balance */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className={cn("text-neutral-400", isLowBalance && "text-red-400 font-medium")}>
          1回 {currentTier.coins.toLocaleString()} G ｜ 残高 {userTokens.toLocaleString()} G
        </span>
        {isLowBalance && (
          <button onClick={() => router.push('/topup')} className="text-primary underline text-xs font-medium">儲值</button>
        )}
      </div>

      {error && (
        <p className="text-center text-red-400 text-xs">{error}</p>
      )}

      <p className="text-center text-[10px] text-neutral-300 dark:text-neutral-600">
        進行挑戰即視為同意<span className="underline cursor-pointer" onClick={() => router.push('/terms')}>服務條款</span>。未滿 18 歲禁止。
      </p>
    </div>
  );

  const renderInfoSection = () => (
    <div className="px-4 py-5 border-t border-neutral-100 dark:border-neutral-800 space-y-4">
      {/* Name + type badge */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-lg font-black text-neutral-900 dark:text-white leading-tight">{machine.name}</h2>
          {machine.description && <p className="text-sm text-neutral-500 mt-1">{machine.description}</p>}
        </div>
        <span className="shrink-0 mt-0.5 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
          挑戰機台
        </span>
      </div>

      {/* Tier badges */}
      {tiers.length > 0 && (
        <div>
          <div className="text-xs font-medium text-neutral-400 mb-2">下注檔位</div>
          <div className="flex flex-wrap gap-1.5">
            {tiers.map((tier, idx) => (
              <button
                key={tier.coins}
                onClick={() => { if (!isRushLocked) setTierIndex(idx); }}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold transition-colors",
                  idx === tierIndex
                    ? "bg-primary text-white"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                )}
              >
                {tier.coins} G
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floor progress */}
      {session && (
        <div>
          <div className="flex justify-between text-xs text-neutral-400 mb-1.5">
            <span>保底進度</span>
            <span className="font-mono">{session.spins_since_rush} / {machine.floor_spin_count}</span>
          </div>
          <div className="h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-400 to-amber-400 rounded-full"
              animate={{ width: `${floorProgress}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* RUSH rules */}
      <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 p-3.5">
        <div className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2.5 flex items-center gap-1">
          <Zap className="w-3 h-3" />
          RUSH 規則
        </div>
        <div className="grid grid-cols-2 gap-y-2">
          {[
            ['觸發率', `${(machine.trigger_rate * 100).toFixed(0)}%`],
            ['連莊率', `${(machine.continue_rate * 100).toFixed(0)}%`],
            ['最少連數', `${machine.min_rush_hits} 連`],
            ['保底轉數', `${machine.floor_spin_count} 轉`],
          ].map(([label, value]) => (
            <div key={label} className="contents">
              <span className="text-xs text-neutral-500">{label}</span>
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Gameplay explanation */}
      <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3">
        <button
          onClick={() => setShowExplanation(v => !v)}
          className="w-full flex items-center justify-between text-sm font-medium text-neutral-600 dark:text-neutral-300 py-0.5"
        >
          <span>什麼是挑戰機台？</span>
          <ChevronDown className={cn("w-4 h-4 transition-transform", showExplanation && "rotate-180")} />
        </button>
        <AnimatePresence>
          {showExplanation && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-2.5">
                {[
                  { color: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300', text: '每次消耗 G 幣挑戰，必得一件實物獎品' },
                  { color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300', text: '機率觸發 RUSH 連莊，連續獲得多件大獎' },
                  { color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300', text: '獎品進倉庫，可選擇出貨配送或分解換 G 幣' },
                ].map((step, i) => (
                  <div key={i} className="flex gap-2.5 items-start">
                    <span className={cn("w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-black mt-0.5", step.color)}>
                      {i + 1}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{step.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const renderPrizeCard = (item: SlotPoolItem) => {
    const isLocked = item.min_bet != null && item.min_bet > currentTier.coins;
    const pType = item.product_prizes?.products?.type ?? '';
    const rawLevel = item.product_prizes?.level ?? '';
    const displayLevel = ['gacha', 'blindbox', 'slot'].includes(pType) ? '普通' : rawLevel;

    return (
      <div
        key={item.id}
        className={cn(
          "bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-100 dark:border-neutral-800 transition-opacity duration-300",
          isLocked && "opacity-45"
        )}
      >
        <div className="relative aspect-square bg-neutral-50 dark:bg-neutral-800">
          {item.product_prizes?.image_url ? (
            <Image
              src={item.product_prizes.image_url}
              alt={item.product_prizes.name}
              fill
              className="object-contain p-2"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <Trophy className="w-8 h-8 text-neutral-300" />
            </div>
          )}

          {isLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[2px]">
              <Lock className="w-5 h-5 text-white mb-0.5" />
              <span className="text-white text-[10px] font-bold leading-none">{item.min_bet}G↑</span>
            </div>
          )}

          {item.is_floor && !isLocked && (
            <div className="absolute top-1.5 right-1.5 bg-violet-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none">
              保底
            </div>
          )}
        </div>

        <div className="p-2">
          {displayLevel && (
            <span className="inline-block mb-1 px-1.5 py-0.5 text-[9px] rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-bold leading-none">
              {displayLevel}
            </span>
          )}
          <p className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200 leading-tight line-clamp-2">
            {item.product_prizes?.name}
          </p>
          {(item.product_prizes?.recycle_value ?? 0) > 0 && (
            <p className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-0.5">
              <Coins className="w-2.5 h-2.5" />
              {item.product_prizes!.recycle_value} G
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderPrizePool = () => (
    <div className="px-4 py-5 space-y-6">
      {rushPool.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-black text-neutral-900 dark:text-white">🔥 RUSH 獎池</h2>
            <span className="text-xs text-neutral-400 font-medium">{rushPool.length} 件</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {rushPool.map(renderPrizeCard)}
          </div>
        </div>
      )}

      {normalPool.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-black text-neutral-900 dark:text-white">一般獎池</h2>
            <span className="text-xs text-neutral-400 font-medium">{normalPool.length} 件</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {normalPool.map(renderPrizeCard)}
          </div>
        </div>
      )}

      {pool.length === 0 && (
        <p className="text-center text-sm text-neutral-400 py-8">尚未設定獎池</p>
      )}

      <p className="text-[11px] text-neutral-400 text-center leading-relaxed pb-2">
        中獎時依機率獲得上列獎品；本機台每轉必得一件實物。
      </p>
    </div>
  );

  // ── Page layout ──────────────────────────────────────────────

  return (
    <div className="min-h-screen pt-14 md:pt-0 bg-neutral-50 dark:bg-neutral-950">

      {/* ── Mobile / tablet (< 1024px) ── */}
      <div className="block lg:hidden pb-8">
        {/* Machine card */}
        <div className="bg-white dark:bg-neutral-900 shadow-sm">
          {renderTopNav(false)}
          {renderDrums()}
          {renderStatusBar()}
          {renderControls()}
        </div>

        {/* Info section */}
        <div className="mt-2 bg-white dark:bg-neutral-900 shadow-sm">
          {renderInfoSection()}
        </div>

        {/* Prize pool */}
        <div className="mt-2 bg-white dark:bg-neutral-900 shadow-sm">
          {renderPrizePool()}
        </div>
      </div>

      {/* ── Desktop (≥ 1024px) ── */}
      <div className="hidden lg:block pb-12">
        <div className="max-w-7xl mx-auto px-4 pt-20 pb-6">
          <div className="grid grid-cols-12 gap-6 items-start">

            {/* Left: sticky machine + info */}
            <div className="col-span-4 sticky top-20">
              <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                {renderTopNav(true)}
                {renderDrums()}
                {renderStatusBar()}
                {renderControls()}
                {renderInfoSection()}
              </div>
            </div>

            {/* Right: prize pool */}
            <div className="col-span-8">
              <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800">
                {renderPrizePool()}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── RUSH triggered overlay ── */}
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

      {/* ── Prize result modal ── */}
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

                {isAuto && (
                  <p className="mt-3 text-amber-400/70 text-xs font-medium">AUTO 中，2 秒後繼續…</p>
                )}
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
