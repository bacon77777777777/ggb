'use client';

import '../sell/market.css';
import './exchange.css';

/**
 * 交易所
 *
 * 玩家把倉庫裡還沒配送、賞等在白名單內的品項掛上來，賣掉換 G 幣。
 * 跟「商城」不同 —— 那個像露天拍賣、收的是真錢、賣什麼都行。
 *
 * ── 2026-09-01 改版（老闆指定）──
 * 原本這頁是 237 行的兩欄 grid：沒有搜尋、沒有篩選、沒有排序、寫死 limit 200、
 * 沒有詳情頁，「我的上架」還要跳去 /profile?tab=market。老闆看過商城之後
 * 指定「複製商城過來，我喜歡商城介面跟 UI 還有 UI 交互」，並定案：
 *   ・整體介面、橘紅頂欄、瀑布卡、彈層手感 → 照搬
 *   ・底部分頁不要五個那麼複雜 → 收成三個（逛街／我的上架／交易紀錄）
 *   ・商品詳情獨立頁 → /market/<id>
 *   ・沿用版型換主題色，保持 G 幣交易 → 見 exchange.css
 *
 * ⚠️ 版型走的是商城那一整套 CSS（app/sell/market.css，全部收斂在 .mk 之下），
 * 這裡只輸出對應的 class。**不要把那些規則複製過來改**，
 * 商城之後調版型這邊就跟著走鐘。配色與交易所特有的東西在 exchange.css。
 *
 * ⚠️ 這頁改成自己的底部分頁列，所以 /market 已從 MobileTabbar 的 mainTabPaths
 * 移除（同商城 /sell）—— 兩排底欄疊在一起沒得看。離開靠頂欄的返回鍵。
 *
 * 所有驗證都在 DB（buy_listing／create_listing／cancel_listing 裡的餘額、
 * 重複購買、買自己的、賞等白名單、價格上下限、狀態競態），前端擋不住直接打 API 的人。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureGate } from '@/lib/useFeatureGate';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useListScrollMemory } from '@/lib/useListScrollMemory';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useSwipeTabs } from '@/lib/useSwipeTabs';
import { useHideOnScroll } from '@/lib/useHideOnScroll';
import { useStatusBarText } from '@/components/native/StatusBarStyle';
import { cn } from '@/lib/utils';
import { asset } from '@/lib/asset';
import PrizeCard from '@/components/market/PrizeCard';
import { Sheet, Dialog, Toast, useMarketToast, useSheetRoute, gnum, ago } from '@/components/market/ui';
import { ChatListSheet, ChatThreadSheet } from '@/components/market/ChatSheets';
import { DealTrend } from '@/components/market/DealTrend';
import {
  fetchFeed, fetchFacets, fetchSettings, fetchMyListings, fetchMyDeals, fetchSellable, fetchRecentDeals,
  createListing, cancelListing, levelAllowed,
  PAGE_SIZE, SORTS,
  type Listing, type MyListing, type Deal, type Sellable, type MarketSettings, type SortKey, type Facets,
  type DealPoint,
} from './data';

export const dynamic = 'force-dynamic';

const FALLBACK = asset('/images/item_defaulet.webp');
const HISTORY_KEY = 'ggb:market:searches';
type Tab = 'market' | 'mine' | 'deals';

export default function MarketPage() {
  useFeatureGate('market');
  // 頂欄是主題色紅、延伸進狀態列 → 動態島那排字要白的（App 內才有作用）；
  // theme-color 取 .hdr 漸層（#ff7b00→#ff2d46）的中間色
  useStatusBarText('white', '#ff5423');
  const router = useRouter();
  const params = useSearchParams();
  const { user, refreshProfile } = useAuth();
  const requireLogin = useRequireLogin();
  const { text: toastText, show: toast } = useMarketToast();
  const { view, open: openSheet, close: closeSheet } = useSheetRoute();
  const restoreCount = useRef(0);

  const tab = ((params?.get('tab') as Tab) || 'market');
  const setTab = (t: Tab) => {
    // 分頁用 replace（不進 history）：返回鍵是拿來關彈層、離開交易所的，
    // 不該變成「一路退回逛過的每個分頁」
    router.replace(t === 'market' ? '/market' : `/market?tab=${t}`, { scroll: false });
  };

  const [settings, setSettings] = useState<MarketSettings | null>(null);

  /* ── 逛街 ── */
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  /* 類別（products.type）與系列（來源商品名）—— 版型照首頁那兩排（老闆 2026-09-01） */
  const [type, setType] = useState('');
  const [series, setSeries] = useState('');
  const [facets, setFacets] = useState<Facets | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>('new');
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  /*
   * 從詳情頁返回時捲回原本看到的位置（老闆 2026-08-30：每一頁都要有）。
   * count 一定要給 —— 這頁是無限捲動，只還原位置的話返回時頁面只剩第一頁那麼高，
   * 捲動位置會被夾在那個高度的底部（restoreCount 在 loadFeed 首次載入時用掉）。
   */
  const rememberScroll = useListScrollMemory('ggb:market:view', {
    count: items.length,
    onRestoreCount: (n) => { restoreCount.current = n; },
  });

  /* ── 我的 ── */
  const [mine, setMine] = useState<MyListing[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [sellable, setSellable] = useState<Sellable[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState<MyListing | null>(null);

  /* ── 聊聊 ── */
  const [chatWith, setChatWith] = useState<{
    listingId: number; otherId: string; otherName: string; otherAvatar: string | null;
    /** 「正在聊這件」商品小卡（老闆 2026-09-02：從列表進對話也要帶） */
    context: { name: string; image: string | null; price: number } | null;
  } | null>(null);

  /* ── 搜尋紀錄 ── */
  const [history, setHistory] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    fetchSettings().then(setSettings);
    fetchFacets().then(setFacets).catch(() => {});
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) setHistory(arr.map(String).slice(0, 10));
    } catch { /* 隱私模式讀不到 localStorage，沒有搜尋紀錄而已 */ }
  }, []);

  const loadFeed = useCallback(async (reset: boolean) => {
    if (reset) { setLoading(true); setDone(false); } else { setLoadingMore(true); }
    try {
      const offset = reset ? 0 : items.length;
      // 返回時一次補回原本已經捲出來的筆數，不然位置接不回去
      const limit = reset && restoreCount.current > PAGE_SIZE ? restoreCount.current : PAGE_SIZE;
      if (reset) restoreCount.current = 0;
      const rows = await fetchFeed({ search, level, type, series, sort, offset, limit });
      setItems(prev => (reset ? rows : [...prev, ...rows]));
      if (rows.length < limit) setDone(true);
    } catch {
      toast('讀取失敗，請稍後再試');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
    // items.length 故意不進相依：它變動的唯一原因就是這支自己載進來的資料
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, level, type, series, sort]);

  useEffect(() => { loadFeed(true); }, [loadFeed]);

  /* 捲到底自動接下一頁。IntersectionObserver 比監聽 scroll 省，
     而且不用自己算「離底部還有多少」 */
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || loading || tab !== 'market') return;
    const io = new IntersectionObserver((es) => {
      if (es[0]?.isIntersecting && !loadingMore) loadFeed(false);
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [done, loading, loadingMore, loadFeed, tab]);

  const loadMine = useCallback(async () => {
    if (!user) { setMine([]); setSellable([]); return; }
    try {
      const [ls, sa] = await Promise.all([fetchMyListings(user.id), fetchSellable(user.id)]);
      setMine(ls);
      setSellable(sa);
    } catch { toast('讀取我的上架失敗'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadDeals = useCallback(async () => {
    if (!user) { setDeals([]); return; }
    try { setDeals(await fetchMyDeals()); } catch { toast('讀取交易紀錄失敗'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => { if (tab === 'mine') loadMine(); }, [tab, loadMine]);
  useEffect(() => { if (tab === 'deals') loadDeals(); }, [tab, loadDeals]);

  /** 倉庫裡賞等過得了白名單的那些。DB 端一樣會擋，這裡只是不要列出按了會失敗的東西 */
  const eligible = useMemo(
    () => (settings ? sellable.filter(s => levelAllowed(s.prizeLevel, settings.allowedLevels)) : []),
    [sellable, settings],
  );

  /* 上架表單：選中品項的同款近 90 天成交（開價的參考，跟詳情頁同一張走勢圖） */
  const [pickDeals, setPickDeals] = useState<DealPoint[]>([]);
  useEffect(() => {
    const s = eligible.find(x => x.drawRecordId === pick);
    if (!s?.productPrizeId) { setPickDeals([]); return; }
    let dead = false;
    fetchRecentDeals(s.productPrizeId)
      .then(rows => { if (!dead) setPickDeals(rows); })
      .catch(() => { if (!dead) setPickDeals([]); });
    return () => { dead = true; };
  }, [pick, eligible]);

  const submitSearch = (q: string) => {
    const v = q.trim();
    setSearch(v);
    if (v) {
      const next = [v, ...history.filter(h => h !== v)].slice(0, 10);
      setHistory(next);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* 存不了就算了 */ }
    }
    closeSheet();
  };

  const doList = async () => {
    if (!requireLogin('登入後就可以把倉庫裡的東西掛上交易所')) return;
    if (!pick) { toast('先選一件要上架的東西'); return; }
    const p = Math.round(Number(priceInput));
    if (!Number.isFinite(p) || p <= 0) { toast('填一個售價'); return; }
    if (settings && (p < settings.minPrice || p > settings.maxPrice)) {
      toast(`售價要在 ${gnum(settings.minPrice)} ~ ${gnum(settings.maxPrice)} G 之間`);
      return;
    }
    setBusy(true);
    const res = await createListing(pick, p);
    setBusy(false);
    if (!res.success) { toast(res.message || '上架失敗'); return; }
    setPick(null);
    setPriceInput('');
    closeSheet();
    toast('已經掛上去了');
    loadMine();
    loadFeed(true);
  };

  const doCancel = async (item: MyListing) => {
    setBusy(true);
    const res = await cancelListing(item.id);
    setBusy(false);
    setConfirmOff(null);
    if (!res.success) { toast(res.message || '下架失敗'); return; }
    toast('已下架，東西回到你的倉庫');
    loadMine();
    loadFeed(true);
    refreshProfile?.();
  };

  /* ── 版面 ── */

  /* 橫式商品小卡（商城的 .heroC 輪播）老闆 2026-09-01 指定先隱藏 —— 版位留著，之後要放什麼再說 */

  /** 目前這個類別底下的系列。切類別時系列跟著換，選中的那個不在新表裡就清掉 */
  const seriesTabs = useMemo(() => facets?.seriesByType[type] ?? [], [facets, type]);
  // 一級頁籤左右滑切換（全站共用手勢，同首頁）
  const typeKeys = useMemo(() => ['', ...(facets?.types.map(t => t.key) ?? [])], [facets]);
  const swipeTypes = useSwipeTabs(typeKeys, type, (t) => { setType(t); setSeries(''); });

  // 下滑收起底部導航（同首頁 MobileTabbar 的 useHideOnScroll）
  const navHidden = useHideOnScroll();

  /* 兩排頁籤吸在 .hdr 下緣（老闆 2026-09-02）。.hdr 高度不能寫死：
     App／PWA 的安全區、字級縮放都會讓它變高，量出來的才貼得準 */
  const hdrRef = useRef<HTMLDivElement>(null);
  const [hdrH, setHdrH] = useState(56);
  useEffect(() => {
    const el = hdrRef.current;
    if (!el) return;
    const sync = () => setHdrH(el.getBoundingClientRect().height);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (series && !seriesTabs.some(x => x.name === series)) setSeries('');
  }, [seriesTabs, series]);

  const goItem = (id: number) => {
    rememberScroll();
    router.push(`/market/${id}`);
  };

  if (loading && items.length === 0 && tab === 'market' && !settings) return <ProductLoadingScreen />;

  return (
    <div className="mk mallroot gx">
      <div className="hdr" ref={hdrRef}>
        <div className="srch">
          <button className="hicon hback" onClick={() => router.push('/')} aria-label="返回">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          {/* 全域 Navbar 在這頁關掉了（兩層頂欄會重複），標題沒人接就沒了 */}
          <span className="htitle">交易所</span>
          <button className="sbox" onClick={() => { setDraft(search); openSheet('search'); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" strokeWidth="2.4">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="sboxt">{search || '搜尋獎項、作品名稱'}</span>
          </button>
          <button className="hicon" onClick={() => openSheet('chats')} aria-label="聊聊">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M20 12a7.5 7.5 0 01-11 6.6L4 20l1.4-4.2A7.5 7.5 0 1120 12z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 左右滑切換一級頁籤（手勢只在逛街分頁有意義） */}
      <div className="screen" {...(tab === 'market' ? swipeTypes : {})}>
        {tab === 'market' && (
          <>
            {/* 頁籤直接用首頁那組元件（老闆 2026-09-02：「複製首頁過來用」——
                之前拿 market.css 的 .ptabs 仿首頁，字距行高都對不上）。
                一級＝ui/Tabs 底線頁籤，二級＝Tailwind 膠囊列，樣式照抄 app/page.tsx */}
            <div
              className="sticky z-20 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 space-y-2"
              style={{ top: hdrH }}
            >
              {/* ⚠️ market.css 的 `.mk button` reset（padding:0/background:none/color:inherit）
                  比 Tailwind 單類別 specificity 高，頁籤與膠囊要用 `!` 修飾符才拿得回主導權 */}
              {(facets?.types.length ?? 0) > 1 && (
                <Tabs value={type} onValueChange={(val) => { setType(val); setSeries(''); }} className="w-full">
                  <TabsList className="bg-transparent dark:bg-transparent px-0 justify-start mb-0 border-b border-neutral-100 dark:border-neutral-800 pb-0">
                    {/* 類別頂多四五個，平均分掉整排寬度（老闆 2026-09-02） */}
                    <TabsTrigger value="" className={cn('!px-3 !py-2 flex-1', type === '' ? '!text-primary' : '!text-neutral-500')}>全部</TabsTrigger>
                    {facets!.types.map(t => (
                      <TabsTrigger key={t.key} value={t.key} className={cn('!px-3 !py-2 flex-1', type === t.key ? '!text-primary' : '!text-neutral-500')}>{t.label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}

              <div className={cn('flex items-center gap-1.5 pb-2 px-2', seriesTabs.length === 0 && 'hidden')}>
                <div className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide snap-x snap-mandatory">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSeries('')}
                      className={cn(
                        'snap-start flex-shrink-0 !px-3 !py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors',
                        series === '' ? '!bg-primary !text-white' : '!bg-neutral-100 !text-neutral-600',
                      )}
                    >全部</button>
                    {seriesTabs.map(sx => (
                      <button
                        key={sx.name}
                        onClick={() => setSeries(sx.name)}
                        className={cn(
                          'snap-start flex-shrink-0 !px-3 !py-1 rounded-full text-[12px] font-black whitespace-nowrap transition-colors',
                          series === sx.name ? '!bg-primary !text-white' : '!bg-neutral-100 !text-neutral-600',
                        )}
                      >{sx.name}</button>
                    ))}
                  </div>
                </div>
                <div className="serisort">
                <button
                  className={cn(
                    'ml-1 mr-1 !p-1.5 rounded-full active:scale-95 transition-all',
                    sort === 'new' && !sortOpen
                      ? '!text-neutral-500 hover:!text-primary hover:!bg-primary/5'
                      : '!text-primary !bg-primary/5',
                  )}
                  aria-pressed={sort !== 'new' || sortOpen}
                  aria-label="排序"
                  onClick={() => setSortOpen(o => !o)}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16" /><path d="M6 12h12" /><path d="M10 20h4" />
                  </svg>
                </button>
                {sortOpen && (
                  <>
                    <div className="sortscrim" onClick={() => setSortOpen(false)} />
                    <div className="sortmenu">
                      {SORTS.map(o => (
                        <button
                          key={o.key}
                          aria-pressed={sort === o.key}
                          onClick={() => { setSort(o.key); setSortOpen(false); }}
                        >{o.label}</button>
                      ))}
                    </div>
                  </>
                )}
                </div>
              </div>
            </div>

            {loading ? (
              <ProductLoadingScreen />
            ) : items.length === 0 ? (
              <div className="empty">
                {search || level || type || series ? '沒有符合條件的上架' : '目前沒有人上架'}
                <div style={{ marginTop: 14 }}>
                  {search || level || type || series ? (
                    <button className="ghostbtn" onClick={() => { setSearch(''); setLevel(''); setType(''); setSeries(''); }}>清除條件</button>
                  ) : (
                    <button className="ghostbtn" onClick={() => setTab('mine')}>去掛一件上來</button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="grid">
                  {items.map(it => <PrizeCard key={it.id} item={it} onClick={() => goItem(it.id)} />)}
                </div>
                <div ref={sentinel} />
                {loadingMore && <div className="empty" style={{ padding: '24px 0' }}>載入中…</div>}
                {done && items.length > PAGE_SIZE && <div className="empty" style={{ padding: '24px 0' }}>已經是全部了</div>}
              </>
            )}
          </>
        )}

        {tab === 'mine' && (
          <div style={{ padding: '8px 10px 0' }}>
            <div className="dban" style={{ margin: '0 0 10px' }}>
              <div>
                <b>倉庫裡有 {eligible.length} 件可以掛上來</b>
                {/* 「開放 XX賞」那行移除（老闆 2026-09-02）；售價區間獨立一行，「G」改 G 幣圖標放金額左邊 */}
                {settings && (
                  <small style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                    售價
                    <Image src={asset('/images/gcoin.webp')} alt="G" width={12} height={12} className="object-contain" unoptimized />
                    {gnum(settings.minPrice)}
                    <span>～</span>
                    <Image src={asset('/images/gcoin.webp')} alt="G" width={12} height={12} className="object-contain" unoptimized />
                    {gnum(settings.maxPrice)}
                  </small>
                )}
              </div>
              <button className="go" onClick={() => { if (requireLogin('登入後就可以上架')) openSheet('sell'); }}>去上架</button>
            </div>

            {!user ? (
              <div className="empty">登入之後才看得到自己的上架</div>
            ) : mine.length === 0 ? (
              <div className="empty">你還沒有上架任何東西</div>
            ) : (
              mine.map(m => (
                /* 點小卡進詳情頁（老闆 2026-09-02）；已售出／下架的會落在詳情頁的「已下架」畫面 */
                <div
                  className="mkrow mine"
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { rememberScroll(); router.push(`/market/${m.id}`); }}
                >
                  <span className="th">
                    <Image src={m.prizeImage || FALLBACK} alt="" width={62} height={62} className="object-contain" unoptimized />
                  </span>
                  <span className="tx">
                    <b>{m.prizeLevel ? `${m.prizeLevel} ` : ''}{m.prizeName}</b>
                    <span>{m.productName}</span>
                    <span>{ago(m.createdAt)}上架 · {m.status === 'active' ? '架上' : m.status === 'sold' ? '已賣出' : '已下架'}</span>
                  </span>
                  {/* 右欄：下架文字鈕靠右上、金額在它下面靠右（老闆 2026-09-02） */}
                  <span className="rt">
                    {m.status === 'active' && (
                      <button className="act danger" onClick={(e) => { e.stopPropagation(); setConfirmOff(m); }}>下架</button>
                    )}
                    <span className={`p${m.status === 'active' ? '' : ' minus'}`}>
                      <Image src={asset('/images/gcoin.webp')} alt="G" width={15} height={15} className="object-contain" unoptimized />
                      {gnum(m.price)}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'deals' && (
          <div style={{ padding: '8px 10px 0' }}>
            {!user ? (
              <div className="empty">登入之後才看得到自己的交易紀錄</div>
            ) : deals.length === 0 ? (
              <div className="empty">還沒有成交紀錄</div>
            ) : (
              /* 帳戶明細式（老闆 2026-09-02）：買進紅 -、賣出綠 +（實收，手續費已扣）；
                 右上角紅／綠標，買進的點了帶去倉庫看品項 */
              deals.map(d => {
                const buy = d.side === 'buy';
                return (
                  <div
                    className="mkrow deal"
                    key={`${d.side}-${d.id}`}
                    role={buy ? 'button' : undefined}
                    tabIndex={buy ? 0 : undefined}
                    style={buy ? { cursor: 'pointer' } : undefined}
                    onClick={buy ? () => router.push('/profile?tab=warehouse') : undefined}
                  >
                    <span className={`dtag${buy ? '' : ' sell'}`}>{buy ? '買進' : '賣出'}</span>
                    <span className="th">
                      <Image src={d.prizeImage || FALLBACK} alt="" width={62} height={62} className="object-contain" unoptimized />
                    </span>
                    <span className="tx">
                      <b>{d.prizeLevel ? `${d.prizeLevel} ` : ''}{d.prizeName}</b>
                      <span>{d.productName}</span>
                      <span>
                        {buy ? `向 ${d.counterparty} 買` : `賣給 ${d.counterparty}`} · {ago(d.createdAt)}
                      </span>
                    </span>
                    <span className="rt">
                      <span className={`amt${buy ? ' out' : ' in'}`}>
                        {buy ? '-' : '+'}
                        <Image src={asset('/images/gcoin.webp')} alt="G" width={15} height={15} className="object-contain" unoptimized />
                        {gnum(buy ? d.price : d.sellerReceive)}
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 下滑瀏覽時收起、往回撥馬上出現（同首頁底部導航） */}
      <nav
        className="tabbar transition-transform duration-300"
        role="tablist"
        style={navHidden ? { transform: 'translateY(100%)' } : undefined}
      >
        <button role="tab" aria-selected={tab === 'market'} onClick={() => setTab('market')}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" />
          </svg>逛街
        </button>
        <button role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1z" /><path d="M4 8l2-4h12l2 4" /><path d="M9.5 12h5" />
          </svg>我的上架
        </button>
        <button role="tab" aria-selected={tab === 'deals'} onClick={() => setTab('deals')}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h13l-2.5-2.5M20 17H7l2.5 2.5" />
          </svg>交易紀錄
        </button>
      </nav>

      {/* ── 搜尋（照商城的搜尋頁：膠囊輸入框＋搜尋紀錄）── */}
      <Sheet open={view === 'search'} title="搜尋" onClose={closeSheet} full>
        <div className="msrchbar">
          <button className="hicon" style={{ color: 'var(--txt)' }} onClick={closeSheet} aria-label="返回">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div className="msrch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" strokeWidth="2.4">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              autoFocus
              value={draft}
              placeholder="搜尋獎項、作品名稱"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitSearch(draft); }}
            />
            <button className="sgo2" onClick={() => submitSearch(draft)}>搜尋</button>
          </div>
        </div>
        <div style={{ padding: '0 14px' }}>
          {history.length > 0 && (
            <>
              <div className="kwsec">搜尋紀錄</div>
              {history.map(h => (
                <div className="mhist" key={h}>
                  <button className="w" onClick={() => submitSearch(h)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                    </svg>
                    {h}
                  </button>
                  <button
                    className="del"
                    onClick={() => {
                      const next = history.filter(x => x !== h);
                      setHistory(next);
                      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* 存不了就算了 */ }
                    }}
                  >刪除</button>
                </div>
              ))}
            </>
          )}
          <div className="kwsec">依賞等找</div>
          {(settings?.allowedLevels ?? []).map(lv => (
            <button className="kwrow" key={lv} onClick={() => { setLevel(lv); setSearch(''); closeSheet(); }}>
              {lv}
            </button>
          ))}
        </div>
      </Sheet>

      {/* ── 上架 ── */}
      <Sheet
        open={view === 'sell'}
        title="上架到交易所"
        onClose={closeSheet}
        footer={
          <button className="buy" onClick={doList} disabled={busy}>
            {busy ? '上架中…' : '確認上架'}
          </button>
        }
      >
        <div className="blk first">
          <div className="secttl">選一件要上架的</div>
          {eligible.length === 0 ? (
            <p className="hint">
              倉庫裡沒有可以上架的東西。只有<b>還沒申請配送</b>、而且賞等在
              {settings ? `「${settings.allowedLevels.join('、')}」` : '白名單'}內的品項可以掛上來
              （抽籤販售的中籤品、還沒到貨的預購不行）。
            </p>
          ) : (
            eligible.map(s => (
              <button
                key={s.drawRecordId}
                className="pickrow"
                aria-pressed={pick === s.drawRecordId}
                onClick={() => setPick(s.drawRecordId)}
              >
                <span className="ck" />
                <span className="th" style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#F2F2F2' }}>
                  <Image src={s.prizeImage || FALLBACK} alt="" width={48} height={48} className="object-contain" unoptimized />
                </span>
                <span className="tx" style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>
                    {s.prizeLevel ? `${s.prizeLevel} ` : ''}{s.prizeName}
                  </b>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--sub)', marginTop: 3 }}>
                    {s.productName}{s.ticketNumber ? ` · #${s.ticketNumber}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        <div className="blk">
          <div className="secttl">開價</div>
          <div className="gin">
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
            />
            <span className="u">G</span>
          </div>
          {settings && (
            <>
              <p className="hint">
                可填 {gnum(settings.minPrice)} ~ {gnum(settings.maxPrice)} G。成交時平台收 {settings.feePercent}% 手續費。
              </p>
              {/* 實際拿到獨立一行（老闆 2026-09-02），開價時最想知道的就是這個數字 */}
              <p className="hint" style={{ marginTop: 4 }}>
                你實際拿到 <b style={{ color: 'var(--red)', fontSize: 14 }}>
                  {gnum(Math.max(0, Math.round(Number(priceInput) || 0) - Math.floor((Number(priceInput) || 0) * settings.feePercent / 100)))} G
                </b>
              </p>
            </>
          )}
          {/* 選中品項的成交趨勢（老闆 2026-09-02：「開價下面多一個商品成交趨勢圖表，跟商品頁面裡的一樣」） */}
          {pick != null && pickDeals.length >= 2 && (
            <>
              <div className="mqhd" style={{ marginTop: 12 }}>同款近 90 天成交</div>
              <DealTrend deals={pickDeals} />
            </>
          )}
          <p className="hint">
            掛上去之後這件東西會鎖在架上，不能申請配送也不能分解 —— 想拿回來就先下架。
          </p>
        </div>
      </Sheet>

      {/* 聊聊：列表 → 單一對話。對話開在同一格網址上（?v=chat），返回鍵一樣關得掉 */}
      <ChatListSheet
        open={view === 'chats'}
        loggedIn={!!user}
        onClose={closeSheet}
        onPick={(c) => {
          setChatWith({
            listingId: c.listingId,
            otherId: c.otherId,
            otherName: c.otherName,
            otherAvatar: c.otherAvatar,
            context: { name: c.prizeName, image: c.prizeImage, price: c.price },
          });
          openSheet('chat');
        }}
      />
      <ChatThreadSheet
        open={view === 'chat' && !!chatWith}
        loggedIn={!!user}
        listingId={chatWith?.listingId ?? null}
        otherId={chatWith?.otherId ?? null}
        otherName={chatWith?.otherName ?? ''}
        otherAvatar={chatWith?.otherAvatar ?? null}
        context={chatWith?.context ?? null}
        onClose={closeSheet}
      />

      <Dialog
        open={!!confirmOff}
        title="確定要下架嗎？"
        desc={confirmOff ? `${confirmOff.prizeName} 會回到你的倉庫，之後可以再上架、申請配送或分解。` : ''}
        confirmText="確定下架"
        busy={busy}
        onCancel={() => setConfirmOff(null)}
        onConfirm={() => confirmOff && doCancel(confirmOff)}
      />

      <Toast text={toastText} />
    </div>
  );
}
