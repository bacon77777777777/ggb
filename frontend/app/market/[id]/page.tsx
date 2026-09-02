'use client';

import '../../sell/market.css';
import '../exchange.css';

/**
 * 交易所商品詳情 —— 獨立頁（/market/<id>）
 *
 * 老闆 2026-09-01：「商品詳情直接複製商城商品詳情頁面，商品詳情要獨立頁」。
 * 版型照 app/sell/proto/mall.ts 的 itemC2CHTML：
 *   浮動返回／分享 → 主圖 → 漸層價格條 → 標題 → 賣家列＋三格數字 → 規格表 → 底部操作列。
 *
 * 商城那三格數字是「成交率／平均出貨／完成單數」（那是 C2C 寄送的信任指標）。
 * 交易所沒有出貨這件事 —— 買到直接進倉庫 —— 所以換成**同款近 90 天成交行情**
 * （最近成交／平均／筆數）。那才是這裡真正缺的資訊：沒有行情，賣家亂開價、
 * 買家不知道貴不貴，兩邊都不敢動。行情走 public_marketplace_price_stats（migration 670）。
 *
 * 網址帶編號所以分享得出去，og:title / og:image 在 layout.tsx 的 server 端補。
 */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureGate } from '@/lib/useFeatureGate';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { ProductLoadingScreen } from '@/components/ui/ProductLoadingScreen';
import { asset } from '@/lib/asset';
import { Toast, useMarketToast, useSheetRoute, gnum, hue, ago } from '@/components/market/ui';
import { HoldToConfirmButton } from '@/components/ui/HoldToConfirmButton';
import { ChatThreadSheet } from '@/components/market/ChatSheets';
import { GradeBadge } from '@/components/ui/GradeBadge';
import {
  fetchListing, fetchPriceStats, fetchRecentDeals, fetchSellerOthers, fetchSettings, buyListing,
  type Listing, type PriceStats, type MarketSettings, type DealPoint,
} from '../data';

export const dynamic = 'force-dynamic';

const FALLBACK = asset('/images/item_defaulet.webp');

export default function MarketItemPage() {
  useFeatureGate('market');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const requireLogin = useRequireLogin();
  const { text: toastText, show: toast } = useMarketToast();
  const { view, open: openSheet, close: closeSheet } = useSheetRoute();

  const id = Number(params?.id);
  const [item, setItem] = useState<Listing | null>(null);
  const [stats, setStats] = useState<PriceStats | null>(null);
  const [deals, setDeals] = useState<DealPoint[]>([]);
  const [others, setOthers] = useState<Listing[]>([]);
  const [settings, setSettings] = useState<MarketSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) { setGone(true); setLoading(false); return; }
    setLoading(true);
    try {
      const [row, st] = await Promise.all([fetchListing(id), fetchSettings()]);
      setSettings(st);
      if (!row) { setGone(true); return; }
      setItem(row);
      // 行情與賣家其他上架不擋畫面：主體先出來，這兩塊晚一點補上
      fetchPriceStats(row.productPrizeId).then(setStats).catch(() => {});
      fetchRecentDeals(row.productPrizeId).then(setDeals).catch(() => {});
      fetchSellerOthers(row.sellerId, row.id).then(setOthers).catch(() => {});
    } catch {
      setGone(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/market');
  };

  const share = async () => {
    const url = `${location.origin}/market/${id}`;
    const title = item ? `【吉吉比交易所】${item.prizeName}` : '吉吉比交易所';
    const mobile = /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && matchMedia('(pointer: coarse)').matches;
    try {
      if (mobile && navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast('連結已複製');
    } catch { /* 使用者取消分享，不處理 */ }
  };

  const isMine = !!user && !!item && user.id === item.sellerId;
  const balance = user?.tokens ?? 0;
  const notEnough = !!item && balance < item.price;

  const doBuy = async () => {
    if (!item) return;
    setBusy(true);
    const res = await buyListing(item.id);
    setBusy(false);
    if (!res.success) {
      toast(res.message || '購買失敗');
      // 失敗多半是被別人先買走或賣家下架了，重讀一次讓畫面對上現況
      load();
      return;
    }
    toast('買到了！東西已經進倉庫');
    refreshProfile?.();
    router.push('/market?tab=deals');
  };

  /** 按住集氣走完才成交（老闆 2026-09-02，同商城／配送彈窗）：集氣本身就是確認，不再另開彈窗 */
  const onBuyHold = () => {
    if (!item) return;
    if (!requireLogin('登入後就可以在交易所買東西')) return;
    if (isMine) return;
    doBuy();
  };

  if (loading) return <ProductLoadingScreen />;

  if (gone || !item) {
    return (
      <div className="mk mallroot gx mk--item">
        <div className="floatnav">
          <button className="floatback" onClick={goBack} aria-label="返回">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
        <div className="screen">
          <div className="empty" style={{ paddingTop: '38vh' }}>
            這件已經被買走或下架了
            <div style={{ marginTop: 14 }}>
              <button className="ghostbtn" onClick={() => router.push('/market')}>回交易所逛逛</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mk mallroot gx mk--item">
      <div className="floatnav">
        <button className="floatback" onClick={goBack} aria-label="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button className="floatshare" onClick={share} aria-label="分享">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" />
            <path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3" />
          </svg>
        </button>
      </div>

      <div className="screen">
        <div className="hero" style={{ position: 'relative' }}>
          <Image src={item.prizeImage || FALLBACK} alt={item.prizeName} fill sizes="100vw" className="object-contain" unoptimized priority />
        </div>

        <div className="pricebar">
          <Image src={asset('/images/gcoin.webp')} alt="G" width={24} height={24} className="gc object-contain" unoptimized />
          <span className="n">{gnum(item.price)}</span>
          <span className="r">{ago(item.createdAt)}上架</span>
        </div>

        <div className="blk">
          <div className="ttl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0 }}>{item.prizeName}</span>
            <GradeBadge grade={item.prizeLevel} />
          </div>
        </div>

        <div className="blk">
          <div className="shoprow">
            <span className="uav" style={{ background: hue(item.sellerName), position: 'relative', display: 'block' }}>
              {item.sellerAvatar && (
                <Image src={item.sellerAvatar} alt="" fill sizes="44px" className="object-cover" unoptimized />
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="unm"><b>{item.sellerName}</b>{isMine && <span className="lvl">你自己</span>}</div>
              <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 2 }}>
                {others.length > 0 ? `另外還掛了 ${others.length} 件` : '目前只掛了這一件'}
              </div>
            </div>
            {/* 自己的東西沒有人可以聊 */}
            {!isMine && (
              <button
                className="ghostbtn"
                onClick={() => { if (requireLogin('登入後就可以跟賣家聊聊')) openSheet('chat'); }}
              >聊聊</button>
            )}
          </div>
        </div>

        {/* 成交行情獨立一塊（老闆 2026-09-02）：有紀錄給三格數字＋走勢，沒紀錄講清楚價格是賣家開的 */}
        <div className="blk">
          <div className="mqhd">同款近 90 天行情</div>
          {stats ? (
            <>
              <div className="quote mstat">
                <div>最近成交<b>{gnum(stats.lastPrice)}</b></div>
                <div>平均<b>{gnum(stats.avgPrice)}</b></div>
                <div>成交筆數<b>{gnum(stats.dealCount)}</b></div>
              </div>
              <DealTrend deals={deals} />
            </>
          ) : (
            <p className="hint">這個品項還沒有成交紀錄，價格由賣家自己開 —— 買之前先想想值不值。</p>
          )}
        </div>

        <div className="blk">
          <div className="kv"><span>來源商品</span><span>{item.productName || '—'}</span></div>
          <div className="kv"><span>賞等</span><span>{item.prizeLevel || '—'}</span></div>
          {item.prizeTotal ? (
            <div className="kv"><span>這個品項全站共</span><span>{gnum(item.prizeTotal)} 件</span></div>
          ) : null}
          <div className="kv"><span>交付方式</span><span>買到直接進你的倉庫</span></div>
          <div className="kv"><span>付款</span><span>G 幣，按下去立刻扣</span></div>
          <div className="kv">
            <span>手續費</span>
            <span>{settings ? `賣家負擔 ${settings.feePercent}%，買家付標價` : '賣家負擔'}</span>
          </div>
        </div>

        <div className="blk">
          <p className="hint">
            交易所賣的是別人抽到的實體獎品，買到之後<b>東西直接進你的倉庫</b>，
            可以申請配送、分解或再掛回來賣。<b>交易完成不能反悔</b>，也沒有鑑賞期。
          </p>
        </div>

        {others.length > 0 && (
          <div className="strip">
            <div className="striphd"><b>這位賣家的其他上架</b></div>
            <div className="srow">
              {others.map(o => (
                <button className="scard" key={o.id} onClick={() => router.replace(`/market/${o.id}`)}>
                  <div className="si" style={{ background: '#F7F7F7', position: 'relative' }}>
                    <Image src={o.prizeImage || FALLBACK} alt="" fill sizes="104px" className="object-contain" unoptimized />
                  </div>
                  <div className="st">{o.prizeName}</div>
                  <div className="sp">{gnum(o.price)}<span className="u">G</span></div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="abar">
          {/* 餘額與聊聊移除（老闆 2026-09-02）：底欄只留購買鍵。
              聊聊入口還在賣家列（shoprow）那顆，沒有失去功能 */}
          {isMine ? (
            <button className="buy" disabled style={{ background: '#DDD', color: '#888' }}>你上架的</button>
          ) : notEnough ? (
            <button className="buy" onClick={() => toast('G 幣不足，先去儲值')}>G 幣不足</button>
          ) : (
            <HoldToConfirmButton
              className="buy"
              onConfirm={onBuyHold}
              onAbort={() => toast('請按住直到光條走完')}
              disabled={busy}
            >
              {busy ? '處理中…' : (
                <>
                  按住購買
                  <Image src={asset('/images/gcoin.webp')} alt="G" width={18} height={18} className="w-[18px] h-[18px] object-contain" unoptimized />
                  {gnum(item.price)}
                </>
              )}
            </HoldToConfirmButton>
          )}
        </div>
      </div>

      <ChatThreadSheet
        open={view === 'chat'}
        loggedIn={!!user}
        listingId={item.id}
        otherId={item.sellerId}
        otherName={item.sellerName}
        otherAvatar={item.sellerAvatar}
        context={{ name: item.prizeName, image: item.prizeImage, price: item.price }}
        onClose={closeSheet}
      />

      <Toast text={toastText} />
    </div>
  );
}

/**
 * 近 90 天成交走勢 —— 單一序列迷你折線。
 *
 * 成交是逐筆的稀疏事件（一款十來筆），不畫日 K 也不補零：X 軸照成交時間、
 * 每筆一個點，線只是把點串起來。最新一筆給實心點＋直接標價，其餘只在
 * 按住／滑過時浮出「日期＋價格」。圖下方列最近三筆當文字對照（表格視圖）。
 * 顏色只有主題紅一條線，文字一律用文字色（dataviz：text wears text tokens）。
 */
function DealTrend({ deals }: { deals: DealPoint[] }) {
  const [sel, setSel] = useState<number | null>(null);
  // 成交列表預設只露兩筆半（限高＋底部淡出），展開才全列（老闆 2026-09-02）
  const [rowsOpen, setRowsOpen] = useState(false);
  if (deals.length < 2) return null;

  const W = 320, H = 88, T = 18, R = 14, B = 20, L = 10;
  const ts = deals.map(d => new Date(d.createdAt).getTime());
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const span = Math.max(1, t1 - t0);
  const lo = Math.min(...deals.map(d => d.price));
  const hi = Math.max(...deals.map(d => d.price));
  const range = Math.max(1, hi - lo);
  const px = (i: number) => L + ((ts[i] - t0) / span) * (W - L - R);
  const py = (p: number) => T + (1 - (p - lo) / range) * (H - T - B);
  const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

  const line = deals.map((d, i) => `${px(i).toFixed(1)},${py(d.price).toFixed(1)}`).join(' ');
  const last = deals.length - 1;
  const cur = sel ?? last;

  /** 按住／滑過找最近的點 */
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let best = 0, dist = Infinity;
    deals.forEach((_, i) => { const dd = Math.abs(px(i) - x); if (dd < dist) { dist = dd; best = i; } });
    setSel(best);
  };

  return (
    <div className="mqtrend">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        onPointerDown={pick}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') pick(e); }}
        onPointerLeave={() => setSel(null)}
      >
        <polyline points={`${line} ${px(last).toFixed(1)},${H - B} ${px(0).toFixed(1)},${H - B}`}
          fill="var(--red)" fillOpacity=".06" stroke="none" />
        <polyline points={line} fill="none" stroke="var(--red)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        {deals.map((d, i) => (
          <circle key={i} cx={px(i)} cy={py(d.price)}
            r={i === cur ? 3.5 : 2.5}
            fill={i === cur ? 'var(--red)' : '#fff'}
            stroke="var(--red)" strokeWidth="1.5" />
        ))}
        {/* 目前選到（預設最新一筆）的直接標籤：日期＋價格 */}
        <text x={Math.min(Math.max(px(cur), 44), W - 44)} y={12} textAnchor="middle"
          fontSize="11" fontWeight="700" fill="var(--txt)">
          {md(deals[cur].createdAt)}・{gnum(deals[cur].price)} G
        </text>
        <text x={L} y={H - 6} fontSize="9.5" fill="var(--sub)">{md(deals[0].createdAt)}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="9.5" fill="var(--sub)">{md(deals[last].createdAt)}</text>
      </svg>
      <div className={`mqrows${rowsOpen ? '' : ' mqrows--clip'}`}>
        {[...deals].reverse().map((d, i) => (
          <div key={i}><span>{md(d.createdAt)} 成交</span><b>{gnum(d.price)} G</b></div>
        ))}
      </div>
      {deals.length > 2 && (
        <button className="mqmore" onClick={() => setRowsOpen(o => !o)}>
          {rowsOpen ? '收起' : `展開全部 ${deals.length} 筆`}
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ width: 12, height: 12, transform: rowsOpen ? 'rotate(180deg)' : undefined }}
          ><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}
    </div>
  );
}
