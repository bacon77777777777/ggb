'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coins, Zap, Trophy, RotateCcw,
  ChevronLeft, ChevronRight, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';

interface ThemeVideos {
  video_rush_entry:        string | null;
  video_rush_anticipation: string | null;
  video_rush_win:          string | null;
  video_rush_win_strong:   string | null;
  video_rush_win_god:      string | null;
  video_rush_revival:      string | null;
}

function pickRushWinVideo(videos: ThemeVideos, videoType: string): string | null {
  if (videoType === 'win_god')    return videos.video_rush_win_god
  if (videoType === 'win_strong') return videos.video_rush_win_strong
  return videos.video_rush_win
}

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
  slot_themes: ThemeVideos & { id: number; name: string; image_url: string | null } | null;
}

interface SlotPoolItem {
  id: number;
  min_bet: number | null;
  is_floor: boolean;
  rush_only: boolean;
  normal_only: boolean;
  remaining: number | null;
  coin_return: boolean | null;
  return_multiplier: number | null;
  display_name: string | null;
  product_prizes: {
    id: number;
    name: string;
    level: string;
    image_url: string | null;
    recycle_value: number;
    products: { type: string } | null;
  } | null;
  slot_prizes: {
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
  tier_progress: Record<string, number> | null;
  total_spins: number;
  locked_bet: number | null;
}

interface SpinResult {
  success: boolean;
  new_balance: number;
  bet: number;
  prize: {
    pool_item_id: number;
    prize_id: number;
    name: string;
    level: string;
    image_url: string;
    recycle_value: number;
    video_type?: string;
  };
  session: SlotSession;
  rush_triggered: boolean;
  is_floor: boolean;
  error?: string;
}

type SpinState = 'idle' | 'spinning' | 'video' | 'result';
type VideoPhase = 'rush_entry' | 'rush_win' | null;

const LEVEL_COLORS: Record<string, string> = {
  'A': 'from-yellow-400 to-amber-500',
  'B': 'from-violet-400 to-purple-600',
  'C': 'from-sky-400 to-blue-500',
  'Last One': 'from-rose-400 to-red-600',
  'LAST ONE': 'from-rose-400 to-red-600',
};

export default function MachinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  // Read pre-selected bet from URL (?bet=100), set on entry from challenge list
  const [preSelectedBet, setPreSelectedBet] = useState<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const b = params.get('bet');
    if (b) setPreSelectedBet(parseInt(b));
  }, []);

  const [machine, setMachine] = useState<SlotMachine | null>(null);
  const [pool, setPool] = useState<SlotPoolItem[]>([]);
  const [session, setSession] = useState<SlotSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [spinState, setSpinState] = useState<SpinState>('idle');
  const [videoPhase, setVideoPhase] = useState<VideoPhase>(null);
  const [lastResult, setLastResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tierIndex, setTierIndex] = useState(0);
  const [winCount, setWinCount] = useState(0);
  const [isAuto, setIsAuto] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);
  const [directConfirm, setDirectConfirm] = useState(false);

  const isAutoRef = useRef(false);
  const reelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResultRef = useRef<SpinResult | null>(null);
  const directConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { isAutoRef.current = isAuto; }, [isAuto]);
  useEffect(() => { lastResultRef.current = lastResult; }, [lastResult]);

  const syncSession = useCallback(() => {
    fetch(`/api/slot/${id}/session`)
      .then(r => r.json())
      .then(d => { if (d.session) setSession(d.session); })
      .catch(() => {});
  }, [id]);

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
            // Prefer URL ?bet param over localStorage
            const urlBet = new URLSearchParams(window.location.search).get('bet');
            const betToFind = urlBet ? parseInt(urlBet) : null;
            if (betToFind) {
              const idx = m.bet_tiers.findIndex(t => t.coins === betToFind);
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
  // Tier locked when entering from challenge list via ?bet= param
  const isTierLocked = !!preSelectedBet || isRushLocked;

  // Per-tier floor progress (from tier_progress[currentBet])
  const spinsThisTier = session?.tier_progress?.[String(currentTier.coins)]
    ?? session?.spins_since_rush
    ?? 0;

  // 直撃費用：max(min_rush_hits, floor_spin_count - spinsThisTier) × bet
  const directCost = machine
    ? Math.max(machine.min_rush_hits, machine.floor_spin_count - spinsThisTier) * currentTier.coins
    : 0;

  const changeTier = useCallback((delta: number) => {
    if (isTierLocked || tiers.length <= 1) return;
    setTierIndex(prev => Math.max(0, Math.min(tiers.length - 1, prev + delta)));
  }, [isTierLocked, tiers]);

  const handleVideoEnd = useCallback(() => {
    if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
    setVideoPhase(null);
    setSpinState(lastResultRef.current ? 'result' : 'idle');
  }, []);

  const handleSpin = async () => {
    if (spinState !== 'idle' || !user) return;
    setError(null);
    setSpinState('spinning');
    if (reelTimerRef.current) clearInterval(reelTimerRef.current);

    try {
      const res = await fetch(`/api/slot/${id}/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet: currentTier.coins }),
      });
      const data: SpinResult = await res.json();
      await new Promise(r => setTimeout(r, 1200));
      if (reelTimerRef.current) clearInterval(reelTimerRef.current);

      if (!res.ok || data.error) {
        setError(data.error ?? '挑戰失敗，請稍後再試');
        setSpinState('idle');
        syncSession();
        return;
      }

      setLastResult(data);
      setSession(data.session);
      setWinCount(prev => prev + 1);

      if (data.session.state === 'rush' && data.session.locked_bet != null && tiers.length > 0) {
        const idx = tiers.findIndex(t => t.coins === data.session.locked_bet);
        if (idx >= 0) setTierIndex(idx);
      }

      const showVideo = !isAutoRef.current;

      if (data.rush_triggered) {
        // 觸發 RUSH → 突入演出
        if (showVideo) {
          setVideoPhase('rush_entry');
          setSpinState('video');
          if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
          videoTimeoutRef.current = setTimeout(handleVideoEnd, 8000);
        } else {
          setSpinState('result');
        }
      } else if (data.session.state === 'rush') {
        // RUSH 中每一轉 → WIN 演出
        if (showVideo) {
          setVideoPhase('rush_win');
          setSpinState('video');
          if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
          videoTimeoutRef.current = setTimeout(handleVideoEnd, 6000);
        } else {
          setSpinState('result');
        }
      } else {
        setSpinState('result');
      }

      if (refreshProfile) refreshProfile();

      if (isAutoRef.current) {
        autoCloseTimerRef.current = setTimeout(() => {
          if (isAutoRef.current) {
            setLastResult(null);
            setSpinState('idle');
            setTimeout(() => { if (isAutoRef.current) handleSpin(); }, 600);
          }
        }, 2000);
      }
    } catch {
      if (reelTimerRef.current) clearInterval(reelTimerRef.current);
      setError('連線失敗，已自動復原，請再試一次');
      setSpinState('idle');
      syncSession();
    }
  };

  const handleDirect = async () => {
    if (spinState !== 'idle' || !user || directLoading || isRushActive) return;

    if (!directConfirm) {
      setDirectConfirm(true);
      if (directConfirmTimerRef.current) clearTimeout(directConfirmTimerRef.current);
      directConfirmTimerRef.current = setTimeout(() => setDirectConfirm(false), 4000);
      return;
    }

    if (directConfirmTimerRef.current) clearTimeout(directConfirmTimerRef.current);
    setDirectConfirm(false);
    setDirectLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/slot/${id}/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet: currentTier.coins }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? '直撃失敗');
        return;
      }

      setSession(data.session);
      if (data.session.locked_bet != null && tiers.length > 0) {
        const idx = tiers.findIndex(t => t.coins === data.session.locked_bet);
        if (idx >= 0) setTierIndex(idx);
      }
      if (refreshProfile) refreshProfile();

      // 直撃只進入 RUSH，無品項結果 → video 結束後回 idle
      setLastResult(null);
      setVideoPhase('rush_entry');
      setSpinState('video');
      if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
      videoTimeoutRef.current = setTimeout(handleVideoEnd, 8000);

    } catch {
      setError('直撃失敗，請稍後再試');
    } finally {
      setDirectLoading(false);
    }
  };

  const handleClose = () => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    setIsAuto(false);
    setLastResult(null);
    setSpinState('idle');
    setDirectConfirm(false);
  };

  if (isLoading) return <ProductLoadingScreen />;
  if (!machine) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-neutral-500 bg-neutral-50 dark:bg-neutral-950">
        <p>機台不存在</p>
        <button onClick={() => router.push('/challenge')} className="mt-4 text-sm underline text-primary">返回</button>
      </div>
    );
  }

  const userTokens = (user as any)?.tokens ?? 0;
  const isLowBalance = userTokens < currentTier.coins;
  const isLowForDirect = userTokens < directCost;
  const floorProgress = session
    ? Math.min((session.spins_since_rush / machine.floor_spin_count) * 100, 100)
    : 0;

  const regularPool = pool
    .filter(item => !item.rush_only && (item.product_prizes || item.slot_prizes))
    .sort((a, b) => {
      const aLocked = a.min_bet != null && a.min_bet > currentTier.coins;
      const bLocked = b.min_bet != null && b.min_bet > currentTier.coins;
      if (aLocked !== bLocked) return Number(aLocked) - Number(bLocked);
      return (a.min_bet ?? 0) - (b.min_bet ?? 0);
    });
  const rushPool = pool.filter(item => item.rush_only && (item.product_prizes || item.slot_prizes));

  // ── renderers ──────────────────────────────────────────────

  const renderMachineVisual = () => (
    <div
      className={cn(
        "relative mx-0 overflow-hidden border-y transition-colors duration-500",
        isRushActive
          ? "border-yellow-200 dark:border-yellow-700 bg-yellow-950/60"
          : "border-neutral-100 dark:border-neutral-800 bg-neutral-900/70"
      )}
      style={{ aspectRatio: '4/3' }}
    >
      {machine.image_url && (
        <Image src={machine.image_url} alt={machine.name} fill
          className={cn("object-cover transition-opacity duration-500", isRushActive ? "opacity-30" : "opacity-40")} />
      )}

      <div className="absolute inset-0 flex items-center justify-center gap-3 px-6">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex-1 h-[65%] rounded-xl bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
            <motion.div
              animate={spinState === 'spinning' ? { y: [0, -40, 0, 40, 0] } : { y: 0 }}
              transition={spinState === 'spinning'
                ? { duration: 0.3, repeat: Infinity, delay: i * 0.05 }
                : { duration: 0.2 }}
              className="text-4xl select-none"
            >
              {spinState === 'result' && lastResult ? ['🎁', '⭐', '💎'][i] : ['🎰', '🎯', '🎲'][i]}
            </motion.div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isRushActive && (
          <motion.div
            initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 bg-yellow-400 rounded-full shadow-lg"
          >
            <Zap className="w-3.5 h-3.5 text-yellow-950" />
            <span className="text-yellow-950 font-black text-sm tracking-widest">RUSH</span>
            <span className="text-yellow-800 text-sm font-bold">×{session?.rush_hits_remaining}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {spinState === 'spinning' && <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]" />}
    </div>
  );

  const renderControls = () => (
    <div className="px-4 py-4 space-y-2.5">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>累計 <span className="font-mono font-medium text-neutral-600 dark:text-neutral-300">{session?.total_spins ?? 0}</span> 次</span>
        <span>WIN <span className="font-mono font-medium text-emerald-500">{winCount}</span></span>
        <span><span className="font-mono font-medium text-neutral-600 dark:text-neutral-300">{currentTier.coins}</span> G/轉</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => changeTier(-1)}
          disabled={isTierLocked || tierIndex === 0}
          className="w-12 h-12 flex items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 disabled:opacity-25 active:scale-90 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <motion.button
          onClick={handleSpin}
          disabled={spinState !== 'idle' || !user}
          whileTap={{ scale: 0.97 }}
          className={cn(
            "flex-1 py-3 rounded-xl font-black text-base tracking-wide shadow-md transition-all",
            isRushActive
              ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-yellow-950 shadow-yellow-900/20"
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
          ) : `SPIN  ${currentTier.coins} G`}
        </motion.button>

        <button
          onClick={() => changeTier(1)}
          disabled={isTierLocked || tierIndex === tiers.length - 1}
          className="w-12 h-12 flex items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 disabled:opacity-25 active:scale-90 transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <button
          onClick={() => setIsAuto(v => !v)}
          className={cn(
            "h-12 px-3 rounded-xl text-xs font-bold transition-all",
            isAuto ? "bg-amber-400 text-amber-950 shadow-md" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
          )}
        >
          AUTO
        </button>
      </div>

      {/* 直撃按鈕：跳過保底等待直接進 RUSH */}
      {!isRushActive && (
        <motion.button
          onClick={handleDirect}
          disabled={spinState !== 'idle' || !user || directLoading || isLowForDirect}
          whileTap={{ scale: 0.97 }}
          className={cn(
            "w-full py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 border-2 transition-all",
            directConfirm
              ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse"
              : "border-amber-400/40 bg-amber-50/30 dark:bg-amber-900/10 text-amber-600/80 dark:text-amber-400/80",
            (spinState !== 'idle' || directLoading || isLowForDirect) && "opacity-40 cursor-not-allowed"
          )}
        >
          <Zap className="w-4 h-4" />
          {directLoading
            ? '處理中...'
            : directConfirm
              ? `確認直撃 ${directCost.toLocaleString()} G？（再按確認）`
              : `直撃　${directCost.toLocaleString()} G → 即進 RUSH`
          }
        </motion.button>
      )}

      <div className="flex items-center justify-center gap-2 text-xs">
        <Coins className="w-3.5 h-3.5 text-amber-500" />
        <span className={cn("text-neutral-400", isLowBalance && "text-red-400 font-medium")}>
          1回 {currentTier.coins.toLocaleString()} G ｜ 残高 {userTokens.toLocaleString()} G
        </span>
        {isLowBalance && (
          <button onClick={() => router.push('/topup')} className="text-primary underline font-medium">儲值</button>
        )}
      </div>

      {error && <p className="text-center text-red-400 text-xs">{error}</p>}

      <p className="text-center text-[10px] text-neutral-300 dark:text-neutral-600">
        進行挑戰即視為同意<span className="underline cursor-pointer" onClick={() => router.push('/terms')}>服務條款</span>。未滿 18 歲禁止。
      </p>
    </div>
  );

  const renderPrizePool = () => {
    // RUSH 獎池在上（實體物品格狀），普通旋轉返還在下（各自一個區塊）
    const coinReturnPool = regularPool.filter(item => item.coin_return);
    const normalPhysicalPool = regularPool.filter(item => !item.coin_return);

    // 格狀品項卡：圖片 + 名稱（居中）+ 價值（固定值，不縮放）
    const renderGridCard = (item: SlotPoolItem) => {
      const prize = item.product_prizes ?? item.slot_prizes;
      const displayValue = item.slot_prizes?.recycle_value ?? item.product_prizes?.recycle_value ?? 0;
      return (
        <div key={item.id} className="flex flex-col items-center">
          <div className="aspect-square w-full relative rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800">
            {prize?.image_url ? (
              <Image src={prize.image_url} alt={prize?.name ?? ''} fill className="object-contain" unoptimized />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <Trophy className="w-7 h-7 text-neutral-300" />
              </div>
            )}
          </div>
          <div className="mt-px h-[22px] flex items-center justify-center w-full px-0.5">
            <p className="text-[9px] text-center text-neutral-600 dark:text-neutral-300 leading-tight line-clamp-2 w-full">
              {prize?.name}
            </p>
          </div>
          {displayValue > 0 && (
            <p className="text-[9px] font-black text-primary tabular-nums text-center">
              {displayValue.toLocaleString()} G
            </p>
          )}
        </div>
      );
    };

    // 只顯示當前檔次的 RUSH 品項（min_bet == currentTier.coins）
    const tieredRushPool = rushPool.filter(item => item.min_bet === currentTier.coins);
    const rushValues = tieredRushPool
      .map(i => i.slot_prizes?.recycle_value ?? i.product_prizes?.recycle_value ?? 0)
      .filter(v => v > 0);
    const rushMinVal = rushValues.length ? Math.min(...rushValues) : 0;
    const rushMaxVal = rushValues.length ? Math.max(...rushValues) : 0;

    const physicalItems = [...tieredRushPool, ...normalPhysicalPool];
    const hasContent = physicalItems.length > 0 || coinReturnPool.length > 0;

    return (
      <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        {/* 標題列 */}
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="text-sm font-black text-neutral-900 dark:text-neutral-50">獎池總覽</h2>
          {isRushActive && (
            <span className="text-xs font-bold text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full">
              ⚡ RUSH 模式
            </span>
          )}
        </div>

        {!hasContent && (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">尚無品項</p>
        )}

        {/* ── RUSH 獎池 ── */}
        {physicalItems.length > 0 && (
          <div className="px-4 pt-3 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">RUSH 獎池</p>
              {rushMinVal > 0 && (
                <p className="text-xs font-black text-primary tabular-nums">
                  {rushMinVal.toLocaleString()} ～ {rushMaxVal.toLocaleString()} G
                </p>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {physicalItems.map(item => renderGridCard(item))}
            </div>
          </div>
        )}

        {/* ── 普通旋轉返還 ── 4 欄 grid，同 RUSH 排版 */}
        {coinReturnPool.length > 0 && (
          <div className={physicalItems.length > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
            <div className="px-4 pt-3 pb-4">
              <p className="text-xs font-black text-neutral-400 uppercase tracking-wider mb-3">普通旋轉返還</p>
              <div className="grid grid-cols-4 gap-2">
                {coinReturnPool.map(item => {
                  const prize = item.slot_prizes;
                  const name = item.display_name ?? prize?.name ?? '返還';
                  const ret = item.return_multiplier != null
                    ? Math.floor(currentTier.coins * item.return_multiplier)
                    : null;
                  return (
                    <div key={item.id} className="flex flex-col items-center">
                      <div className="aspect-square w-full relative rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800">
                        {prize?.image_url ? (
                          <Image src={prize.image_url} alt={name} fill className="object-contain" unoptimized />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full">
                            <Coins className="w-6 h-6 text-amber-400" />
                          </div>
                        )}
                      </div>
                      <div className="mt-px h-[22px] flex items-center justify-center w-full px-0.5">
                        <p className="text-[9px] text-center text-neutral-600 dark:text-neutral-300 leading-tight line-clamp-2 w-full">{name}</p>
                      </div>
                      {ret != null && (
                        <p className="text-[9px] font-black text-primary tabular-nums text-center">
                          {ret.toLocaleString()} G
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMachineInfo = () => {
    const infoRows = [
      { label: '類別', value: '挑戰機台' },
      { label: '最少連數', value: `${machine.min_rush_hits} 連` },
      { label: '保底轉數', value: `${machine.floor_spin_count} 轉` },
    ];
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-2 sm:space-y-4">
        <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">
          {machine.name}
        </h3>

        {tiers.length > 0 && (
          <div className="flex items-center py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
            <div className="flex flex-wrap gap-1.5">
              {tiers.map((tier, idx) => (
                <button
                  key={tier.coins}
                  onClick={() => { if (!isTierLocked) setTierIndex(idx); }}
                  className={cn(
                    "px-3 py-0.5 rounded-full text-xs font-black transition-colors",
                    idx === tierIndex
                      ? "bg-primary text-white"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200"
                  )}
                >
                  {tier.coins} G
                </button>
              ))}
            </div>
          </div>
        )}

        {session && (
          <div className="py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
            <div className="flex justify-between text-[13px] font-black mb-2">
              <span className="text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">保底進度</span>
              <span className="text-neutral-900 dark:text-neutral-50">{session.spins_since_rush} / {machine.floor_spin_count}</span>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 sm:gap-y-4 gap-x-12">
          {infoRows.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
              <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">{label}</span>
              <span className="text-neutral-900 dark:text-neutral-50 font-black text-[13px] text-right">{value}</span>
            </div>
          ))}
        </div>

        <div className="pt-1">
          <p className="text-[13px] sm:text-sm font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">注意事項</p>
          <ol className="space-y-1 list-decimal list-inside">
            {[
              '每次挑戰必得一件實物獎品。',
              '抽出後即確認結果，不可退款或更換。',
              '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
              '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
              'RUSH 觸發後連續獲得多件大獎，最少連中次數有所保證。',
              '直撃費用一經扣除不予退還，RUSH 中無法再次直撃。',
            ].map((text, i) => (
              <li key={i} className="text-[12px] sm:text-[13px] text-neutral-400 dark:text-neutral-500 font-bold leading-relaxed">{text}</li>
            ))}
          </ol>
        </div>
      </div>
    );
  };

  // ── layout ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pt-14 md:pt-0 bg-neutral-50 dark:bg-neutral-950">

      {/* Mobile / tablet */}
      <div className="block lg:hidden pb-8">
        <div className="bg-white dark:bg-neutral-900 shadow-sm border-b border-neutral-100 dark:border-neutral-800">
          {renderMachineVisual()}
          {renderControls()}
        </div>
        <div className="w-full max-w-[560px] mx-auto px-2 pb-2 mt-2 space-y-2">
          {renderPrizePool()}
          {renderMachineInfo()}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:block pb-12">
        <div className="max-w-7xl mx-auto px-2 pt-20 pb-6">
          <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-4 sticky top-4">
              <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                {renderMachineVisual()}
                {renderControls()}
              </div>
            </div>
            <div className="col-span-8 space-y-4">
              {renderPrizePool()}
              {renderMachineInfo()}
            </div>
          </div>
        </div>
      </div>

      {/* 影片演出 overlay */}
      <AnimatePresence>
        {spinState === 'video' && videoPhase && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center cursor-pointer"
            onClick={handleVideoEnd}
          >
            {/* 影片本體 */}
            <video
              key={videoPhase}
              src={(videoPhase === 'rush_entry'
                ? machine.slot_themes?.video_rush_entry
                : pickRushWinVideo(
                    machine.slot_themes ?? { video_rush_entry:null,video_rush_anticipation:null,video_rush_win:null,video_rush_win_strong:null,video_rush_win_god:null,video_rush_revival:null },
                    lastResult?.prize.video_type ?? 'win'
                  )) ?? undefined}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              onEnded={handleVideoEnd}
              onError={handleVideoEnd}
            />

            {/* 文字覆蓋 */}
            <div className="relative z-10 text-center pointer-events-none select-none">
              {videoPhase === 'rush_entry' ? (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <div className="text-yellow-400 font-black text-7xl drop-shadow-[0_0_40px_rgba(251,191,36,1)]">⚡</div>
                  <div className="text-white font-black text-4xl mt-2 tracking-widest drop-shadow-lg">RUSH 突入！</div>
                  <div className="text-yellow-300/90 font-bold text-lg mt-2">連中確定</div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="text-amber-400 font-black text-6xl tracking-wide drop-shadow-[0_0_30px_rgba(251,191,36,0.8)]">WIN!</div>
                  {lastResult?.prize.name && (
                    <div className="text-white font-bold text-xl mt-3 drop-shadow-lg">{lastResult.prize.name}</div>
                  )}
                  {(lastResult?.session.rush_hits_remaining ?? 0) > 0 && (
                    <div className="text-yellow-400 text-base mt-1 font-bold">
                      ⚡ RUSH 剩餘 ×{lastResult!.session.rush_hits_remaining}
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* 階段標籤（開發提示） */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/30 text-xs font-mono pointer-events-none">
              {videoPhase === 'rush_entry' ? '📽 RUSH 突入演出' : '📽 RUSH WIN 演出'}
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 text-xs pointer-events-none">
              點擊跳過
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 獎品結果 modal */}
      <AnimatePresence>
        {spinState === 'result' && lastResult && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="mx-6 w-full max-w-xs bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10"
            >
              <div className={cn("h-2 w-full bg-gradient-to-r", LEVEL_COLORS[lastResult.prize.level] ?? 'from-neutral-600 to-neutral-700')} />
              <div className="p-6 text-center">
                {lastResult.rush_triggered && (
                  <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-400/20 text-yellow-400 rounded-full text-xs font-bold">
                    <Zap className="w-3 h-3" />RUSH 獎勵
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
                  {lastResult.session.state === 'rush' && (lastResult.session.rush_hits_remaining ?? 0) > 0 && (
                    <span className="text-yellow-400">⚡ RUSH 剩餘 ×{lastResult.session.rush_hits_remaining}</span>
                  )}
                </div>
                {isAuto && <p className="mt-3 text-amber-400/70 text-xs font-medium">AUTO 中，2 秒後繼續…</p>}
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={handleClose} className="flex-1 py-3 rounded-xl bg-white/10 text-white/80 text-sm font-bold active:bg-white/20">
                  繼續挑戰
                </button>
                <button onClick={() => router.push('/item')} className="flex-1 py-3 rounded-xl bg-violet-600 text-white text-sm font-bold active:bg-violet-700">
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
