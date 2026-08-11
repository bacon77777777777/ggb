'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import SlotMachineVisual from '@/components/challenge/SlotMachineVisual';
import SlotMachineClassic, { ReelOutcome, MachineLayout, setSfxMuted } from '@/components/challenge/SlotMachineClassic';
import DanmakuLayer, { type DanmakuItem } from '@/components/challenge/DanmakuLayer';
import EndingBar from '@/components/challenge/EndingBar';
import dynamic from 'next/dynamic';

const PlayerProfileCard = dynamic(() => import('@/components/ranking/PlayerProfileCard'), { ssr: false });
import { inheritSchedule } from '@/lib/schedule';
import PrizeDetailSheet from '@/components/ui/PrizeDetailSheet';

// 返還種類 → 滾輪演出組合（機率由 DB 權重決定，這裡純顯示映射）
const RETURN_OUTCOME: Record<string, ReelOutcome> = {
  '神域共鳴': 'triple',   // 三個一樣（非7）
  '命運之瞳': 'pair7',    // 雙7聽牌
  '緋色幸運': 'pair',     // 兩個一樣（非7）
  '黃金序章': 'mixed',    // 三個都不同
};

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
  event_slug: string | null;
  start_at: string | null;
  end_at: string | null;
  slot_themes: ThemeVideos & { id: number; name: string; image_url: string | null; machine_type: string | null; machine_sprite_url: string | null; machine_layout: MachineLayout | null; event_slug: string | null; start_at: string | null; end_at: string | null } | null;
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
    remaining: number | null;
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
  spins_since_rush: number;   // = floor_counter（機台層級保底計數）
  floor_counter: number;
  tier_progress: Record<string, number> | null;
  total_spins: number;
  locked_bet: number | null;
  day_spins?: number;   // 機台當日總轉次（台灣時間 00:00 重置）
  day_rush?: number;    // 機台當日 RUSH 觸發次數
}

interface SpinResult {
  success: boolean;
  new_balance: number;
  bet: number;
  is_coin_return: boolean;
  coin_return_amount: number;
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
  is_ceiling: boolean;
  error?: string;
}

type SpinState = 'idle' | 'spinning' | 'stopping' | 'video' | 'result';
type VideoPhase = 'rush_entry' | 'rush_win' | null;

// ── RUSH 得獎慶祝彩帶 ──────────────────────────────────────────────
const CONFETTI_COLORS = ['#ff4d6d', '#ffd400', '#4dd08c', '#4da6ff', '#c44dff', '#ff8c1a', '#ffffff'];

function ConfettiBurst() {
  const pieces = useMemo(() => Array.from({ length: 52 }, (_, i) => {
    const spread = (Math.random() - 0.5) * 96;   // vw 水平散布
    return {
      id: i,
      xMid: `${spread * 0.55}vw`,
      xEnd: `${spread}vw`,
      yMid: `${-(8 + Math.random() * 24)}vh`,    // 先向上噴
      delay: Math.random() * 0.25,
      dur: 2 + Math.random() * 1.3,
      w: 6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rot: (Math.random() - 0.5) * 900,
      round: Math.random() > 0.5,
    };
  }), []);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map(p => (
        <motion.span
          key={p.id}
          initial={{ x: '0vw', y: '0vh', rotate: 0, opacity: 1 }}
          animate={{
            x: ['0vw', p.xMid, p.xEnd],
            y: ['0vh', p.yMid, '115vh'],
            rotate: p.rot,
            opacity: [1, 1, 0.85],
          }}
          transition={{ duration: p.dur, delay: p.delay, ease: [0.15, 0.6, 0.55, 1], times: [0, 0.28, 1] }}
          className="absolute left-1/2 top-[36%]"
          style={{ width: p.w, height: p.w * 0.45, background: p.color, borderRadius: p.round ? '50%' : '2px' }}
        />
      ))}
    </div>
  );
}

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
  const [previewPrize, setPreviewPrize] = useState<{ name: string; image_url: string | null; level?: string; recycle_value?: number | null } | null>(null);
  // 機台總餘額板顯示值：按下 SPIN 即時扣款，回包後以 new_balance 校正；idle 時跟 profile 對齊
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [sfxMuted, setSfxMutedState] = useState(false);
  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('smvc-muted') === '1';
    setSfxMutedState(saved);
    setSfxMuted(saved);
  }, []);
  const toggleMute = () => {
    setSfxMutedState(prev => {
      const next = !prev;
      setSfxMuted(next);
      try { localStorage.setItem('smvc-muted', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  // 彈幕開關（與音效開關同樣記在 localStorage）
  const [danmakuOff, setDanmakuOff] = useState(false);
  useEffect(() => {
    setDanmakuOff(typeof window !== 'undefined' && localStorage.getItem('smvc-danmaku-off') === '1');
  }, []);
  const toggleDanmaku = () => {
    setDanmakuOff(prev => {
      const next = !prev;
      try { localStorage.setItem('smvc-danmaku-off', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  const [danmaku, setDanmaku] = useState<DanmakuItem[]>([]);
  useEffect(() => {
    if (danmakuOff) return;
    const load = () => fetch('/api/slot/danmaku')
      .then(r => r.json())
      .then(d => setDanmaku(d.items ?? []))
      .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [danmakuOff]);
  const [machineEnded, setMachineEnded] = useState(false);
  // 點彈幕暱稱開玩家資訊卡（與首頁中獎跑馬燈相同互動）
  const [profileUser, setProfileUser] = useState<{ id: string; nickname: string } | null>(null);
  const [pool, setPool] = useState<SlotPoolItem[]>([]);
  const [session, setSession] = useState<SlotSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [spinState, setSpinState] = useState<SpinState>('idle');
  const [videoPhase, setVideoPhase] = useState<VideoPhase>(null);
  const [lastResult, setLastResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tierIndex, setTierIndex] = useState(0);
  const [isAuto, setIsAuto] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);
  const [jackpot, setJackpot] = useState(false);
  const [reelOutcome, setReelOutcome] = useState<ReelOutcome | null>(null);
  const [rushStreak, setRushStreak] = useState(0);
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [coinReturnDisplay, setCoinReturnDisplay] = useState<{ amount: number; id: number } | null>(null);
  // 閒置踢出：初次上機 30 秒，SPIN/直擊每次 +60 秒（上限 90 秒），進出不重置；
  // 最後 15 秒警告，到期踢出即讓位。期限與伺服器同步。
  const [idleWarnSeconds, setIdleWarnSeconds] = useState<number | null>(null);
  const idleDeadlineRef = useRef<number>(Date.now() + 30_000);
  const idleKickedRef = useRef(false);
  const extendIdleDeadline = () => {
    const now = Date.now();
    const remaining = Math.max(idleDeadlineRef.current - now, 0);
    idleDeadlineRef.current = now + Math.min(remaining + 60_000, 90_000);
  };
  const coinReturnIdRef = useRef(0);
  const coinReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAutoRef = useRef(false);
  const reelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResultRef = useRef<SpinResult | null>(null);
  const videoPhaseRef = useRef<VideoPhase>(null);
  const animDoneRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scheduleResultCloseRef = useRef<() => void>(() => {});

  useEffect(() => { isAutoRef.current = isAuto; }, [isAuto]);
  useEffect(() => {
    if (spinState === 'idle') setWalletBalance((user as any)?.tokens ?? 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, spinState]);
  useEffect(() => { lastResultRef.current = lastResult; }, [lastResult]);
  useEffect(() => { videoPhaseRef.current = videoPhase; }, [videoPhase]);

  const showCoinReturn = useCallback((amount: number) => {
    if (coinReturnTimerRef.current) clearTimeout(coinReturnTimerRef.current);
    setCoinReturnDisplay({ amount, id: ++coinReturnIdRef.current });
    coinReturnTimerRef.current = setTimeout(() => setCoinReturnDisplay(null), 3000);
  }, []);

  const syncSession = useCallback(() => {
    fetch(`/api/slot/${id}/session`)
      .then(r => r.json())
      .then(d => { if (d.session) setSession(d.session); })
      .catch(() => {});
  }, [id]);

  // 機台佔用：進入時 occupy，每 20 秒 heartbeat，離開時 vacate
  useEffect(() => {
    const occupy = () =>
      fetch(`/api/slot/${id}/occupy`, { method: 'POST' })
        .then(async r => {
          const d = await r.json().catch(() => null);
          if (r.status === 409) {
            // 機台已被他人佔用（列表輪詢空窗撞入）：退回挑戰頁
            router.replace('/challenge');
            return;
          }
          if (d?.occupancy_expires_at) idleDeadlineRef.current = new Date(d.occupancy_expires_at).getTime();
        })
        .catch(() => {});
    const heartbeat = () => fetch(`/api/slot/${id}/heartbeat`, { method: 'POST' }).catch(() => {});
    const vacate = () => fetch(`/api/slot/${id}/vacate`, { method: 'POST', keepalive: true }).catch(() => {});

    occupy();
    heartbeatRef.current = setInterval(heartbeat, 20_000);

    const onHide = () => { if (document.visibilityState === 'hidden' && !idleKickedRef.current) vacate(); };
    const onShow = () => { if (document.visibilityState === 'visible' && !idleKickedRef.current) occupy(); };
    document.addEventListener('visibilitychange', onHide);
    document.addEventListener('visibilitychange', onShow);

    return () => {
      clearInterval(heartbeatRef.current ?? undefined);
      document.removeEventListener('visibilitychange', onHide);
      document.removeEventListener('visibilitychange', onShow);
      if (!idleKickedRef.current) vacate();
    };
  }, [id]);

  // 閒置踢出計時：期限 = 最後動作 +90s（最後 15 秒顯示警告），SPIN/直擊刷新
  useEffect(() => {
    const WARN_SECONDS = 15;
    const t = setInterval(() => {
      if (idleKickedRef.current) return;
      const leftMs = idleDeadlineRef.current - Date.now();
      if (leftMs <= 0) {
        idleKickedRef.current = true;
        setIdleWarnSeconds(null);
        fetch(`/api/slot/${id}/vacate?immediate=1`, { method: 'POST', keepalive: true }).catch(() => {});
        router.replace('/challenge?idle_kick=1');
        return;
      }
      const leftSec = Math.ceil(leftMs / 1000);
      setIdleWarnSeconds(leftSec <= WARN_SECONDS ? leftSec : null);
    }, 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // RUSH 視覺狀態：state='rush' 即算（含 hits=0 的延續判定中——下一轉揭曉是否連中）
  const isRushActive = session?.state === 'rush';
  const isRushLocked = isRushActive;
  // Tier locked when entering from challenge list via ?bet= param
  const isTierLocked = !!preSelectedBet || isRushLocked;

  // 機台層級保底計數（machine-level, 所有玩家共用）
  const spinsThisTier = session?.floor_counter ?? session?.spins_since_rush ?? 0;

  // 直撃費用：剩餘保底轉數 × 檔次金額（隨已轉數下降，與 enter_slot_rush_direct 一致）
  const directCost = Math.max((machine?.floor_spin_count ?? 0) - (session?.floor_counter ?? 0), 1) * currentTier.coins;

  const changeTier = useCallback((delta: number) => {
    if (isTierLocked || tiers.length <= 1) return;
    setTierIndex(prev => Math.max(0, Math.min(tiers.length - 1, prev + delta)));
  }, [isTierLocked, tiers]);

  const handleVideoEnd = useCallback(() => {
    if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
    const phase = videoPhaseRef.current;
    setVideoPhase(null);
    if (phase === 'rush_entry') {
      // 突入影片結束：進入 RUSH 狀態，此轉無 RUSH 獎池品項，回 idle 等玩家繼續轉
      setLastResult(null);
      setSpinState('idle');
    } else {
      // RUSH WIN 影片結束：延遲 2 秒讓玩家欣賞機台效果
      if (lastResultRef.current) {
        setTimeout(() => {
          setSpinState('result');
          scheduleResultCloseRef.current();
        }, 2000);
      } else {
        setSpinState('idle');
      }
    }
  }, []);

  // 結果慶祝關閉；auto 開啟時關閉後續轉。streak 歸零交給「非 777 揭曉轉」的 animDone 處理
  function closeResult() {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    setLastResult(null);
    setJackpot(false);
    setSpinState('idle');
    if (isAutoRef.current) setTimeout(() => { if (isAutoRef.current) handleSpin(); }, 600);
  }

  // 結果慶祝顯示後數秒自動關閉（手動/auto 皆自動關）
  function scheduleResultClose() {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => closeResult(), 2600);
  }
  scheduleResultCloseRef.current = scheduleResultClose;

  const handleSpin = async () => {
    if (spinState !== 'idle' || !user) return;
    setError(null);
    setJackpot(false);
    extendIdleDeadline();
    setIdleWarnSeconds(null);
    setSpinState('spinning');
    setWalletBalance(b => Math.max(0, (b ?? (user as any)?.tokens ?? 0) - currentTier.coins));
    if (reelTimerRef.current) clearInterval(reelTimerRef.current);

    try {
      const res = await fetch(`/api/slot/${id}/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet: currentTier.coins }),
      });
      const data: SpinResult = await res.json();
      if (reelTimerRef.current) clearInterval(reelTimerRef.current);

      if (!res.ok || data.error) {
        if (String(data.error ?? '').includes('機台使用中')) { router.replace('/challenge'); return; }
        setError(data.error ?? '挑戰失敗，請稍後再試');
        setJackpot(false);
        setSpinState('idle');
        setWalletBalance((user as any)?.tokens ?? 0);
        syncSession();
        return;
      }

      setLastResult(data);
      setSession(data.session);

      if (data.session.state === 'rush' && data.session.locked_bet != null && tiers.length > 0) {
        const idx = tiers.findIndex(t => t.coins === data.session.locked_bet);
        if (idx >= 0) setTierIndex(idx);
      }

      // jackpot（777）= RUSH 觸發 or RUSH 品項轉（保底連中 / 延續判定通過，state 維持 rush）
      // 延續判定失敗的揭曉轉 state='normal' → 非 777，finish(false) 換回普通機台
      const isJackpot = data.rush_triggered || data.session.state === 'rush';
      setJackpot(isJackpot);
      // 退幣轉：滾輪演出對應返還種類的組合
      setReelOutcome(!isJackpot && data.is_coin_return ? (RETURN_OUTCOME[data.prize?.name] ?? 'mixed') : null);

      const isClassic = (machine?.slot_themes?.machine_type ?? 'video') === 'classic';
      const showVideo = !isAutoRef.current && !isClassic;

      if (data.rush_triggered) {
        // 觸發 RUSH：本發為 coin return（退幣），不計入 streak
        // rushStreak 維持 0 → finish(true) 顯示 "RUSH!!" 而非 "大当り!!"
        if (showVideo) {
          setVideoPhase('rush_entry');
          setSpinState('video');
          if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
          videoTimeoutRef.current = setTimeout(handleVideoEnd, 8000);
        } else {
          // classic / auto：777 動畫顯示 "RUSH!!"，結束後回 idle 等玩家在 RUSH 中旋轉
          animDoneRef.current = () => {
            if (data.coin_return_amount > 0) showCoinReturn(data.coin_return_amount);
            setWalletBalance(data.new_balance);
            setLastResult(null);
            setSpinState('idle');
            if (refreshProfile) refreshProfile();
            if (isAutoRef.current) setTimeout(() => { if (isAutoRef.current) handleSpin(); }, 700);
          };
          setSpinState('stopping');
        }
      } else if (data.session.state === 'rush') {
        // RUSH 中旋轉：抽到品項，streak 遞增，顯示結果
        setRushStreak(prev => prev + 1);
        if (showVideo) {
          setVideoPhase('rush_win');
          setSpinState('video');
          if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
          videoTimeoutRef.current = setTimeout(handleVideoEnd, 6000);
        } else {
          animDoneRef.current = () => {
            setWalletBalance(data.new_balance);
            setTimeout(() => {
              setSpinState('result');
              if (refreshProfile) refreshProfile();
              scheduleResultClose();
            }, 2000);
          };
          setSpinState('stopping');
        }
      } else {
        if (isClassic) {
          // 普通旋轉 / 延續失敗揭曉轉：非 777 停定 → +XG、finish(false) 換回普通機台、streak 歸零
          animDoneRef.current = () => {
            if (data.coin_return_amount > 0) showCoinReturn(data.coin_return_amount);
            setWalletBalance(data.new_balance);
            setRushStreak(0);
            setSpinState('idle');
            if (refreshProfile) refreshProfile();
            if (isAutoRef.current) setTimeout(() => { if (isAutoRef.current) handleSpin(); }, 700);
          };
          setSpinState('stopping');
        } else {
          setRushStreak(0);
          setSpinState('idle');
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
        }
      }
    } catch {
      if (reelTimerRef.current) clearInterval(reelTimerRef.current);
      setError('連線失敗，已自動復原，請再試一次');
      setJackpot(false);
      setSpinState('idle');
      setWalletBalance((user as any)?.tokens ?? 0);
      syncSession();
    }
  };

  // 直擊按鈕：開確認彈窗
  const handleDirect = () => {
    if (spinState !== 'idle' || !user || isRushActive) return;
    setShowDirectModal(true);
  };

  // 確認後執行直擊 API
  const executeDirectSpin = async () => {
    if (spinState !== 'idle' || !user || directLoading || isRushActive) return;
    setDirectLoading(true);
    setError(null);
    extendIdleDeadline();
    setIdleWarnSeconds(null);

    const isClassic = (machine?.slot_themes?.machine_type ?? 'video') === 'classic';
    setWalletBalance(b => Math.max(0, (b ?? (user as any)?.tokens ?? 0) - directCost));
    if (isClassic) {
      // Classic 模式：先啟動滾輪視覺，再等 API
      setJackpot(false);
      setSpinState('spinning');
    }

    try {
      const [res] = await Promise.all([
        fetch(`/api/slot/${id}/direct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bet: currentTier.coins }),
        }),
        isClassic ? new Promise(r => setTimeout(r, 800)) : Promise.resolve(),
      ]);
      const data = await (res as Response).json();

      if (!res.ok || data.error) {
        if (String(data.error ?? '').includes('機台使用中')) { router.replace('/challenge'); return; }
        setError(data.error ?? '直撃失敗');
        setWalletBalance((user as any)?.tokens ?? 0);
        if (isClassic) setSpinState('idle');
        return;
      }

      setSession(data.session);
      if (data.session.locked_bet != null && tiers.length > 0) {
        const idx = tiers.findIndex(t => t.coins === data.session.locked_bet);
        if (idx >= 0) setTierIndex(idx);
      }
      if (data.new_balance != null) setWalletBalance(data.new_balance);
      if (refreshProfile) refreshProfile();

      if (isClassic) {
        // Classic 模式：直撃突入也要完整演出——滾輪轉動 → 777 停定 → RUSH!!（streak=0）
        setJackpot(true);
        setReelOutcome(null);
        setRushStreak(0);
        setLastResult(null);
        animDoneRef.current = () => {
          setSpinState('idle');
        };
        setSpinState('stopping');
      } else {
        // 直撃只進入 RUSH，無品項結果 → video 結束後回 idle
        setLastResult(null);
        setVideoPhase('rush_entry');
        setSpinState('video');
        if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);
        videoTimeoutRef.current = setTimeout(handleVideoEnd, 8000);
      }
    } catch {
      setError('直撃失敗，請稍後再試');
      setWalletBalance((user as any)?.tokens ?? 0);
      if (isClassic) setSpinState('idle');
    } finally {
      setDirectLoading(false);
    }
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
    // coin_return 項目為 display_name-only（migration 386 起無獎品連結），一樣要列出
    .filter(item => !item.rush_only && (item.coin_return || item.product_prizes || item.slot_prizes))
    .sort((a, b) => {
      const aLocked = a.min_bet != null && a.min_bet > currentTier.coins;
      const bLocked = b.min_bet != null && b.min_bet > currentTier.coins;
      if (aLocked !== bLocked) return Number(aLocked) - Number(bLocked);
      return (a.min_bet ?? 0) - (b.min_bet ?? 0);
    });
  const rushPool = pool.filter(item => item.rush_only && (item.product_prizes || item.slot_prizes));

  // ── renderers ──────────────────────────────────────────────

  const machineType = machine.slot_themes?.machine_type ?? 'video';

  const renderMachineVisual = () => machineType === 'classic' ? (
    <div className="relative w-full">
      {!danmakuOff && (
        <DanmakuLayer
          items={danmaku}
          paused={isRushActive || spinState === 'video'}
          onNameClick={(id, nickname) => setProfileUser({ id, nickname })}
        />
      )}
      <SlotMachineClassic
        spinState={spinState}
        isRushActive={isRushActive}
        rushHitsRemaining={session?.rush_hits_remaining ?? 0}
        isAuto={isAuto}
        reelOutcome={reelOutcome}
        spriteUrl={machine.slot_themes?.machine_sprite_url ?? undefined}
        machineLayout={machine.slot_themes?.machine_layout ?? undefined}
        spinsThisTier={spinsThisTier}
        floorSpinCount={machine.floor_spin_count}
        jackpot={jackpot}
        rushStreak={rushStreak}
        winCount={session?.day_rush ?? 0}
        totalSpins={session?.day_spins ?? 0}
        betCoins={currentTier.coins}
        directCost={directCost}
        balance={walletBalance ?? userTokens}
        onSpin={handleSpin}
        onDirect={handleDirect}
        onAutoToggle={() => setIsAuto(v => !v)}
        onAnimDone={() => { animDoneRef.current?.(); animDoneRef.current = null; }}
      />
      <AnimatePresence>
        {coinReturnDisplay && (
          <motion.div
            key={coinReturnDisplay.id}
            initial={{ opacity: 0, y: 0, scale: 0.7 }}
            animate={{ opacity: 1, y: -44, scale: 1.25 }}
            exit={{ opacity: 0, y: -80, scale: 1 }}
            transition={{ duration: 0.45 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[45] pointer-events-none select-none"
          >
            <span className="font-black tabular-nums" style={{
              fontSize: '2.6rem',
              color: '#facc15',
              textShadow: '0 0 16px rgba(250,200,0,0.95), 0 0 8px #ff8c00, 0 2px 4px rgba(0,0,0,0.85)',
              letterSpacing: '-0.02em',
              fontFamily: 'Impact, "Arial Black", sans-serif',
            }}>
              +{coinReturnDisplay.amount}G
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ) : (
    <SlotMachineVisual
      spinState={spinState as 'idle' | 'spinning' | 'video' | 'result'}
      isRushActive={isRushActive}
      rushHitsRemaining={session?.rush_hits_remaining ?? 0}
      isAuto={isAuto}
      spinsThisTier={spinsThisTier}
      floorSpinCount={machine.floor_spin_count}
      jackpot={jackpot}
      onSpin={handleSpin}
      onDirect={handleDirect}
      onAutoToggle={() => setIsAuto(v => !v)}
    />
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
        <div
          key={item.id}
          className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform"
          onClick={() => prize && setPreviewPrize({ name: prize.name, image_url: prize.image_url, level: prize.level, recycle_value: prize.recycle_value })}
        >
          <div className="aspect-[63/88] w-full relative rounded-md overflow-hidden">
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

    // 只顯示當前檔次的 RUSH 品項（min_bet = 當前檔次；NULL = 全檔通用）
    const tieredRushPool = rushPool.filter(item => item.min_bet == null || item.min_bet === currentTier.coins);
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
          {/* 原本此處有「⚡ RUSH 模式」標籤，已移除：
              它跟著 isRushActive 即時切換，會在滾輪還沒停穩前就先消失，
              等於提前洩漏這轉有沒有連中，破壞開獎的懸念 */}
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
                <p className="text-sm font-black text-primary tabular-nums">
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
        {coinReturnPool.length > 0 && (() => {
          const crMults = coinReturnPool.map(i => i.return_multiplier ?? 0).filter(v => v > 0);
          const crMin = crMults.length ? Math.floor(currentTier.coins * Math.min(...crMults)) : 0;
          const crMax = crMults.length ? Math.floor(currentTier.coins * Math.max(...crMults)) : 0;
          return (
          <div className={physicalItems.length > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}>
            <div className="px-4 pt-3 pb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-neutral-400 uppercase tracking-wider">普通旋轉返還</p>
                {crMin > 0 && (
                  <p className="text-sm font-black text-primary tabular-nums">
                    {crMin.toLocaleString()} ～ {crMax.toLocaleString()} G
                  </p>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {coinReturnPool.map(item => {
                  const prize = item.slot_prizes;
                  const name = item.display_name ?? prize?.name ?? '返還';
                  const ret = item.return_multiplier != null
                    ? Math.floor(currentTier.coins * item.return_multiplier)
                    : null;
                  return (
                    <div key={item.id} className="flex flex-col items-center">
                      <div className="aspect-[63/88] w-full relative rounded-md overflow-hidden">
                        <Image
                          src={prize?.image_url ?? '/images/slot/machine/coin.png'}
                          alt={name} fill className="object-contain p-2" unoptimized
                        />
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
          );
        })()}
      </div>
    );
  };

  const renderMachineInfo = () => {
    const infoRows = [
      { label: '類別', value: '挑戰機台' },
      { label: '主題', value: machine.name },
      { label: '檔次', value: `${currentTier.coins} G` },
      { label: '最少連數', value: `${machine.min_rush_hits} 連` },
      { label: '保底轉數', value: `${machine.floor_spin_count} 轉` },
      { label: '保底進度', value: `${Math.min(spinsThisTier, machine.floor_spin_count)} / ${machine.floor_spin_count}` },
    ];
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-2 sm:space-y-4">
        <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-base sm:text-xl tracking-tight border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">
          機台資訊
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 sm:gap-y-4 gap-x-12">
          {infoRows.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
              <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">{label}</span>
              <span className="text-neutral-900 dark:text-neutral-50 font-black text-[13px] text-right">{value}</span>
            </div>
          ))}
          <div className="flex justify-between items-center py-1 sm:py-2 border-b border-dashed border-neutral-100 dark:border-neutral-800">
            <span className="text-neutral-500 dark:text-neutral-400 font-black uppercase tracking-widest text-[13px]">規則說明</span>
            <Link href="/challenge/rules"
              className="text-primary font-black text-[13px] text-right underline underline-offset-2 hover:opacity-80 transition-opacity">
              前往查看
            </Link>
          </div>
        </div>

        <div className="pt-1">
          <p className="text-[13px] sm:text-sm font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">注意事項</p>
          <ol className="space-y-1 list-decimal list-inside">
            {[
              '每次挑戰必得一件實物獎品。',
              '抽出後即確認結果，不可退款或更換。',
              '實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。',
              '如遇商品缺貨，將以 G幣 原額退還，敬請見諒。',
              'RUSH 可於任意轉隨機觸發；累積至保底轉數時必定觸發，觸發後進度歸零。',
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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">

      {/* ── 頂部操作列（同文章內頁：黑圓返回 + 聲音開關）── */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between pt-[env(safe-area-inset-top)] pointer-events-none">
        <button onClick={() => router.push('/challenge')}
          className="pointer-events-auto m-[10px] w-[38px] h-[38px] bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center">
        <button onClick={toggleDanmaku} aria-label="彈幕開關"
          className="pointer-events-auto my-[10px] ml-[10px] w-[38px] h-[38px] bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="3" />
            <path d="M6 10h6M6 14h4M15 12h3" />
            {danmakuOff && <line x1="3" y1="3" x2="21" y2="21" stroke="#ef4444" strokeWidth={2.5} />}
          </svg>
        </button>
        <button onClick={toggleMute} aria-label="音效開關"
          className="pointer-events-auto m-[10px] w-[38px] h-[38px] bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
            {sfxMuted && <line x1="3" y1="3" x2="21" y2="21" stroke="#ef4444" strokeWidth={2.5} />}
          </svg>
        </button>
        </div>
      </div>

      {/* 機台結束警示（剩 5 分鐘，導航正下方；與彈幕分離，不可關閉） */}
      <div className="fixed inset-x-0 z-30 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 58px)' }}>
        <div className="relative">
          <EndingBar
            endAt={inheritSchedule(machine, machine.slot_themes).end_at}
            onEnded={() => setMachineEnded(true)}
          />
        </div>
      </div>

      {/* 檔期結束：直接跳提示並引導離開，避免玩家按下去只看到紅色錯誤訊息 */}
      {machineEnded && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center px-8">
          <div className="w-full max-w-[320px] rounded-2xl bg-white dark:bg-neutral-900 p-6 text-center">
            <p className="text-lg font-black text-neutral-900 dark:text-white">機台已結束</p>
            <p className="mt-2 text-sm font-black text-neutral-500">
              感謝挑戰，已獲得的卡牌都在倉庫裡。
            </p>
            <button onClick={() => router.replace('/challenge')}
              className="mt-5 w-full h-11 rounded-xl bg-primary text-white font-black active:scale-[0.98] transition-transform">
              回到機台列表
            </button>
          </div>
        </div>
      )}

      {profileUser && (
        <PlayerProfileCard
          userId={profileUser.id}
          nickname={profileUser.nickname}
          onClose={() => setProfileUser(null)}
        />
      )}

      {/* 閒置警告（最後 15 秒，畫面正中間） */}
      {idleWarnSeconds != null && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 px-5 py-2.5 rounded-full bg-black/80 backdrop-blur-sm text-white text-base font-black pointer-events-none whitespace-nowrap shadow-xl">
          閒置中，<span className="text-orange-500 tabular-nums">{idleWarnSeconds}</span> 秒後將離開機台
        </div>
      )}

      {/* Mobile / tablet */}
      <div className="block lg:hidden pb-8">
        <div>
          <div className="bg-black shadow-sm">
            {renderMachineVisual()}
          </div>
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
              <div className="rounded-3xl border border-neutral-800 overflow-hidden">
                <div className="bg-black">
                  {renderMachineVisual()}
                </div>
                <div className="bg-white dark:bg-neutral-900">
                </div>
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
                    lastResult?.prize.level === '一等獎' ? 'win_god'
                      : lastResult?.prize.level === '二等獎' ? 'win_strong'
                      : 'win'
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

      {/* 直撃確認 modal */}
      <AnimatePresence>
        {showDirectModal && (
          <>
            <motion.div
              key="direct-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowDirectModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            />
            <motion.div
              key="direct-panel"
              initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed z-[61] bg-white dark:bg-[#1a1b1e] flex flex-col max-h-[90vh] overflow-hidden left-0 right-0 bottom-0 rounded-t-2xl border-t border-neutral-200 dark:border-white/10 md:inset-0 md:m-auto md:w-[480px] md:h-fit md:rounded-2xl md:border md:shadow-2xl"
            >
              {/* Header — 同轉蛋購買確認 */}
              <div className="flex justify-between items-center border-b border-neutral-100 dark:border-neutral-800 px-4 py-3 md:px-6 md:py-4">
                <h3 className="font-black text-neutral-900 dark:text-white text-base md:text-xl">直擊確認</h3>
                <button onClick={() => setShowDirectModal(false)}
                  className="p-1 -mr-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-95 transition-transform">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* 商品資訊列 */}
                <div className="flex gap-3 p-3 pb-2 md:p-6 md:pb-4 md:gap-5">
                  <div className="relative bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden shrink-0 shadow-sm border border-neutral-100 dark:border-neutral-700 w-12 h-12 md:w-16 md:h-16">
                    <Image
                      src={machine.slot_themes?.image_url || machine.image_url || '/images/item_defaulet.webp'}
                      alt={machine.name} fill className="object-cover" unoptimized
                    />
                  </div>
                  <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
                    <h3 className="font-black text-neutral-900 dark:text-white leading-tight line-clamp-1 text-base md:text-xl">
                      {machine.slot_themes?.name ?? machine.name}
                    </h3>
                    <div className="flex flex-col justify-end mt-1">
                      <div className="flex items-center gap-1">
                        <div className="relative shrink-0 w-5 h-5 md:w-6 md:h-6">
                          <Image src="/images/gcoin.webp" alt="G" fill className="object-contain" unoptimized />
                        </div>
                        <div className="flex items-baseline gap-0.5">
                          <span className="font-black text-accent-red font-amount leading-none tracking-tighter text-lg md:text-2xl">{directCost.toLocaleString()}</span>
                          <span className="font-black text-neutral-400 leading-none uppercase tracking-widest text-[13px] md:text-[15px]">/直擊</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3 md:px-6 md:pb-6 space-y-2 md:space-y-4">
                  {/* 說明 */}
                  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl flex items-center gap-2 p-3 md:p-6">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="font-bold text-neutral-700 dark:text-neutral-300 text-[13px] md:text-[15px]">跳過保底等待，直接進入 RUSH 模式</span>
                  </div>

                  {/* 金額摘要 */}
                  <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-2 mb-3 p-3 md:p-6 md:space-y-4">
                    <div className="flex justify-between items-center font-bold text-neutral-500 dark:text-neutral-400 text-[13px] md:text-[15px]">
                      <span>商品總額</span>
                      <span className="text-neutral-900 dark:text-neutral-100"><span className="font-amount">{directCost.toLocaleString()}</span> 元</span>
                    </div>
                    <div className="flex justify-between items-center font-bold text-neutral-400 dark:text-neutral-500 text-[13px] md:text-[15px]">
                      <span>代幣餘額</span>
                      <div className="flex flex-col items-end">
                        <span><span className="font-amount">{userTokens.toLocaleString()}</span> 代幣</span>
                        {!isLowForDirect && (
                          <span className="text-xs text-accent-emerald">購買後剩餘: {(userTokens - directCost).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="h-px bg-neutral-200 dark:bg-neutral-700 border-dashed w-full my-1" />
                    <div className="flex justify-between items-end text-base font-black text-accent-red">
                      <span className="text-[13px] md:text-[15px]">實付金額</span>
                      <span className="leading-none text-xl md:text-3xl"><span className="font-amount">{directCost.toLocaleString()}</span> 代幣</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer — 同轉蛋購買確認 */}
              <div className="bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 z-10 flex items-center justify-center mt-auto min-h-16 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:h-24 md:px-6 md:rounded-b-[24px]">
                <button
                  onClick={() => { setShowDirectModal(false); executeDirectSpin(); }}
                  disabled={isLowForDirect || directLoading}
                  className={cn(
                    "w-full rounded-xl font-black shadow-xl transition-all h-[44px] text-base md:h-[52px] md:text-lg",
                    isLowForDirect
                      ? "bg-neutral-300 text-neutral-500 shadow-none cursor-not-allowed"
                      : "bg-accent-red text-white shadow-accent-red/20 hover:bg-accent-red/90 active:scale-[0.98] disabled:opacity-60"
                  )}
                >
                  {directLoading ? '處理中...' : isLowForDirect ? 'G 幣不足，請先儲值' : `確認支付 ${directCost.toLocaleString()} 代幣`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 獎品結果 — RUSH 得獎慶祝：品項圖 + 名稱 + 彩帶，數秒後自動關閉（點擊可提前跳過） */}
      <AnimatePresence>
        {spinState === 'result' && lastResult && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm overflow-hidden"
            onClick={() => closeResult()}
          >
            <ConfettiBurst />
            <motion.div
              initial={{ scale: 0 }}
              animate={{
                scale: [0, 1.18, 0.95, 1.05, 1],
                rotate: [0, -5, 4, -2, 0],
                x: [0, -8, 8, -5, 0],
              }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              className="flex flex-col items-center px-8 pointer-events-none"
            >
              <div className="relative w-60 h-60">
                {lastResult.prize.image_url ? (
                  <Image
                    src={lastResult.prize.image_url} alt={lastResult.prize.name} fill unoptimized
                    className="object-contain drop-shadow-[0_0_32px_rgba(255,210,80,0.85)]"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <Trophy className="w-24 h-24 text-amber-400" />
                  </div>
                )}
              </div>
              <h3
                className="mt-5 text-white font-black text-2xl text-center"
                style={{ textShadow: '0 0 18px rgba(255,200,60,.9), 0 2px 6px rgba(0,0,0,.8)' }}
              >
                {lastResult.prize.name}
              </h3>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PrizeDetailSheet prize={previewPrize} onClose={() => setPreviewPrize(null)} />
    </div>
  );
}
