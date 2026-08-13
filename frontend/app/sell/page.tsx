'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFeatureGate } from '@/lib/useFeatureGate';
import { cn } from '@/lib/utils';

/*
 * 商城首頁 —— 玩家商城（C2C）與官方商城（B2C）兩個分頁。
 *
 * 資料一律走 `sell_feed` RPC，不在這裡自己拼查詢：一張卡片要顯示
 * 賣家暱稱、等級、保證金、是否為廣告，各自查會變成 4 趟往返，
 * 而保證金要照賣家等級比例算，那個規則放在 DB 才不會跟前台算出兩種答案。
 *
 * 分頁切換不寫進 URL：這頁是逛街動線，切分頁就是換一批貨，
 * 不是「可分享的狀態」，塞進網址只會讓返回鍵變得難以預期。
 */

type FeedRow = {
  id: number;
  title: string;
  price: number;
  shipping_fee: number;
  category: string | null;
  images: string[] | null;
  items: unknown;
  created_at: string;
  sold_count: number;
  seller_id: string;
  seller_name: string;
  seller_avatar: string | null;
  tier_name: string | null;
  tier_key: number | null;
  success_rate: number | null;
  deposit: number;
  is_pro: boolean;
  ad_slots: string[] | null;
};

const PAGE_SIZE = 20;

// 與 platform_settings.sell_category_whitelist 一致；
// 前台多一個「全部」，值為空字串代表不篩
const CATEGORIES = [
  { key: '', label: '全部' },
  { key: '一番賞', label: '一番賞' },
  { key: '盒玩', label: '盒玩' },
  { key: '轉蛋', label: '轉蛋' },
  { key: '卡牌', label: '卡牌' },
  { key: '公仔模型', label: '公仔' },
  { key: '周邊商品', label: '周邊' },
];

const firstImage = (row: FeedRow) => {
  const imgs = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
  if (imgs[0]) return imgs[0];
  const items = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  const fromItem = items.map((x) => String(x?.image || '').trim()).filter(Boolean)[0];
  return fromItem || '/images/item_defaulet.webp';
};

const nt = (n: number) => Math.round(n || 0).toLocaleString('zh-TW');

export default function SellPage() {
  useFeatureGate('sell');

  const router = useRouter();
  const [tab, setTab] = useState<'market' | 'official'>('market');
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 換分頁或換分類 = 換一批貨，已載入的要整批丟掉重來
  useEffect(() => {
    setRows([]);
    setPage(0);
    setHasMore(true);
    setIsLoading(true);
  }, [tab, category]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (page > 0) setIsFetchingMore(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc('sell_feed', {
          p_official: tab === 'official',
          p_category: category || null,
          p_search: null,
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        });
        if (cancelled) return;
        if (error) throw error;

        const list = (data || []) as FeedRow[];
        setRows((prev) => (page === 0 ? list : [...prev, ...list]));
        setHasMore(list.length === PAGE_SIZE);
      } catch (err) {
        if (!cancelled) {
          console.error('sell_feed failed:', err);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsFetchingMore(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, category, page]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || isLoading || isFetchingMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setPage((p) => p + 1);
      },
      { rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isLoading, isFetchingMore]);

  // 輪播吃 hero / b_hero 版位。沒人買廣告就整塊不出現 ——
  // 拿「最新商品」硬湊會讓賣廣告這件事失去意義
  const heroSlot = tab === 'official' ? 'b_hero' : 'hero';
  const heroItems = useMemo(
    () => rows.filter((r) => (r.ad_slots || []).includes(heroSlot)).slice(0, 5),
    [rows, heroSlot]
  );

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 pb-24">
      {/* ── 頂部：搜尋 + 分頁 ── */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-primary to-primary-dark">
        <div className="max-w-7xl mx-auto px-3 pt-3">
          <button
            type="button"
            onClick={() => router.push('/search?focus=1')}
            className="w-full h-9 rounded-full bg-white dark:bg-neutral-900 flex items-center gap-2 pl-3 pr-1"
          >
            <Search className="w-4 h-4 text-neutral-400 shrink-0" />
            <span className="flex-1 text-left text-[13px] font-black text-neutral-400 truncate">
              {tab === 'official' ? '搜尋官方商城商品' : '搜尋一番賞、盒玩、卡牌'}
            </span>
            <span className="shrink-0 h-7 px-3 grid place-items-center rounded-full bg-primary text-white text-[12px] font-black">
              搜尋
            </span>
          </button>

          <div className="flex items-center gap-5 mt-2.5">
            {(
              [
                ['market', '玩家商城'],
                ['official', '官方商城'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'relative pb-2 text-[15px] font-black transition-colors',
                  tab === key ? 'text-white' : 'text-white/60'
                )}
              >
                {label}
                {tab === key && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-[3px] rounded-full bg-white" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* ── 分類 ── */}
        <div className="bg-white dark:bg-neutral-900 px-1 py-3 flex overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c.key || 'all'}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                'flex-1 min-w-[62px] text-[11.5px] font-black transition-colors',
                category === c.key ? 'text-primary' : 'text-neutral-600 dark:text-neutral-300'
              )}
            >
              <span
                className={cn(
                  'mx-auto mb-1.5 w-10 h-10 rounded-full grid place-items-center text-[15px]',
                  category === c.key
                    ? 'bg-primary/10 ring-2 ring-primary'
                    : 'bg-neutral-100 dark:bg-neutral-800'
                )}
              >
                {c.label.slice(0, 1)}
              </span>
              {c.label}
            </button>
          ))}
        </div>

        {/* ── 廣告輪播 ── */}
        {heroItems.length > 0 && (
          <div className="mx-2.5 mt-2 rounded-xl overflow-hidden bg-white dark:bg-neutral-900 relative">
            <span className="absolute left-0 top-0 z-10 bg-black/40 text-white text-[8.5px] px-1.5 py-0.5 rounded-br-md">
              廣告
            </span>
            <div className="flex overflow-x-auto snap-x snap-mandatory">
              {heroItems.map((it) => (
                <Link
                  key={it.id}
                  href={`/sell/${it.id}`}
                  className="snap-start shrink-0 w-full flex items-stretch h-[100px]"
                >
                  <span className="relative w-[100px] shrink-0 bg-neutral-100 dark:bg-neutral-800">
                    <Image src={firstImage(it)} alt={it.title} fill className="object-cover" />
                  </span>
                  <span className="flex-1 min-w-0 p-3">
                    <span className="block text-[13px] font-black line-clamp-2 text-neutral-900 dark:text-white">
                      {it.title}
                    </span>
                    <span className="block mt-1 text-[10.5px] font-black text-neutral-400">
                      {it.seller_name} · 已售 {it.sold_count}
                    </span>
                    <span className="block mt-0.5 text-[17px] font-black text-primary">
                      NT${nt(it.price)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── 瀑布流 ── */}
        {isLoading ? (
          <div className="py-24 text-center text-[13px] font-black text-neutral-400">載入中</div>
        ) : rows.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[13px] font-black text-neutral-400">
              {tab === 'official' ? '官方商城還沒有商品' : '目前沒有商品'}
            </p>
            {tab === 'market' && (
              <Link
                href="/sell/new"
                className="inline-block mt-3 px-4 py-2 rounded-full bg-primary text-white text-[13px] font-black"
              >
                來當第一個賣家
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 px-2.5 pt-2">
            {rows.map((r) => {
              const isAd = (r.ad_slots || []).length > 0;
              return (
                <Link
                  key={r.id}
                  href={`/sell/${r.id}`}
                  className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden flex flex-col active:opacity-85"
                >
                  {/* overflow-hidden 是必要的：圖片 404 時瀏覽器會改顯示 alt 文字，
                      沒有裁切就會撐破整張卡片的版面 */}
                  <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    <Image src={firstImage(r)} alt={r.title} fill className="object-cover" />
                    <span
                      className={cn(
                        'absolute left-0 top-0 text-white text-[10px] font-black px-1.5 py-0.5 rounded-br-lg',
                        tab === 'official' ? 'bg-neutral-900' : 'bg-primary'
                      )}
                    >
                      {tab === 'official' ? '官方' : '玩家'}
                    </span>
                    {isAd && (
                      <span className="absolute right-0 top-0 bg-black/40 text-white text-[8.5px] px-1.5 py-0.5 rounded-bl-md">
                        廣告
                      </span>
                    )}
                  </div>

                  <div className="p-2">
                    <p className="text-[12.5px] font-black leading-snug line-clamp-2 text-neutral-900 dark:text-white">
                      {r.title}
                    </p>

                    <div className="mt-1.5 flex items-baseline gap-1">
                      <span className="text-[10px] font-black text-primary">NT$</span>
                      <span className="text-[17px] font-black text-primary leading-none">
                        {nt(r.price)}
                      </span>
                      <span className="ml-auto text-[10px] font-black text-neutral-400">
                        {r.shipping_fee ? `運費 ${r.shipping_fee}` : '免運'}
                      </span>
                    </div>

                    {tab === 'official' ? (
                      <p className="mt-1.5 text-[10.5px] font-black text-neutral-400">
                        官方出貨 · 已售 {r.sold_count}
                      </p>
                    ) : (
                      <>
                        <div className="mt-1.5 flex items-center gap-1 min-w-0">
                          <span className="relative w-4 h-4 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 shrink-0">
                            <Image
                              src={r.seller_avatar || '/images/avatar.webp'}
                              alt={r.seller_name}
                              fill
                              className="object-cover"
                            />
                          </span>
                          <span className="text-[10.5px] font-black text-neutral-500 truncate">
                            {r.seller_name}
                          </span>
                          {r.tier_name && (
                            <span
                              className={cn(
                                'shrink-0 text-[9px] font-black px-1 py-px rounded',
                                r.tier_key === 3
                                  ? 'bg-amber-100 text-amber-700'
                                  : r.tier_key === 2
                                    ? 'bg-neutral-200 text-neutral-600'
                                    : 'bg-orange-100 text-orange-600'
                              )}
                            >
                              {r.tier_name}
                            </span>
                          )}
                        </div>
                        {/* 買家最在意「賣家跑了我拿得回什麼」，所以保證金放在卡片上 */}
                        <p className="mt-1 text-[9.5px] font-black text-primary/80">
                          保證金 {nt(r.deposit)}G
                        </p>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {hasMore && !isLoading && (
          <div ref={sentinelRef} className="py-8 text-center text-[12px] font-black text-neutral-400">
            {isFetchingMore ? '載入中' : '載入更多'}
          </div>
        )}
      </div>

      {/*
        上架入口。原本只長在首頁的「商城」分頁上，而懸浮選單的商城圖示是連到
        這一頁，於是從那顆點進來的人永遠找不到地方上架（2026-08-13 發現）。
        官方分頁不放 —— 那是平台自己的貨。
      */}
      {tab === 'market' && (
        <Link
          href="/sell/new"
          aria-label="上架商品"
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 w-12 h-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 grid place-items-center active:scale-95 transition-transform shadow-lg"
        >
          <Plus className="w-6 h-6 stroke-[2]" />
        </Link>
      )}
    </div>
  );
}
