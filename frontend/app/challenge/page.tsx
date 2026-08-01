'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import HeroBanner from '@/components/HeroBanner';
import { BannerSkeleton } from '@/components/Skeletons';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { X, Trophy } from 'lucide-react';

interface BetTier { label: string; coins: number }

interface SlotPoolItem {
  id: number;
  rush_only: boolean;
  min_bet: number | null;
  coin_return: boolean | null;
  return_multiplier: number | null;
  display_name: string | null;
  remaining: number | null;
  product_prizes: { id: number; name: string; image_url: string | null; recycle_value: number } | null;
  slot_prizes: { id: number; name: string; image_url: string | null; recycle_value: number } | null;
}

interface SlotTheme {
  id: number;
  name: string;
  image_url: string | null;
  event_slug: string | null;
  video_rush_entry: string | null;
  video_rush_anticipation: string | null;
  video_rush_win: string | null;
  video_rush_win_strong: string | null;
  video_rush_win_god: string | null;
  video_rush_revival: string | null;
}

interface SlotMachine {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price_per_spin: number;
  sort_order: number;
  bet_tiers: BetTier[];
  floor_spin_count: number;
  floor_counter: number | null;
  trigger_rate: number;
  machine_theme: string;
  event_slug: string | null;
  theme_id: number | null;
  machine_number: number | null;
  rush_state: string | null;
  occupant_id: string | null;
  occupant_active_until: string | null;
  occupancy_expires_at: string | null;
  slot_themes: SlotTheme | null;
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function buildSparkline(seed: number, n = 24): number[] {
  let x = seed * 1103515245 + 12345;
  const pts: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    x = ((x * 1103515245 + 12345) >>> 0);
    v = Math.max(0.08, Math.min(0.92, v + (x / 0xffffffff - 0.5) * 0.28));
    pts.push(v);
  }
  return pts;
}

function Sparkline({ seed, className }: { seed: number; className?: string }) {
  const pts = useMemo(() => buildSparkline(seed), [seed]);
  const W = 200, H = 36;
  const d = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - v * H;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full', className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#sg${seed})`} />
      <path d={d} fill="none" stroke="#f97316" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

// ── Tier Select Modal (matches PurchaseConfirmationModal) ────────────────────

function TierSelectModal({
  machine, machineNumber, onClose, onConfirm,
}: {
  machine: SlotMachine;
  machineNumber: number;
  onClose: () => void;
  onConfirm: (bet: number) => void;
}) {
  const tiers = machine.bet_tiers ?? [];
  const [selected, setSelected] = useState(tiers[0]?.coins ?? 100);
  const [pool, setPool] = useState<SlotPoolItem[]>([]);

  useEffect(() => {
    fetch(`/api/slot/machines/${machine.id}`)
      .then(r => r.json())
      .then(d => setPool(d.pool ?? []))
      .catch(() => {});
  }, [machine.id]);

  const coinReturns  = pool.filter(i => !i.rush_only && i.coin_return);
  // 只顯示當前檔次的 RUSH 品項（min_bet 等於選中金額）
  const physicalItems = pool.filter(i => i.rush_only && i.min_bet === selected);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
      />
      <motion.div
        key="panel"
        initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed left-0 right-0 bottom-0 z-[61] bg-white dark:bg-[#1a1b1e] rounded-t-2xl border-t border-neutral-200 dark:border-white/10 flex flex-col max-h-[75vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b border-neutral-100 dark:border-neutral-800 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden shrink-0 border border-neutral-100 dark:border-neutral-700">
              <Image
                src={machine.image_url || machine.slot_themes?.image_url || '/images/slot/item.png'}
                alt={machine.name} fill className="object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = '/images/item.png'; }}
              />
            </div>
            <h3 className="font-black text-base text-neutral-900 dark:text-white truncate">
              {machine.name} <span className="text-primary">#{machineNumber}</span>
            </h3>
          </div>
          <button onClick={onClose}
            className="p-1 -mr-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-95 transition-transform shrink-0 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-3 pb-2">
            {/* 入場檔次 — single row, no wrap */}
            <p className="text-xs font-black text-neutral-500 uppercase tracking-wider mb-2">入場檔次</p>
            <div className="flex gap-1.5 w-full">
              {tiers.map(tier => (
                <button key={tier.coins} onClick={() => setSelected(tier.coins)}
                  className={cn(
                    'flex-1 min-w-0 h-8 rounded-lg border font-black text-xs transition-all active:scale-95 whitespace-nowrap',
                    selected === tier.coins
                      ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200'
                  )}
                >
                  {tier.coins} G
                </button>
              ))}
            </div>
          </div>

          {/* 獎池總覽 */}
          <div className="px-4 pb-4 mt-2">
            <p className="text-xs font-black text-neutral-500 uppercase tracking-wider mb-3">獎池總覽</p>

            {/* RUSH 獎品 4欄格狀 — 只顯示當前檔次品項 */}
            {physicalItems.length > 0 && (() => {
              const rushValues = physicalItems
                .map(i => i.slot_prizes?.recycle_value ?? i.product_prizes?.recycle_value ?? 0)
                .filter(v => v > 0);
              const rMin = rushValues.length ? Math.min(...rushValues) : 0;
              const rMax = rushValues.length ? Math.max(...rushValues) : 0;
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">RUSH 獎池</p>
                    {rMin > 0 && (
                      <p className="text-sm font-black text-primary tabular-nums">
                        {rMin.toLocaleString()} ～ {rMax.toLocaleString()} G
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mb-4">
                    {physicalItems.map(item => {
                      const prize = item.product_prizes ?? item.slot_prizes;
                      const val = item.slot_prizes?.recycle_value ?? item.product_prizes?.recycle_value ?? 0;
                      return (
                        <div key={item.id} className="flex flex-col items-center">
                          <div className="aspect-square w-full rounded-lg overflow-hidden relative">
                            {prize?.image_url
                              ? <Image src={prize.image_url} alt={prize.name} fill className="object-contain" unoptimized />
                              : <div className="flex items-center justify-center w-full h-full"><Trophy className="w-5 h-5 text-neutral-300" /></div>}
                          </div>
                          <div className="mt-px h-[22px] flex items-center justify-center w-full px-0.5">
                            <p className="text-[9px] text-center text-neutral-600 dark:text-neutral-300 leading-tight line-clamp-2 w-full">{prize?.name}</p>
                          </div>
                          {val > 0 && <p className="text-[9px] font-black text-primary tabular-nums text-center">{val.toLocaleString()} G</p>}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {/* 普通旋轉返還 — 4 欄 grid，同 RUSH 排版 */}
            {coinReturns.length > 0 && (() => {
              const crMults = coinReturns.map(i => i.return_multiplier ?? 0).filter(v => v > 0);
              const crMin = crMults.length ? Math.floor(selected * Math.min(...crMults)) : 0;
              const crMax = crMults.length ? Math.floor(selected * Math.max(...crMults)) : 0;
              return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">普通旋轉返還</p>
                  {crMin > 0 && (
                    <p className="text-sm font-black text-primary tabular-nums">
                      {crMin.toLocaleString()} ～ {crMax.toLocaleString()} G
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {coinReturns.map(item => {
                    const prize = item.slot_prizes;
                    const name = item.display_name ?? prize?.name ?? '返還';
                    const ret = item.return_multiplier != null ? Math.floor(selected * item.return_multiplier) : null;
                    return (
                      <div key={item.id} className="flex flex-col items-center">
                        <div className="aspect-square w-full rounded-lg overflow-hidden relative">
                          <Image
                            src={prize?.image_url ?? '/images/slot/machine/coin.png'}
                            alt={name} fill className="object-contain p-2" unoptimized
                          />
                        </div>
                        <div className="mt-px h-[22px] flex items-center justify-center w-full px-0.5">
                          <p className="text-[9px] text-center text-neutral-600 dark:text-neutral-300 leading-tight line-clamp-2 w-full">{name}</p>
                        </div>
                        {ret != null && <p className="text-[9px] font-black text-primary tabular-nums text-center">{ret.toLocaleString()} G</p>}
                      </div>
                    );
                  })}
                </div>
              </>
              );
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] shrink-0">
          <button onClick={() => onConfirm(selected)}
            className="w-full h-[44px] text-base rounded-xl font-black bg-primary text-white shadow-xl active:scale-[0.98] transition-transform">
            確認入場 {selected.toLocaleString()} G
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Occupancy Overlay ─────────────────────────────────────────────────────────

function OccupancyOverlay({
  occupantId, occupantActiveUntil, occupancyExpiresAt, currentUserId,
}: {
  occupantId: string | null;
  occupantActiveUntil: string | null;
  occupancyExpiresAt: string | null;
  currentUserId: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!occupantId) return null;
  const expiresAt = occupancyExpiresAt ? new Date(occupancyExpiresAt).getTime() : 0;
  if (expiresAt <= now) return null;

  const isMine = occupantId === currentUserId;
  if (isMine) {
    // 自己佔用中（不小心跳出）：顯示離席倒數，歸零即釋出機台
    const mySecondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    return (
      <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
        <span className="text-white font-black text-sm tabular-nums select-none">離席倒數 {mySecondsLeft} 秒</span>
      </div>
    );
  }

  const activeUntil = occupantActiveUntil ? new Date(occupantActiveUntil).getTime() : 0;
  if (activeUntil > now) {
    return (
      <div className="absolute inset-0 bg-black/65 flex items-center justify-center pointer-events-none">
        <span className="text-white font-black text-sm tracking-[0.15em] animate-pulse select-none">使用中</span>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return (
    <div className="absolute inset-0 bg-black/55 flex items-center justify-center pointer-events-none">
      <span className="text-white font-black text-sm select-none">{secondsLeft}秒後可進入</span>
    </div>
  );
}

// ── Machine Card (matches ProductCard) ───────────────────────────────────────

function MachineCard({
  machine, number, currentUserId, onEnter,
}: {
  machine: SlotMachine;
  number: number;
  currentUserId: string | null;
  onEnter: () => void;
}) {
  const tiers = machine.bet_tiers ?? [];
  const [tierIdx, setTierIdx] = useState(0);
  const sparkSeed = machine.id * 7 + machine.sort_order + tierIdx * 13;

  return (
    <div onClick={onEnter}
      className="w-full text-left rounded-[8px] border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden active:scale-[0.98] transition-transform flex flex-col cursor-pointer">
      {/* Image — aspect-square like ProductCard */}
      <div className="aspect-square w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 rounded-t-[8px] relative flex-shrink-0">
        <Image
          src={machine.image_url || machine.slot_themes?.image_url || '/images/slot/item.png'}
          alt={machine.name} fill className="object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = '/images/item.png'; }}
        />
        <OccupancyOverlay
          occupantId={machine.occupant_id}
          occupantActiveUntil={machine.occupant_active_until}
          occupancyExpiresAt={machine.occupancy_expires_at}
          currentUserId={currentUserId}
        />
        {/* 保底轉數進度 */}
        <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] font-black text-white tabular-nums leading-tight">
          {(machine.floor_counter ?? 0).toLocaleString()}/{machine.floor_spin_count.toLocaleString()}
        </div>
      </div>

      {/* Content */}
      <div className="p-2 flex flex-col flex-1">
        {/* Name + Number */}
        <div className="flex items-center justify-between gap-1">
          <p className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-1 leading-[1.25] flex-1 min-w-0">
            {machine.name}
          </p>
          <span className="text-[14px] font-black text-primary shrink-0">#{number}</span>
        </div>

        {/* Tier switcher */}
        {tiers.length > 1 && (
          <div className="flex gap-[3px] mt-1.5 w-full">
            {tiers.map((t, i) => (
              <button key={t.coins}
                onClick={e => { e.stopPropagation(); setTierIdx(i); }}
                style={{ fontSize: '9px' }}
                className={cn(
                  'flex-1 min-w-0 py-0.5 rounded font-black transition-colors whitespace-nowrap',
                  tierIdx === i
                    ? 'bg-neutral-800 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                )}
              >
                {t.coins}
              </button>
            ))}
          </div>
        )}

        {/* Sparkline */}
        <Sparkline seed={sparkSeed} className="h-8 my-1.5" />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ChallengePage() {
  const router = useRouter();
  const supabase = createClient();

  const [machines, setMachines] = useState<SlotMachine[]>([]);
  const [banners, setBanners] = useState<{ id: string; image: string; link: string }[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [activeTheme, setActiveTheme] = useState('全部');
  const [entering, setEntering] = useState<SlotMachine | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // 取得當前使用者 ID（顯示「回到機台」用）
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id ?? null);
    });
  }, []);

  // 機台列表：首次載入 + 每 5 秒輪詢更新佔用狀態
  useEffect(() => {
    let alive = true;
    const fetchMachines = () =>
      fetch('/api/slot/machines')
        .then(r => r.json())
        .then(d => { if (alive) setMachines(d.machines ?? []); })
        .catch(console.error);

    fetchMachines().finally(() => { if (alive) setMachinesLoading(false); });
    const timer = setInterval(fetchMachines, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await supabase.from('banners')
          .select('id, image_url, link_url')
          .eq('is_active', true)
          .eq('page', 'challenge')
          .order('sort_order', { ascending: true });
        setBanners((data ?? []).map(b => ({ id: b.id, image: b.image_url, link: b.link_url || '#' })));
      } catch {}
      setBannersLoading(false);
    })();
  }, []);

  // 用 slot_themes.name 分組（無主題則 fallback machine_theme）
  const themeKey = (m: SlotMachine) => m.slot_themes?.name || m.machine_theme || '其他';

  // Build tabs
  const themes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of machines) counts[themeKey(m)] = (counts[themeKey(m)] ?? 0) + 1;
    return [
      { name: '全部', count: machines.length },
      ...Object.entries(counts).map(([name, count]) => ({ name, count })),
    ];
  }, [machines]);

  const filtered = useMemo(() =>
    activeTheme === '全部'
      ? machines
      : machines.filter(m => themeKey(m) === activeTheme),
    [machines, activeTheme]
  );

  // #N within same theme
  const themeIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    const grouped: Record<string, SlotMachine[]> = {};
    for (const m of machines) {
      const t = themeKey(m);
      grouped[t] = [...(grouped[t] ?? []), m];
    }
    for (const arr of Object.values(grouped)) arr.forEach((m, i) => map.set(m.id, i + 1));
    return map;
  }, [machines]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24">
      <div className="max-w-7xl mx-auto px-0 pt-0">

        {/* Banner — same as home */}
        <section>
          {bannersLoading ? <BannerSkeleton /> : <HeroBanner banners={banners} />}
        </section>

        {/* Sticky tab bar — same style as home secondary tabs */}
        <div className="sticky top-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-1.5 py-2 px-2">
            <div ref={tabsRef} className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide snap-x snap-mandatory">
              <div className="flex items-center gap-1.5">
                {themes.map(t => (
                  <button
                    key={t.name}
                    onClick={() => setActiveTheme(t.name)}
                    className={cn(
                      'snap-start flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors',
                      activeTheme === t.name
                        ? 'bg-primary text-white'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    )}
                  >
                    {t.name} {t.count}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter icon — same SVG as home */}
            <button className="flex-shrink-0 ml-1 p-1.5 rounded-full text-neutral-500 hover:text-primary hover:bg-primary/5 active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4"
                stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16" /><path d="M6 12h12" /><path d="M10 20h4" />
              </svg>
            </button>
          </div>
        </div>

        {/* 2-column machine grid — same grid as home products */}
        <div className="px-2 pt-2">
          {machinesLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="rounded-[8px] border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                  <div className="aspect-square w-full animate-pulse bg-neutral-200 dark:bg-neutral-800 rounded-t-[8px]" />
                  <div className="p-2 space-y-2">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                    <div className="h-8 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-neutral-400 py-16">此分類目前沒有機台</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map(machine => (
                <MachineCard
                  key={machine.id}
                  machine={machine}
                  number={themeIndexMap.get(machine.id) ?? 1}
                  currentUserId={currentUserId}
                  onEnter={() => {
                    const now = Date.now();
                    const expiresAt = machine.occupancy_expires_at
                      ? new Date(machine.occupancy_expires_at).getTime() : 0;
                    const isMine = machine.occupant_id === currentUserId;
                    const isOccupied = machine.occupant_id && expiresAt > now && !isMine;

                    if (isOccupied) return; // 他人使用中或寬限期，不可進入

                    if (isMine && expiresAt > now) {
                      // 我的寬限期 → 直接回到機台
                      router.push(`/challenge/${machine.id}`);
                      return;
                    }

                    setEntering(machine);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tier modal */}
      {entering && (
        <TierSelectModal
          machine={entering}
          machineNumber={themeIndexMap.get(entering.id) ?? 1}
          onClose={() => setEntering(null)}
          onConfirm={bet => {
            const m = entering;
            setEntering(null);
            router.push(`/challenge/${m.id}?bet=${bet}`);
          }}
        />
      )}
    </div>
  );
}
