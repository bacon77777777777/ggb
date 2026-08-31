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
import { phaseOf, phaseMeta, countdownText, ctaText, type LotteryEventRow } from '@/lib/lottery';

/*
 * 分類頁籤照**品牌**分，不照檔期狀態（老闆 2026-08-31）。
 *
 * 狀態不適合當頁籤：玩家逛的時候想的是「有沒有寶可夢的」，不是「有沒有待開獎的」；
 * 而且狀態會自己隨時間變，同一檔今天在這個頁籤、明天跳到另一個，逛到一半東西就不見了。
 *
 * 品牌是 lottery_events.brand（migration 665），後台新建檔期時從既有的挑或直接輸入。
 * 頁籤清單由當前有的檔期算出來 —— 沒有那個品牌的檔期就不該有那個頁籤。
 */
const ALL_TAB = 'all';
const OTHER_BRAND = '其他';

/*
 * 排序（老闆 2026-08-31，頁籤列最右邊的漏斗）。
 *
 *   latest  最新上架 ← 預設
 *   hot     熱門（登記人數多的在前）
 *   ended   只看已結束（已開獎／已取消）
 *
 * 前兩個模式**已結束的一律沉到最後** —— 玩家滾列表是想找還能登記的，
 * 已經開完的檔期擋在前面等於把活的東西推到看不到的地方。
 */
const SORTS = [
  { key: 'latest', label: '最新' },
  { key: 'hot',    label: '熱門' },
  { key: 'ended',  label: '已結束' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

const isEnded = (p: ReturnType<typeof phaseOf>) => p === 'drawn' || p === 'cancelled';

export default function LotteryListPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const { states: flagStates, isLoading: isFlagsLoading } = useFeatureFlags();

  const [events, setEvents] = useState<LotteryEventRow[]>([]);
  const [banners, setBanners] = useState<{ id: string; image: string; link: string }[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [tab, setTab] = useState<string>(ALL_TAB);
  const [sort, setSort] = useState<SortKey>('latest');
  const [sortOpen, setSortOpen] = useState(false);
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

  const brandOf = (e: LotteryEventRow) => (e.brand?.trim() || OTHER_BRAND);

  /* 頁籤＝目前真的有檔期的品牌。「其他」永遠排最後 */
  const tabs = useMemo(() => {
    const brands = [...new Set(events.map(brandOf))];
    brands.sort((a, b) =>
      a === OTHER_BRAND ? 1 : b === OTHER_BRAND ? -1 : a.localeCompare(b, 'zh-Hant'));
    return [ALL_TAB, ...brands];
  }, [events]);

  const filtered = useMemo(() => {
    const withPhase = events.map(e => ({ e, phase: phaseOf(e) }));
    const byBrand = tab === ALL_TAB ? withPhase : withPhase.filter(x => brandOf(x.e) === tab);

    if (sort === 'ended') {
      return byBrand
        .filter(x => isEnded(x.phase))
        .sort((a, b) => +new Date(b.e.drawn_at ?? b.e.draw_at) - +new Date(a.e.drawn_at ?? a.e.draw_at));
    }

    return [...byBrand].sort((a, b) => {
      // 已結束一律沉到最後，不管是哪一種排序
      const ea = isEnded(a.phase) ? 1 : 0;
      const eb = isEnded(b.phase) ? 1 : 0;
      if (ea !== eb) return ea - eb;
      if (sort === 'hot') {
        const d = (counts[b.e.id] ?? 0) - (counts[a.e.id] ?? 0);
        if (d !== 0) return d;
      }
      // 最新上架：新建立的在前。同時也是熱門模式下人數相同時的次要排序
      return +new Date(b.e.created_at) - +new Date(a.e.created_at);
    });
  }, [events, tab, sort, counts]);

  // 關閉：整頁不存在（不該留一個點進去看到「已關閉」的入口）
  if (!isFlagsLoading && flag === 'off') {
    router.replace('/');
    return null;
  }

  if (isLoading || isFlagsLoading) return <ProductLoadingScreen />;

  return (
    <div className="min-h-screen bg-neutral-50 pb-24 dark:bg-neutral-950">

      {/* HeroBanner 自己在沒有資料時會顯示預設圖（components/HeroBanner.tsx 的
          DEFAULT_BANNER），所以這裡**不要**再加 banners.length > 0 的守衛 ——
          加了就變成後台還沒上輪播圖時整塊留白（老闆 2026-08-31 回報） */}
      {(
        <section><HeroBanner banners={banners} /></section>
      )}

      {/* 維護中：照常列出，但每張卡的登記都停用（見內頁）。這裡先講清楚為什麼點不動 */}
      {flag === 'maintenance' && (
        <div className="mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-700">
          抽籤販售維護中，暫時無法登記，稍後再回來看看。
        </div>
      )}

      <div className="sticky top-[calc(57px+env(safe-area-inset-top))] z-30 border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-1 px-3 py-2">
          <div className="flex flex-1 gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-black transition-colors ${
                tab === t
                  ? 'bg-primary text-white'
                  : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
              }`}
            >
              {t === ALL_TAB ? '全部' : t}
            </button>
          ))}
          </div>

          {/*
            排序。圖示與下拉樣式沿用首頁那顆（app/page.tsx 的「排序方式」），不要自創 ——
            同一件事在兩頁長不一樣，玩家要重新學一次（老闆 2026-08-31）。
            這裡只留圖示不放字（老闆指定）：它跟品牌頁籤擠同一列，多兩個字就會把頁籤壓掉。
            點外面關掉：手機沒有 hover，不關會一直卡在畫面上。
          */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setSortOpen(o => !o)}
              aria-label="排序方式"
              className={`flex h-8 w-8 items-center justify-center rounded-xl border bg-white shadow-soft transition-all active:scale-95 dark:bg-neutral-900 ${
                sortOpen
                  ? 'border-primary text-primary'
                  : 'border-neutral-100 text-neutral-600 hover:border-primary hover:text-primary dark:border-neutral-800 dark:text-neutral-400'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16" />
                <path d="M6 12h12" />
                <path d="M10 20h4" />
              </svg>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-44 rounded-lg border border-neutral-100 bg-white py-2 shadow-modal dark:border-neutral-800 dark:bg-neutral-900">
                  {SORTS.map(o => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => { setSort(o.key); setSortOpen(false); }}
                      className={`w-full px-4 py-2.5 text-left text-[13px] font-black transition-colors ${
                        sort === o.key
                          ? 'bg-primary/5 text-primary'
                          : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-3 pt-3">
        {filtered.length === 0 && (
          <div className="py-20 text-center text-[13px] font-bold text-neutral-400">
            {sort === 'ended' ? '沒有已結束的檔期'
              : tab === ALL_TAB ? '目前沒有進行中的抽籤' : `目前沒有${tab}的檔期`}
          </div>
        )}

        {filtered.map(({ e, phase }) => {
          const meta = phaseMeta(phase);
          // 已開獎在內頁是「停用的說明字」，在列表則是邀請你點進去看名單
          const cta = phase === 'drawn' ? { text: '查看中獎名單', disabled: false } : ctaText(phase);
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

                {/*
                  卡片底部的登記鈕（老闆 2026-08-31）。
                  ⚠️ 整張卡本身就是 <Link>，這裡**不能**再放 <button> 或 <a> ——
                  互動元素巢狀在 <a> 裡是無效 HTML，行動裝置上點擊行為也不一致。
                  畫成 <span>，點它等於點到整張卡，去向本來就一樣。
                */}
                <span
                  className={`mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[15px] font-black transition-colors ${
                    cta.disabled
                      ? 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
                      : 'bg-accent-red text-white shadow-lg shadow-accent-red/30'
                  }`}
                >
                  {cta.text}
                  {phase === 'registering' && (
                    <>
                      <Image src={asset('/images/coin.png')} alt="積分" width={16} height={16}
                             className="inline-block h-4 w-4" unoptimized />
                      {e.entry_points}
                    </>
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
