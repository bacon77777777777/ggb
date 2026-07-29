'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import HeroBanner from '@/components/HeroBanner';
import { BannerSkeleton } from '@/components/Skeletons';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface BetTier { label: string; coins: number }

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
  trigger_rate: number;
  machine_theme: string;
  event_slug: string | null;
  theme_id: number | null;
  machine_number: number | null;
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

  return (
    <AnimatePresence>
      {/* Backdrop — z-[60] 蓋過底部導航 */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
      />
      {/* Panel — z-[61] */}
      <motion.div
        key="panel"
        initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed left-0 right-0 bottom-0 z-[61] bg-white dark:bg-[#1a1b1e] rounded-t-2xl border-t border-neutral-200 dark:border-white/10 flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b border-neutral-100 dark:border-neutral-800 px-4 py-3">
          <h3 className="font-black text-base text-neutral-900 dark:text-white">選擇入場檔次</h3>
          <button onClick={onClose}
            className="p-1 -mr-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:scale-95 transition-transform">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Machine info */}
          <div className="flex gap-3 p-3 pb-2">
            <div className="relative w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden shrink-0 border border-neutral-100 dark:border-neutral-700">
              <Image
                src={machine.image_url || machine.slot_themes?.image_url || '/images/item.png'}
                alt={machine.name} fill className="object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = '/images/item.png'; }}
              />
            </div>
            <div className="flex-1 min-w-0 py-0.5">
              <h3 className="font-black text-base text-neutral-900 dark:text-white leading-tight">
                {machine.name}
              </h3>
              <p className="text-sm text-neutral-400">#{machineNumber}</p>
            </div>
          </div>

          <div className="px-3 pb-3 space-y-2">
            {/* Tier selection */}
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl flex items-center justify-between p-3">
              <span className="text-[13px] font-bold text-neutral-700 dark:text-neutral-300">入場檔次</span>
              <div className="flex items-center gap-2">
                {tiers.map(tier => (
                  <button key={tier.coins} onClick={() => setSelected(tier.coins)}
                    className={cn(
                      'h-9 px-4 rounded-xl border font-black text-sm transition-all active:scale-95',
                      selected === tier.coins
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200'
                    )}
                  >
                    {tier.coins}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost summary */}
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-3 space-y-2">
              <div className="flex justify-between items-center text-[13px] font-bold text-neutral-500 dark:text-neutral-400">
                <span>每次入場費用</span>
                <span className="text-neutral-900 dark:text-neutral-100 font-amount tabular-nums">{selected.toLocaleString()} G幣</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <button onClick={() => onConfirm(selected)}
            className="w-full h-[44px] text-base rounded-xl font-black bg-primary text-white shadow-xl active:scale-[0.98] transition-transform">
            確認入場 {selected.toLocaleString()} G幣
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Machine Card (matches ProductCard) ───────────────────────────────────────

function MachineCard({
  machine, number, onEnter,
}: {
  machine: SlotMachine;
  number: number;
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
          src={machine.image_url || machine.slot_themes?.image_url || '/images/item.png'}
          alt={machine.name} fill className="object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = '/images/item.png'; }}
        />
      </div>

      {/* Content */}
      <div className="p-2 flex flex-col flex-1">
        {/* Name */}
        <p className="text-[14px] font-normal text-neutral-900 dark:text-white line-clamp-2 leading-[1.25]">
          {machine.name} <span className="text-primary font-black">#{number}</span>
        </p>

        {/* Tier switcher — stop propagation so clicking pill doesn't open modal */}
        {tiers.length > 1 && (
          <div className="flex gap-0.5 mt-1.5 overflow-hidden">
            {tiers.map((t, i) => (
              <button key={t.coins}
                onClick={e => { e.stopPropagation(); setTierIdx(i); }}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-black transition-colors whitespace-nowrap flex-shrink-0',
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

        {/* Bottom — border-t like ProductCard */}
        <div className="mt-auto pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400">
          {tiers[tierIdx]?.coins.toLocaleString() ?? machine.price_per_spin} G幣/次
        </div>
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
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/slot/machines')
      .then(r => r.json())
      .then(d => setMachines(d.machines ?? []))
      .catch(console.error)
      .finally(() => setMachinesLoading(false));

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
                  onEnter={() => setEntering(machine)}
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
