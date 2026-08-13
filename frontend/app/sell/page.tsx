'use client';

import './market.css';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useFeatureGate } from '@/lib/useFeatureGate';
import MarketTabBar, { type MarketTab } from '@/components/sell/MarketTabBar';
import MarketSheet from '@/components/sell/MarketSheet';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';

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
  done_count: number | null;
  avg_ship_minutes: number | null;
  note: string | null;
  phone_verified: boolean;
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

// 品牌專區（照原型 BRANDS）。目前是展示用的固定清單 ——
// 真正要賣這個版位時再改成從 sell_ad_bookings 的供應商檔期讀
const BRANDS = [
  { n: 'BANPRESTO', d: '一番賞總代理' },
  { n: 'POP MART', d: '盒玩品牌' },
  { n: 'TOMY', d: '扭蛋機台' },
  { n: 'Re-ment', d: '食玩微縮' },
];

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

  // 商品詳情走彈層而不是換頁（照原型）：關掉就回到剛才捲到的位置，
  // 逛街動線不會被打斷
  const { user } = useAuth();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<FeedRow | null>(null);
  // 「更多 ›」開列表彈層（原型 moreSheet），不是換頁
  const [more, setMore] = useState<{ title: string; sub: string; list: FeedRow[]; label: string } | null>(null);
  const [isBuying, setIsBuying] = useState(false);

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

  // 官方商品的結帳要填收件資訊、跳綠界，流程太長，仍走獨立頁；
  // C2C 則整條龍都在彈層裡完成（照原型）
  const officialHref = (r: FeedRow) => `/official/${r.id}`;

  /*
   * 專題位與分類首排是**廣告版位**，不是「照分類挑商品」——
   * 誰買了 topic / cat 才會出現在那一列。先前寫成用 category 篩，
   * 結果沒有一番賞商品時整條專題列就消失，跟原型對不起來。
   */
  const adOf = useCallback(
    (slot: string) => rows.filter((r) => (r.ad_slots || []).includes(slot)),
    [rows]
  );
  const topicItems = useMemo(() => adOf('topic').slice(0, 8), [adOf]);
  const catItems = useMemo(() => adOf('cat').slice(0, 8), [adOf]);
  const doneItems = useMemo(() => adOf('done').slice(0, 8), [adOf]);

  const buyC2C = async () => {
    if (!detail) return;
    if (!user?.id) {
      router.push('/login');
      return;
    }
    setIsBuying(true);
    try {
      // 買第一個還有庫存的規格 —— 原型的商品卡就是單一規格的概念
      const items = Array.isArray(detail.items) ? (detail.items as any[]) : [];
      const idx = items.findIndex((x) => (Number(x?.quantity) || 0) > 0);
      const { data, error } = await createClient().rpc('create_sell_order', {
        p_listing_id: detail.id,
        p_item_index: idx < 0 ? 0 : idx,
        p_quantity: 1,
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) {
        showToast(r?.message || '下單失敗', 'plain');
        return;
      }
      showToast('下單成功', 'plain');
      router.push(`/sell-orders/${r.order_id}`);
    } catch (e: any) {
      showToast(e?.message || '下單失敗', 'plain');
    } finally {
      setIsBuying(false);
    }
  };

  const scards = (list: FeedRow[], label: string) =>
    list.map((it) => (
      <button type="button" key={`${label}-${it.id}`} onClick={() => setDetail(it)} className="scard">
        <div className="si" style={{ background: '#F5F5F5' }}>
          <Image src={imgOf(it)} alt={it.title} fill style={{ objectFit: 'cover' }} sizes="104px" />
          <span className="mini">{label}</span>
        </div>
        <div className="st">{it.title}</div>
        <div className="sp">NT${nt(it.price)}</div>
      </button>
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
          {heroItems.map((it, i) => (
            <button
              type="button"
              key={it.id}
              onClick={() => setDetail(it)}
              className={`hslide${i === hero ? ' on' : ''}`}
            >
              <span className="hart" style={{ background: '#F5F5F5' }}>
                <Image src={imgOf(it)} alt={it.title} fill style={{ objectFit: 'cover' }} sizes="100px" />
              </span>
              <span className="htx">
                <h3>{it.title}</h3>
                <p>{isOfficial ? '官方直送 · 48 小時出貨' : `${it.seller_name} · 已售 ${it.sold_count}`}</p>
                <span className="hprice">NT${nt(it.price)}</span>
              </span>
            </button>
          ))}
          <span className="hdots">
            {heroItems.map((_, i) => (
              <i key={i} className={i === hero ? 'on' : ''} />
            ))}
          </span>
        </div>
      )}

      {/* ── 分類（只有 C2C 有；原型的 vOfficial 沒有這一列）── */}
      {!isOfficial && (
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
      )}

      {/* ── 官方頁專屬：新品首發 / 品牌專區 / 熱賣排行（照原型 vOfficial）── */}
      {isOfficial && rows.length > 0 && (
        <>
          <div className="strip">
            <div className="striphd">
              <b>新品首發</b>
              <button
                type="button"
                className="more"
                onClick={() => setMore({ title: '新品首發', sub: '供應商推廣 · 廣告', list: rows, label: '首發' })}
              >
                更多 ›
              </button>
            </div>
            <div className="srow">{scards(rows.slice(0, 8), '首發')}</div>
          </div>

          <div className="strip">
            <div className="striphd">
              <b>品牌專區</b>
            </div>
            <div className="srow">
              {BRANDS.map((b) => (
                <div key={b.n} className="bcard">
                  <span className="bmark">{b.n[0]}</span>
                  <span className="bn">{b.n}</span>
                  <span className="bd">{b.d}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="strip">
            <div className="striphd">
              <b>熱賣排行</b>
              <button
                type="button"
                className="more"
                onClick={() =>
                  setMore({
                    title: '熱賣排行',
                    sub: '官方旗艦店',
                    list: [...rows].sort((a, b) => b.sold_count - a.sold_count),
                    label: '熱賣',
                  })
                }
              >
                更多 ›
              </button>
            </div>
            <div className="srow">
              {[...rows]
                .sort((a, b) => b.sold_count - a.sold_count)
                .slice(0, 8)
                .map((it, i) => (
                  <button type="button" key={`hot-${it.id}`} onClick={() => setDetail(it)} className="scard">
                    <div className="si" style={{ background: '#F5F5F5' }}>
                      <Image src={imgOf(it)} alt={it.title} fill style={{ objectFit: 'cover' }} sizes="104px" />
                      <span className="mini rank">{i + 1}</span>
                    </div>
                    <div className="st">{it.title}</div>
                    <div className="sp">NT${nt(it.price)}</div>
                  </button>
                ))}
            </div>
          </div>
        </>
      )}

      {/* ── 分類首排（選了分類才出現）── */}
      {!isOfficial && catItems.length > 0 && (
        <div className="strip">
          <div className="striphd">
            <b>{seg ? `${CATS.find((c) => c.key === seg)?.label} 分類首排` : '分類首排'}</b>
          </div>
          <div className="srow">{scards(catItems, '推廣')}</div>
        </div>
      )}

      {/* ── 專題 ── */}
      {!isOfficial && topicItems.length > 0 && (
        <div className="strip">
          <div className="striphd">
            <b>本週一番賞精選</b>
            <button
              type="button"
              className="more"
              onClick={() =>
                setMore({ title: '本週一番賞精選', sub: '編輯策展 · 專題位', list: topicItems, label: '專題' })
              }
            >
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
            <button
              type="button"
              key={`${ad ? 'ad' : 'it'}-${r.id}-${idx}`}
              onClick={() => setDetail(r)}
              className={`pcard${ad ? ' ft' : ''}`}
            >
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
            </button>
          ))}
        </div>
      )}

      {!isOfficial && doneItems.length > 0 && (
        <div className="strip">
          <div className="striphd">
            <b>猜你喜歡</b>
          </div>
          <div className="srow">{scards(doneItems, '推薦')}</div>
        </div>
      )}

      {hasMore && !isLoading && (
        <div ref={sentinelRef} className="empty" style={{ padding: '28px 0' }}>
          {isFetchingMore ? '載入中' : '載入更多'}
        </div>
      )}

      <MarketTabBar active={tab} onSelect={setTab} />

      {/* ── 商品詳情彈層（照原型 itemC2C / itemB2C）── */}
      <MarketSheet
        open={!!detail}
        title="商品詳情"
        onClose={() => setDetail(null)}
        footer={
          detail && (
            <div className="abar">
              {isOfficial ? (
                <button
                  type="button"
                  className="buy dark"
                  onClick={() => router.push(officialHref(detail))}
                >
                  刷卡結帳 · NT${nt(detail.price + detail.shipping_fee)}
                </button>
              ) : (
                <button type="button" className="buy" disabled={isBuying} onClick={buyC2C}>
                  {isBuying ? '處理中…' : `立即購買 · NT$${nt(detail.price + detail.shipping_fee)}`}
                </button>
              )}
            </div>
          )
        }
      >
        {detail && (
          <>
            <div className="hero">
              <Image src={imgOf(detail)} alt={detail.title} fill style={{ objectFit: 'cover' }} sizes="100vw" />
            </div>

            <div className={`pricebar${isOfficial ? ' dark' : ''}`}>
              <span className="s">NT$</span>
              <span className="n">{nt(detail.price)}</span>
              <span className="r">
                {detail.shipping_fee ? `運費 ${nt(detail.shipping_fee)}` : '免運費'}
                <br />
                已售 {detail.sold_count} 件
              </span>
            </div>

            <div className="blk">
              <div className="ttl">{detail.title}</div>
            </div>

            <div className="blk">
              <div className="shoprow">
                <span className="dot" style={{ background: '#E5E5E5' }}>
                  {!isOfficial && (
                    <Image
                      src={detail.seller_avatar || '/images/avatar.webp'}
                      alt={detail.seller_name}
                      fill
                      style={{ objectFit: 'cover' }}
                      sizes="34px"
                    />
                  )}
                </span>
                <div style={{ flex: 1 }}>
                  <b>{detail.seller_name}</b>
                  <div style={{ fontSize: '11.5px', color: 'var(--sub)', marginTop: 2 }}>
                    {isOfficial ? '平台自營 · 開立電子發票' : detail.phone_verified ? '已完成手機實名' : '尚未實名'}
                  </div>
                </div>
                {isOfficial ? (
                  <span className="tg tg--off">官方</span>
                ) : (
                  detail.tier_name && (
                    <span
                      className={`lvl${detail.tier_key === 2 ? ' g2' : detail.tier_key === 1 ? ' g1' : ''}`}
                    >
                      {detail.tier_name}
                    </span>
                  )
                )}
              </div>

              {!isOfficial && (
                <div className="mstat">
                  <div>
                    成交率<b>{detail.success_rate ?? 100}%</b>
                  </div>
                  <div>
                    平均出貨<b>{detail.avg_ship_minutes ?? 0} 分</b>
                  </div>
                  <div>
                    完成單數<b>{nt(Number(detail.done_count || 0))}</b>
                  </div>
                </div>
              )}
            </div>

            <div className="blk">
              {isOfficial ? (
                <>
                  <div className="kv">
                    <span>出貨</span>
                    <span>付款後 48 小時內</span>
                  </div>
                  <div className="kv">
                    <span>付款</span>
                    <span>信用卡 / 分期</span>
                  </div>
                  <div className="kv">
                    <span>退換</span>
                    <span>7 天鑑賞期，原路退刷</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="kv">
                    <span>收款方式</span>
                    <span>{payLabel(detail.pay_method) || '賣家尚未設定'}</span>
                  </div>
                  <div className="kv">
                    <span>運送</span>
                    <span>{detail.shipping_fee ? `買家付 ${nt(detail.shipping_fee)}` : '賣家吸收'}</span>
                  </div>
                  <div className="kv">
                    <span>買家保障</span>
                    <span style={{ color: 'var(--red)' }}>賣家保證金 {nt(detail.deposit)}G</span>
                  </div>
                </>
              )}
            </div>

            {detail.note && (
              <div className="blk">
                <div className="secttl">商品說明</div>
                <p className="hint" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {detail.note}
                </p>
              </div>
            )}
          </>
        )}
      </MarketSheet>

      {/* ── 更多列表彈層（照原型 moreSheet）── */}
      <MarketSheet open={!!more} title={more?.title || ''} onClose={() => setMore(null)}>
        {more && (
          <div className="blk first">
            <div className="secttl">{more.sub}</div>
            {more.list.map((it, i) => (
              <button
                key={`more-${it.id}`}
                type="button"
                className="orow"
                style={{ padding: '11px 0', borderBottom: '1px solid var(--line)' }}
                onClick={() => {
                  setMore(null);
                  setDetail(it);
                }}
              >
                <div className="th" style={{ background: '#F5F5F5', position: 'relative', overflow: 'hidden' }}>
                  <Image src={imgOf(it)} alt={it.title} fill style={{ objectFit: 'cover' }} sizes="62px" />
                  <span className={`mini${more.label === '熱賣' ? ' rank' : ''}`}>
                    {more.label === '熱賣' ? i + 1 : more.label}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ptitle">{it.title}</div>
                  <div className="pprice" style={{ marginTop: 4 }}>
                    <i>NT$</i>
                    <b style={{ fontSize: 17 }}>{nt(it.price)}</b>
                    {isOfficial ? (
                      <span className="dep off">官方出貨</span>
                    ) : (
                      <span className="dep">保證金 {nt(it.deposit)}G</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 3 }}>
                    {isOfficial
                      ? `已售 ${nt(it.sold_count)} · ${it.shipping_fee ? `運費 ${nt(it.shipping_fee)}` : '免運費'}`
                      : `${it.seller_name} · ${it.shipping_fee ? `運費 ${nt(it.shipping_fee)}` : '免運費'}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </MarketSheet>
    </div>
  );
}
