'use client';

import './market.css';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useFeatureGate } from '@/lib/useFeatureGate';
import MarketTabBar, { type MarketTab } from '@/components/sell/MarketTabBar';

/*
 * 商城首頁 —— 版型直接沿用老闆提供的原型
 * （docs/prototypes/ggb-market-taobao_1.html），class 名稱與結構照抄，
 * 樣式集中在 ./market.css。這裡只負責把真實資料接上去。
 *
 * 資料一律走 `sell_feed` RPC：一張卡要顯示賣家暱稱、等級、保證金、收款方式、
 * 是否為廣告，各自查會變成好幾趟往返；而保證金要依賣家等級比例算，
 * 那個規則放在 DB 才不會跟前台算出兩種答案。
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
  pay_method: string | null;
  ad_slots: string[] | null;
};

const PAGE_SIZE = 20;

// 圖示沿用原型 ICONS 的路徑；類別本身用站上的白名單
const ICONS: Record<string, React.ReactNode> = {
  all: <path d="M4 6h16M4 12h16M4 18h16" />,
  ichiban: <path d="M5 4h14v16l-7-3-7 3z" />,
  box: (
    <>
      <path d="M12 3l8 3.5v11L12 21l-8-3.5v-11z" />
      <path d="M4 6.5l8 3.5 8-3.5M12 10v11" />
    </>
  ),
  cap: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
    </>
  ),
  card: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M9 8h6M9 12h4" />
    </>
  ),
  fig: (
    <>
      <circle cx="12" cy="7" r="3.4" />
      <path d="M6 21c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5" />
    </>
  ),
  plush: (
    <>
      <circle cx="12" cy="13" r="6.5" />
      <circle cx="6.5" cy="6.5" r="2.6" />
      <circle cx="17.5" cy="6.5" r="2.6" />
    </>
  ),
};

const CATS: { key: string; label: string; icon: string }[] = [
  { key: '', label: '全部', icon: 'all' },
  { key: '一番賞', label: '一番賞', icon: 'ichiban' },
  { key: '盒玩', label: '盒玩', icon: 'box' },
  { key: '轉蛋', label: '轉蛋', icon: 'cap' },
  { key: '卡牌', label: '卡牌', icon: 'card' },
  { key: '公仔模型', label: '公仔', icon: 'fig' },
  { key: '周邊商品', label: '周邊', icon: 'plush' },
];

const CAT_BG = ['#FFF0E6', '#FFE9EC', '#EAF4FF', '#EAF8F1', '#F3EDFF', '#FFF6E0'];

const nt = (n: number) => Math.round(n || 0).toLocaleString('zh-TW');

const imgOf = (row: FeedRow) => {
  const imgs = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
  if (imgs[0]) return imgs[0];
  const items = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  return items.map((x) => String(x?.image || '').trim()).filter(Boolean)[0] || '/images/item_defaulet.webp';
};

const payLabel = (m: string | null) => (m === 'linepay' ? 'LINE Pay' : m === 'bank' ? '銀行轉帳' : '');

/*
 * 廣告插卡：右欄第一格放一張，之後每 8 格再插一次；
 * 不與相鄰或已出現過的重複。邏輯照原型的 feed()。
 */
function withAds(list: FeedRow[], pool: FeedRow[]): { row: FeedRow; ad: boolean }[] {
  const out: { row: FeedRow; ad: boolean }[] = [];
  const seen: number[] = [];
  let f = 0;
  let prev: FeedRow | null = null;

  const pick = (): FeedRow | null => {
    for (let n = 0; n < pool.length; n++) {
      const c = pool[(f + n) % pool.length];
      if (c !== prev && seen.indexOf(c.id) < 0) {
        f = (f + n + 1) % pool.length;
        return c;
      }
    }
    return null;
  };

  list.forEach((it) => {
    if (pool.length && (out.length === 1 || (out.length > 1 && (out.length - 1) % 8 === 0))) {
      const ad = pick();
      if (ad) {
        out.push({ row: ad, ad: true });
        seen.push(ad.id);
      }
    }
    out.push({ row: it, ad: false });
    prev = it;
  });
  if (out.length === 1 && pool.length) out.push({ row: pool[0], ad: true });
  return out;
}

export default function SellPage() {
  useFeatureGate('sell');

  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<MarketTab>(
    searchParams?.get('tab') === 'official' ? 'official' : 'market'
  );
  const [seg, setSeg] = useState('');
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hero, setHero] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const isOfficial = tab === 'official';

  useEffect(() => {
    setRows([]);
    setPage(0);
    setHasMore(true);
    setIsLoading(true);
    setHero(0);
  }, [tab, seg]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (page > 0) setIsFetchingMore(true);
      try {
        const { data, error } = await createClient().rpc('sell_feed', {
          p_official: isOfficial,
          p_category: seg || null,
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
  }, [isOfficial, seg, page]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || isLoading || isFetchingMore) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) setPage((p) => p + 1);
      },
      { rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isLoading, isFetchingMore]);

  // 廣告池＝有買版位的商品；輪播吃前三張（照原型 pool.slice(0,3)）
  const pool = useMemo(() => rows.filter((r) => (r.ad_slots || []).length > 0), [rows]);
  const heroItems = useMemo(() => pool.slice(0, 3), [pool]);

  // 輪播自動切換，3.6 秒一張（原型 startHero 的間隔）
  useEffect(() => {
    if (heroItems.length < 2) return;
    const t = setInterval(() => setHero((h) => (h + 1) % heroItems.length), 3600);
    return () => clearInterval(t);
  }, [heroItems.length]);

  const feed = useMemo(() => withAds(rows, pool), [rows, pool]);

  const detailHref = (r: FeedRow) => (isOfficial ? `/official/${r.id}` : `/sell/${r.id}`);

  const topicItems = useMemo(
    () => rows.filter((r) => (r.category || '').includes('一番賞') || r.category === '公仔模型').slice(0, 8),
    [rows]
  );
  const segItems = useMemo(() => (seg ? rows.slice(0, 4) : []), [rows, seg]);

  const scards = (list: FeedRow[], label: string) =>
    list.map((it) => (
      <Link key={`${label}-${it.id}`} href={detailHref(it)} className="scard">
        <div className="si" style={{ background: '#F5F5F5' }}>
          <Image src={imgOf(it)} alt={it.title} fill style={{ objectFit: 'cover' }} sizes="104px" />
          <span className="mini">{label}</span>
        </div>
        <div className="st">{it.title}</div>
        <div className="sp">NT${nt(it.price)}</div>
      </Link>
    ));

  return (
    <div className="mk min-h-screen pb-[calc(64px+env(safe-area-inset-bottom))]">
      {/* ── header ── */}
      <div className="hdr sticky top-0 z-40">
        <div className="srch">
          <span className="logo">吉吉比</span>
          <button type="button" className="sbox" onClick={() => router.push('/search?focus=1')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" strokeWidth="2.4">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="sboxt">{isOfficial ? '搜尋官方旗艦店商品' : '搜尋一番賞、盒玩、卡牌'}</span>
            <span className="sgo">搜尋</span>
          </button>
        </div>
      </div>

      {/* ── 輪播（沒人買廣告就不出現，不用最新商品硬湊）── */}
      {heroItems.length > 0 && (
        <div className="heroC">
          <span className="adtag">廣告 · {isOfficial ? '官方頁輪播' : '首頁輪播'}</span>
          {heroItems.map((it, i) => (
            <Link key={it.id} href={detailHref(it)} className={`hslide${i === hero ? ' on' : ''}`}>
              <span className="hart" style={{ background: '#F5F5F5' }}>
                <Image src={imgOf(it)} alt={it.title} fill style={{ objectFit: 'cover' }} sizes="100px" />
              </span>
              <span className="htx">
                <h3>{it.title}</h3>
                <p>
                  {it.seller_name} · 已售 {it.sold_count}
                </p>
                <span className="hprice">NT${nt(it.price)}</span>
              </span>
            </Link>
          ))}
          <span className="hdots">
            {heroItems.map((_, i) => (
              <i key={i} className={i === hero ? 'on' : ''} />
            ))}
          </span>
        </div>
      )}

      {/* ── 分類 ── */}
      <div className="cats">
        {CATS.map((c, i) => (
          <button key={c.key || 'all'} type="button" aria-pressed={seg === c.key} onClick={() => setSeg(c.key)}>
            <span className="ci" style={{ background: CAT_BG[i % CAT_BG.length] }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="1.7" strokeLinecap="round">
                {ICONS[c.icon]}
              </svg>
            </span>
            {c.label}
          </button>
        ))}
      </div>

      {/* ── 分類首排（選了分類才出現）── */}
      {seg && segItems.length > 0 && (
        <div className="strip">
          <span className="adtag">廣告</span>
          <div className="striphd">
            <b>{CATS.find((c) => c.key === seg)?.label} 分類首排</b>
          </div>
          <div className="srow">{scards(segItems, '推廣')}</div>
        </div>
      )}

      {/* ── 專題 ── */}
      {topicItems.length > 0 && (
        <div className="strip">
          <div className="striphd">
            <b>本週精選</b>
            <button type="button" className="more" onClick={() => setSeg('一番賞')}>
              更多 ›
            </button>
          </div>
          <div className="srow">{scards(topicItems, '專題')}</div>
        </div>
      )}

      {/* ── 一鍵上架 ── */}
      {!isOfficial && (
        <Link href="/sell/new" className="dban">
          <div>
            <b>抽到不想要的獎品？</b>
            <small>從倉庫一鍵上架，賣給需要的人</small>
          </div>
          <span className="go">去上架</span>
        </Link>
      )}

      {/* ── 瀑布流 ── */}
      {isLoading ? (
        <div className="empty">載入中</div>
      ) : feed.length === 0 ? (
        <div className="empty">{isOfficial ? '官方旗艦店還沒有商品' : '目前沒有商品'}</div>
      ) : (
        <div className="grid">
          {feed.map(({ row: r, ad }, idx) => (
            <Link key={`${ad ? 'ad' : 'it'}-${r.id}-${idx}`} href={detailHref(r)} className={`pcard${ad ? ' ft' : ''}`}>
              <div className="pimg" style={{ background: '#F5F5F5' }}>
                <Image src={imgOf(r)} alt={r.title} fill style={{ objectFit: 'cover' }} sizes="(max-width:640px) 50vw, 200px" />
                {ad ? (
                  <>
                    <span className="badge ft">精選</span>
                    <span className="adlbl">廣告</span>
                  </>
                ) : (
                  <span className={`badge${isOfficial ? ' off' : ''}`}>{isOfficial ? '官方' : '玩家'}</span>
                )}
              </div>

              <div className="pbody">
                <div className="ptitle">{r.title}</div>

                <div className="pprice">
                  <i>NT$</i>
                  <b>{nt(r.price)}</b>
                  {isOfficial ? (
                    <span className="dep off">官方出貨</span>
                  ) : (
                    <span className="dep">保證金 {nt(r.deposit)}G</span>
                  )}
                </div>

                <div className="pshop">
                  <span className="dot" style={{ background: '#E5E5E5' }}>
                    {!isOfficial && (
                      <Image
                        src={r.seller_avatar || '/images/avatar.webp'}
                        alt={r.seller_name}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="14px"
                      />
                    )}
                  </span>
                  <span className="nm">{r.seller_name}</span>
                  {!isOfficial && r.tier_name && (
                    <span className={`lvl${r.tier_key === 2 ? ' g2' : r.tier_key === 1 ? ' g1' : ''}`}>
                      {r.tier_name}
                    </span>
                  )}
                </div>

                <div className="tags">
                  {isOfficial ? (
                    <>
                      {!r.shipping_fee && <span className="tg tg--off">免運</span>}
                      <span className="tg tg--off">刷卡分期</span>
                      <span className="tg tg--off">可退款</span>
                    </>
                  ) : (
                    <>
                      {!r.shipping_fee && <span className="tg tg--dep">免運</span>}
                      {payLabel(r.pay_method) && <span className="tg tg--pay">{payLabel(r.pay_method)}</span>}
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {hasMore && !isLoading && (
        <div ref={sentinelRef} className="empty" style={{ padding: '28px 0' }}>
          {isFetchingMore ? '載入中' : '載入更多'}
        </div>
      )}

      <MarketTabBar active={tab} onSelect={setTab} />
    </div>
  );
}
