'use client';

/**
 * 抽籤販售列表（老闆 2026-08-31）
 *
 * 限量商品不走「先搶先贏」：花積分登記 → 截止 → 到時間統一開獎公布名單 →
 * 中籤才付 G 幣。入口在首頁的懸浮選單。
 *
 * 版面（老闆指定）：頂部輪播 banner → 分類頁籤 → 商品小卡一排一張往下排。
 * 卡片要看得到「當前登記人數、登記幾積分、剩餘多久」。
 *
 * ## 兩層開關
 *
 *   feature_flags.lottery              功能開關頁的三態（開／維護／關）
 *   platform_settings.lottery_list_enabled  抽籤自己的設定頁總開關
 *
 * 兩個都要開才顯示。保留兩個是因為前者是「跟其他玩法一起管」、後者是
 * 「這個功能自己的開關」—— 出事時第一個被找的是功能開關頁。
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import HeroBanner from '@/components/HeroBanner';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import { createClient } from '@/lib/supabase/client';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { asset } from '@/lib/asset';
import { phaseOf, phaseMeta, countdownText, type LotteryEventRow } from '@/lib/lottery';

const TABS = [
  { key: 'all',          label: '全部' },
  { key: 'registering',  label: '登記中' },
  { key: 'upcoming',     label: '即將開始' },
  { key: 'pending_draw', label: '待開獎' },
  { key: 'drawn',        label: '已開獎' },
] as const;

export default function LotteryListPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const { states: flagStates, isLoading: isFlagsLoading } = useFeatureFlags();

  const [events, setEvents] = useState<LotteryEventRow[]>([]);
  const [banners, setBanners] = useState<{ id: string; image: string; link: string }[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [isLoading, setIsLoading] = useState(true);
  /* 每秒重畫一次倒數。放 state 而不是各卡片自己開 timer —— 一頁十張卡就十個 timer */
  const [, setTick] = useState(0);

  const flag = flagStates.lottery ?? 'on';

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: rows }, { data: bannerRows }] = await Promise.all([
          supabase
            .from('lottery_events')
            .select('*, product:products(id, name, image_url, type, price)')
            .eq('status', 'published')
            .order('sort_order', { ascending: false })
            .order('register_end_at', { ascending: true }),
          supabase
            .from('banners')
            .select('*')
            .eq('page', 'lottery')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        ]);

        const list = (rows ?? []) as LotteryEventRow[];
        setEvents(list);
        setBanners((bannerRows ?? []).map(b => ({
          id: String(b.id), image: b.image_url, link: b.link_url || '#',
        })));

        /*
         * 登記人數。RLS 只讓玩家讀自己的 lottery_entries，所以這裡不能直接 count ——
         * 走 SECURITY DEFINER 的 RPC 拿全站數字（只回總數，不回是誰）。
         * 檔期本身若設定不公開人數，卡片上會蓋掉這個值（見下方 render）。
         */
        if (list.length) {
          const { data: c } = await supabase.rpc('get_lottery_entry_counts', {
            p_event_ids: list.map(e => e.id),
          });
          const map: Record<number, number> = {};
          for (const r of (c ?? []) as { event_id: number; entries: number }[]) map[r.event_id] = r.entries;
          setCounts(map);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [supabase]);

  const filtered = useMemo(() => {
    const withPhase = events.map(e => ({ e, phase: phaseOf(e) }));
    return tab === 'all' ? withPhase : withPhase.filter(x => x.phase === tab);
  }, [events, tab]);

  // 關閉：整頁不存在（不該留一個點進去看到「已關閉」的入口）
  if (!isFlagsLoading && flag === 'off') {
    router.replace('/');
    return null;
  }

  if (isLoading || isFlagsLoading) return <ProductLoadingScreen />;

  return (
    <div className="min-h-screen bg-neutral-50 pb-24 dark:bg-neutral-950"
         style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}>

      {banners.length > 0 && (
        <section><HeroBanner banners={banners} /></section>
      )}

      {/* 維護中：照常列出，但每張卡的登記都停用（見內頁）。這裡先講清楚為什麼點不動 */}
      {flag === 'maintenance' && (
        <div className="mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-700">
          抽籤販售維護中，暫時無法登記，稍後再回來看看。
        </div>
      )}

      <div className="sticky top-[calc(57px+env(safe-area-inset-top))] z-30 border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex gap-1 overflow-x-auto px-3 py-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-black transition-colors ${
                tab === t.key
                  ? 'bg-primary text-white'
                  : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-3 pt-3">
        {filtered.length === 0 && (
          <div className="py-20 text-center text-[13px] font-bold text-neutral-400">
            {tab === 'all' ? '目前沒有進行中的抽籤' : '這個階段沒有檔期'}
          </div>
        )}

        {filtered.map(({ e, phase }) => {
          const meta = phaseMeta(phase);
          const img = e.cover_image_url || e.product?.image_url || asset('/images/banner_defaulet.png');
          const entries = counts[e.id] ?? 0;
          return (
            <Link
              key={e.id}
              href={`/lottery/${e.id}`}
              className="block overflow-hidden rounded-2xl bg-white shadow-card transition-transform active:scale-[0.99] dark:bg-neutral-900"
            >
              {/* 一排一張（老闆指定），所以圖可以放大、資訊排在下面而不是擠在右側 */}
              <div className="relative aspect-[16/9] bg-neutral-100 dark:bg-neutral-800">
                <Image src={img} alt={e.title || e.product?.name || ''} fill className="object-cover" unoptimized />
                <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-black text-white ${meta.cls}`}>
                  {meta.label}
                </span>
              </div>

              <div className="space-y-2 p-3.5">
                <h3 className="truncate text-[15px] font-black text-neutral-900 dark:text-neutral-50">
                  {e.title || e.product?.name}
                </h3>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-bold">
                  {/* 登記人數：檔期設定不公開時只講名額 —— 「只有 3 人登記」會勸退後面的人 */}
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {e.show_entry_count
                      ? <>已有 <b className="text-primary">{entries.toLocaleString()}</b> 人登記</>
                      : <>限量 <b className="text-primary">{e.winners_count}</b> 名</>}
                  </span>
                  <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                    <Image src={asset('/images/coin.png')} alt="積分" width={14} height={14}
                           className="inline-block h-3.5 w-3.5" unoptimized />
                    {e.entry_points} 積分登記
                  </span>
                </div>

                <div className={`text-[12px] font-black ${meta.urgent ? 'text-accent-red' : 'text-neutral-400'}`}>
                  {countdownText(e, phase)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
