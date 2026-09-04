"use client";

/**
 * 交易所商品頁（桌機版，768 以上）—— 真資料
 *
 * 賣的是「別人抽到的單一品項」，買到直接進倉庫，用 G 幣付款。
 * 資料層在 `app/market/data.ts`（跟手機版共用）。
 *
 * ⚠️ 這頁原本整頁都是 cardx 的 mock：CGC 評級／證書編號／Alt 估值／託管於、
 * 四張同一張的假圖庫、seed 亂數生出來的 7D/30D/1Y 價格曲線、假的物件動態、
 * 假的相似商品、還有一顆會把人導去 KYC 的購買鍵。那些欄位我們的 DB 一個都沒有，
 * 全部拿掉，換成真正有的東西：
 *   ・關鍵資訊 → 賞等／來源商品／全站件數／上架時間
 *   ・價格走勢 → public_marketplace_recent_deals 的近 90 天逐筆成交（7D/30D/90D 是時間窗）
 *   ・物件動態 → 同一份成交紀錄 + 這件的上架時間
 *   ・相似商品 → fetchRelated（同品項 → 同商品 → 同類型遞補）
 *   ・立即購買 → buy_listing RPC（自己的上架則是改價／下架）
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";

import styles from "./MarketDetail.module.css";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureGate } from "@/lib/useFeatureGate";
import { useRequireLogin } from "@/hooks/useRequireLogin";
import { ProductLoadingScreen } from "@/components/ui/ProductLoadingScreen";
import { asset } from "@/lib/asset";
import { gnum, ago } from "@/components/market/ui";
import {
  fetchListing, fetchPriceStats, fetchRecentDeals, fetchRelated, fetchSettings,
  fetchChatThread, sendChatMessage, markChatRead,
  buyListing, cancelListing, updateListingPrice,
  TYPE_LABEL,
  type Listing, type PriceStats, type MarketSettings, type DealPoint, type ChatMessage,
} from "@/app/market/data";

const RECENTS_KEY = "cardx.recent.detailVisits";
const FALLBACK = asset("/images/item_defaulet.webp");
const GCOIN = asset("/images/gcoin.webp");

type RangeKey = "7d" | "30d" | "90d";
type PricePoint = { t: number; v: number };

const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

function pushRecentVisit(entry: { kind: "market"; id: string; ts: number; title: string; imageUrl: string; price: number; fmv: number }) {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [entry, ...list.filter((x) => x && typeof x === "object" && !(x.kind === entry.kind && x.id === entry.id))].slice(0, 200);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {}
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatPointTime(t: number) {
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
}

/**
 * 成交走勢。
 *
 * 成交是稀疏事件（一款十來筆），所以照成交時間擺點、線只是把點串起來 ——
 * 不補零、不畫日 K。跟手機版 DealTrend 同一個讀法，只是換成 cardx 的尺寸與 tooltip。
 */
function PriceHistoryChart({
  points,
  activeIndex,
  setActiveIndex,
  trendUp,
}: {
  points: PricePoint[];
  activeIndex: number | null;
  setActiveIndex: (next: number | null) => void;
  trendUp: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const w = 600;
  const h = 220;
  const strokeWidth = 2.5;
  const safePad = Math.ceil(strokeWidth / 2 + 2);
  const padX = safePad;
  const padY = safePad;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const minV = Math.min(...points.map((p) => p.v));
  const maxV = Math.max(...points.map((p) => p.v));
  const span = Math.max(1, maxV - minV);
  const yMin = minV - span * 0.12;
  const yMax = maxV + span * 0.12;

  const t0 = Math.min(...points.map((p) => p.t));
  const t1 = Math.max(...points.map((p) => p.t));
  const tSpan = Math.max(1, t1 - t0);

  const xFor = useCallback(
    (i: number) => {
      if (points.length <= 1) return padX + innerW / 2;
      return padX + ((points[i]!.t - t0) / tSpan) * innerW;
    },
    [points, t0, tSpan, innerW, padX]
  );
  const yFor = useCallback(
    (v: number) => padY + (1 - (v - yMin) / (yMax - yMin)) * innerH,
    [yMin, yMax, innerH, padY]
  );

  const coords = useMemo(() => points.map((p, i) => ({ x: xFor(i), y: yFor(p.v), t: p.t, v: p.v })), [points, xFor, yFor]);

  const lineD = useMemo(() => {
    if (!coords.length) return "";
    return coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
  }, [coords]);

  const areaD = useMemo(() => {
    if (coords.length < 2) return "";
    const p0 = coords[0]!;
    const pN = coords[coords.length - 1]!;
    const baseY = padY + innerH;
    return `${lineD} L ${pN.x.toFixed(2)} ${baseY.toFixed(2)} L ${p0.x.toFixed(2)} ${baseY.toFixed(2)} Z`;
  }, [coords, lineD, padY, innerH]);

  const resolvedActive = activeIndex == null ? null : clamp(activeIndex, 0, points.length - 1);
  const activePoint = resolvedActive == null ? null : points[resolvedActive]!;
  const activeX = resolvedActive == null ? null : xFor(resolvedActive);
  const activeY = activePoint ? yFor(activePoint.v) : null;
  const tooltipMode = activeX == null ? "center" : activeX < 110 ? "left" : activeX > w - 110 ? "right" : "center";

  function setIndexFromClientX(clientX: number) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const vx = (x / Math.max(1, rect.width)) * w;
    let best = 0;
    let dist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(xFor(i) - vx);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setActiveIndex(best);
  }

  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => {
    const t = i / (ticks - 1);
    const v = yMax - t * (yMax - yMin);
    const y = padY + t * innerH;
    return { v, y };
  });

  const stroke = trendUp ? "rgba(46, 204, 113, 0.95)" : "rgba(235, 87, 87, 0.95)";
  const guide = trendUp ? "rgba(46, 204, 113, 0.35)" : "rgba(235, 87, 87, 0.35)";
  const latest = points[points.length - 1] ?? null;
  const latestY = latest ? yFor(latest.v) : null;
  const latestX = latest ? xFor(points.length - 1) : null;

  return (
    <div
      ref={wrapRef}
      className={styles.priceChartWrap}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setIndexFromClientX(e.clientX);
      }}
      onPointerMove={(e) => setIndexFromClientX(e.clientX)}
      onPointerLeave={() => setActiveIndex(null)}
      role="presentation"
    >
      <svg className={styles.priceChart} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="成交走勢圖">
        <defs>
          <linearGradient id="priceArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.00" />
          </linearGradient>
        </defs>
        {yTicks.map((t, idx) => (
          <g key={`yt_${idx}`}>
            <line x1={0} x2={w} y1={t.y} y2={t.y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={w - 8} y={clamp(t.y, 12, h - 12)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#9ca3af">
              {gnum(Math.round(t.v))}
            </text>
          </g>
        ))}

        {latestY != null ? <line x1={0} x2={w} y1={latestY} y2={latestY} stroke={guide} strokeWidth="1" strokeDasharray="4 6" /> : null}

        <path d={areaD} fill="url(#priceArea)" />
        <path d={lineD} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />

        {coords.map((c, i) => (
          <circle key={`pt_${i}`} cx={c.x} cy={c.y} r={2.5} fill={stroke} />
        ))}

        {latestX != null && latestY != null ? (
          <g>
            <circle cx={latestX} cy={latestY} r="4" fill={stroke} />
            <circle cx={latestX} cy={latestY} r="8" fill={stroke} opacity="0.12" />
          </g>
        ) : null}

        {activePoint && activeX != null && activeY != null ? (
          <g>
            <line x1={activeX} x2={activeX} y1={0} y2={h} stroke="#9ca3af" strokeWidth="1" />
            <circle cx={activeX} cy={activeY} r="4" fill={stroke} />
            <circle cx={activeX} cy={activeY} r="8" fill={stroke} opacity="0.12" />
          </g>
        ) : null}
      </svg>

      {activePoint && activeX != null && activeY != null ? (
        <div
          className={styles.priceTooltip}
          style={{
            left: tooltipMode === "left" ? "12px" : tooltipMode === "right" ? "calc(100% - 12px)" : `${(activeX / w) * 100}%`,
            top: `${(activeY / h) * 100}%`,
            transform:
              tooltipMode === "left"
                ? "translate(0, calc(-100% - 10px))"
                : tooltipMode === "right"
                  ? "translate(-100%, calc(-100% - 10px))"
                  : "translate(-50%, calc(-100% - 10px))",
          }}
        >
          <div className={styles.priceTooltipValue}>{gnum(Math.round(activePoint.v))} G</div>
          <div className={styles.priceTooltipTime}>{formatPointTime(activePoint.t)}</div>
        </div>
      ) : null}
    </div>
  );
}

function MediaGallery({ title, images }: { title: string; images: string[] }) {
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const activeImageSrc = images[Math.min(activeImageIdx, images.length - 1)] ?? images[0] ?? FALLBACK;

  return (
    <div className={styles.mediaCard}>
      <div className={styles.mediaStage}>
        <div className={styles.mediaInner}>
          <div className={styles.mediaMain}>
            <Image
              className={styles.mediaImage}
              src={activeImageSrc}
              alt={title}
              fill
              sizes="(max-width: 1023px) 92vw, 560px"
              priority
              unoptimized
              style={{ objectFit: "contain" }}
            />
          </div>

          {images.length > 1 ? (
            <div className={styles.mediaThumbRow} aria-label="其他圖片">
              {images.map((src, idx) => (
                <button
                  key={`${src}_${idx}`}
                  type="button"
                  className={`${styles.mediaThumbButton} ${idx === activeImageIdx ? styles.mediaThumbButtonActive : ""}`}
                  aria-label={`切換圖片 ${idx + 1}`}
                  onClick={() => setActiveImageIdx(idx)}
                >
                  <Image className={styles.mediaThumbImage} src={src} alt="" fill sizes="64px" unoptimized style={{ objectFit: "contain" }} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function MarketDetailPage() {
  useFeatureGate("market");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, refreshProfile } = useAuth();
  const requireLogin = useRequireLogin();

  const id = Number(params?.id);

  const [item, setItem] = useState<Listing | null>(null);
  const [stats, setStats] = useState<PriceStats | null>(null);
  const [deals, setDeals] = useState<DealPoint[]>([]);
  const [related, setRelated] = useState<Listing[]>([]);
  const [settings, setSettings] = useState<MarketSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [range, setRange] = useState<RangeKey>("30d");
  const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const isMine = !!user && !!item && user.id === item.sellerId;
  const balance = user?.tokens ?? 0;
  const notEnough = !!item && balance < item.price;

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) {
      setGone(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [row, st] = await Promise.all([fetchListing(id), fetchSettings()]);
      setSettings(st);
      if (!row) {
        setGone(true);
        return;
      }
      setGone(false);
      setItem(row);
      // 行情與相關品項不擋畫面：主體先出來，這幾塊晚一點補上
      fetchPriceStats(row.productPrizeId).then(setStats).catch(() => {});
      fetchRecentDeals(row.productPrizeId).then(setDeals).catch(() => {});
      fetchRelated(row).then(setRelated).catch(() => {});
    } catch {
      setGone(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!item) return;
    pushRecentVisit({
      kind: "market",
      id: String(item.id),
      ts: Date.now(),
      title: item.prizeName,
      imageUrl: item.prizeImage || FALLBACK,
      price: item.price,
      fmv: item.price,
    });
  }, [item]);

  /* ── 成交走勢：把近 90 天逐筆成交切成時間窗 ── */
  const rangedPoints = useMemo<PricePoint[]>(() => {
    const cutoff = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    return deals
      .map((d) => ({ t: new Date(d.createdAt).getTime(), v: d.price }))
      .filter((p) => Number.isFinite(p.t) && p.t >= cutoff)
      .sort((a, b) => a.t - b.t);
  }, [deals, range]);

  const firstPoint = rangedPoints[0] ?? null;
  const latestPoint = rangedPoints[rangedPoints.length - 1] ?? null;
  const trendUp = firstPoint && latestPoint ? latestPoint.v - firstPoint.v >= 0 : true;
  const trendPct = firstPoint && latestPoint && firstPoint.v > 0 ? ((latestPoint.v - firstPoint.v) / firstPoint.v) * 100 : 0;
  const selectedPoint = activeChartIndex == null ? null : rangedPoints[clamp(activeChartIndex, 0, rangedPoints.length - 1)] ?? null;
  const displayPoint = selectedPoint ?? latestPoint;

  /* ── 動作 ── */
  const doBuy = async () => {
    if (!item) return;
    setBusy(true);
    const res = await buyListing(item.id);
    setBusy(false);
    setConfirmOpen(false);
    if (!res.success) {
      // 失敗多半是被別人先買走或賣家下架了，重讀一次讓畫面對上現況
      setNotice(res.message || "購買失敗");
      load();
      return;
    }
    setNotice("買到了！東西已經進倉庫");
    refreshProfile?.();
    router.push("/market");
  };

  const onBuyClick = () => {
    if (!item || isMine) return;
    if (!requireLogin("登入後就可以在交易所買東西")) return;
    if (notEnough) {
      setNotice("G 幣不足，先去儲值");
      return;
    }
    setConfirmOpen(true);
  };

  const doOffShelf = async () => {
    if (!item) return;
    setBusy(true);
    const res = await cancelListing(item.id);
    setBusy(false);
    if (!res.success) {
      setNotice(res.message || "下架失敗");
      return;
    }
    setNotice("已下架，東西回到你的倉庫");
    refreshProfile?.();
    router.push("/market");
  };

  const doEditPrice = async () => {
    if (!item) return;
    const p = Math.round(Number(editPrice));
    if (!Number.isFinite(p) || p <= 0) {
      setNotice("填一個售價");
      return;
    }
    if (settings && (p < settings.minPrice || p > settings.maxPrice)) {
      setNotice(`售價要在 ${gnum(settings.minPrice)} ~ ${gnum(settings.maxPrice)} G 之間`);
      return;
    }
    setBusy(true);
    const res = await updateListingPrice(item.id, p);
    setBusy(false);
    if (!res.success) {
      setNotice(res.message || "改價失敗");
      return;
    }
    setEditOpen(false);
    setNotice("價格已更新");
    load();
  };

  const openChat = async () => {
    if (!item || isMine) return;
    if (!requireLogin("登入後就可以跟賣家聊聊")) return;
    setChatOpen(true);
    setChatBusy(true);
    try {
      setChat(await fetchChatThread(item.sellerId));
      markChatRead(item.sellerId);
    } catch {
      setChat([]);
    } finally {
      setChatBusy(false);
    }
  };

  const doSendChat = async () => {
    if (!item) return;
    const body = chatDraft.trim();
    if (!body) return;
    setChatBusy(true);
    const res = await sendChatMessage(item.id, item.sellerId, body);
    if (!res.success) {
      setChatBusy(false);
      setNotice(res.message || "訊息送不出去");
      return;
    }
    setChatDraft("");
    try {
      setChat(await fetchChatThread(item.sellerId));
    } catch {}
    setChatBusy(false);
  };

  if (loading) return <ProductLoadingScreen />;

  if (gone || !item) {
    return (
      <AppShell sidebarItems={defaultSidebarItems} hideBottomNavOnMobile>
        <div className={styles.page}>
          <div className={styles.breadcrumbs} aria-label="Breadcrumbs">
            <Link href="/market" className={styles.breadcrumbBack} scroll={false}>
              <span className={styles.breadcrumbBackIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                  <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className={styles.breadcrumbBackText}>
                <span>交易所</span>
              </span>
            </Link>
          </div>
          <section className={styles.section}>
            <div style={{ padding: "80px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 950, color: "#111827" }}>這件已經被買走或下架了</div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#6b7280" }}>回交易所看看還有什麼</div>
              <div style={{ marginTop: 18 }}>
                <Link href="/market" className={styles.sectionLink}>
                  ← 回交易所
                </Link>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const categoryLabel = TYPE_LABEL[item.productType] || "全部";
  const images = item.prizeImage ? [item.prizeImage] : [FALLBACK];

  const statCards: Array<{ k: string; v: string }> = [
    { k: "賞等", v: item.prizeLevel || "—" },
    { k: "來源商品", v: item.productName || "—" },
    { k: "這個品項全站共", v: item.prizeTotal ? `${gnum(item.prizeTotal)} 件` : "—" },
    { k: "上架時間", v: `${ago(item.createdAt)}` },
  ];

  const itemDetails: Array<{ label: string; value: string }> = [
    { label: "類別", value: categoryLabel },
    { label: "系列", value: item.productSeries || "—" },
    { label: "賞等", value: item.prizeLevel || "—" },
    { label: "賣家", value: item.sellerName },
    { label: "交付方式", value: "買到直接進你的倉庫" },
    { label: "付款", value: "G 幣，按下去立刻扣" },
    { label: "手續費", value: settings ? `賣家負擔 ${settings.feePercent}%，買家付標價` : "賣家負擔" },
    { label: "鑑賞期", value: "交易完成不能反悔" },
    { label: "近 90 天最近成交", value: stats ? `${gnum(stats.lastPrice)} G` : "尚無成交" },
    { label: "近 90 天平均", value: stats ? `${gnum(stats.avgPrice)} G` : "尚無成交" },
    { label: "近 90 天區間", value: stats ? `${gnum(stats.minPrice)} ~ ${gnum(stats.maxPrice)} G` : "尚無成交" },
    { label: "近 90 天成交筆數", value: stats ? `${gnum(stats.dealCount)} 筆` : "0 筆" },
  ];

  /* 物件動態：同一份成交紀錄（新的在前）＋這件的上架 */
  const activity: Array<{ left: string; mid: string; right: string }> = [
    ...[...deals]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
      .map((d) => ({ left: "成交", mid: `${gnum(d.price)} G`, right: ago(d.createdAt) })),
  ];
  activity.push({ left: "上架", mid: `${gnum(item.price)} G`, right: ago(item.createdAt) });

  const actionButtons = (
    <>
      <button
        type="button"
        className={styles.secondaryButton}
        aria-label="聊聊"
        onClick={openChat}
        disabled={isMine}
        style={{ width: 48, minWidth: 48, height: 48, padding: 0, display: "grid", placeItems: "center", opacity: isMine ? 0.45 : 1 }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ display: "block" }}>
          <use href="#icon-chat-3" />
        </svg>
      </button>

      {isMine ? (
        <>
          <button
            type="button"
            className={styles.secondaryButton}
            style={{ height: 48, padding: "0 18px" }}
            onClick={() => {
              setEditPrice(String(item.price));
              setEditOpen(true);
            }}
          >
            編輯價格
          </button>
          <button
            className={`button-3d button-3d_red button-3d_sm ${styles.buyButton3d}`}
            data-v-c8c96dbe=""
            type="button"
            disabled={busy}
            onClick={doOffShelf}
          >
            <span className="button-3d__outer" data-v-c8c96dbe="">
              <span className="button-3d__inner" data-v-c8c96dbe="">
                <span className="button-3d__text" data-v-c8c96dbe="">
                  {busy ? "處理中…" : "下架"}
                </span>
              </span>
            </span>
          </button>
        </>
      ) : (
        <button className={`button-3d button-3d_blue button-3d_sm ${styles.buyButton3d}`} data-v-c8c96dbe="" type="button" onClick={onBuyClick}>
          <span className="button-3d__outer" data-v-c8c96dbe="">
            <span className="button-3d__inner" data-v-c8c96dbe="">
              <span className="button-3d__text" data-v-c8c96dbe="">
                {notEnough ? "G 幣不足" : "立即購買"}
              </span>
            </span>
          </span>
        </button>
      )}
    </>
  );

  return (
    <AppShell sidebarItems={defaultSidebarItems} hideBottomNavOnMobile>
      <div className={styles.page}>
        <div className={styles.breadcrumbs} aria-label="Breadcrumbs">
          <Link href="/market" className={styles.breadcrumbBack} scroll={false}>
            <span className={styles.breadcrumbBackIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className={styles.breadcrumbBackText}>
              <span>交易所</span>
              <span className={styles.breadcrumbSep} aria-hidden="true"> / </span>
              <span>{categoryLabel}</span>
              <span className={styles.breadcrumbSep} aria-hidden="true"> / </span>
              <span className={styles.breadcrumbStrong}>{item.prizeName}</span>
            </span>
          </Link>
        </div>

        {notice ? (
          <div
            role="status"
            style={{
              margin: "0 0 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 900,
              color: "#111827",
            }}
          >
            {notice}
          </div>
        ) : null}

        <section className={styles.hero} aria-label="交易所品項">
          <div className={styles.mediaCol}>
            <MediaGallery key={item.id} title={item.prizeName} images={images} />
          </div>

          <div className={styles.infoCol}>
            <h1 className={styles.title}>{item.prizeName}</h1>
            <div className={styles.ownerRow}>
              <span>賣家</span>
              <span className={styles.ownerName}>
                {item.sellerName}
                {isMine ? "（你自己）" : ""}
              </span>
            </div>

            <div className={styles.statsGrid} aria-label="關鍵資訊">
              {statCards.map((x) => (
                <div key={x.k} className={styles.statCard}>
                  <div className={styles.statLabel}>{x.k}</div>
                  <div className={styles.statValue}>{x.v}</div>
                </div>
              ))}
            </div>

            <div className={styles.priceCard} aria-label="購買面板">
              <div className={styles.priceNow} aria-label="目前價格">
                <div className={styles.priceCardLabel}>目前售價</div>
                <div className={styles.priceCardValue} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <img src={GCOIN} alt="" width={26} height={26} style={{ width: 26, height: 26, objectFit: "contain" }} />
                  {gnum(item.price)}
                </div>
              </div>

              <div className={styles.actionGrid}>{actionButtons}</div>
            </div>
          </div>
        </section>

        <div className={styles.mobileActionBar} aria-label="操作">
          <div className={styles.mobileActionGrid}>{actionButtons}</div>
        </div>

        <section className={styles.section} aria-label="品項資訊">
          <div className={styles.sectionHeader}>品項資訊</div>
          <div className={styles.itemDetailsGrid}>
            {itemDetails.map((row) => (
              <div key={row.label} className={styles.itemDetailCard}>
                <div className={styles.itemDetailLabel}>{row.label}</div>
                <div className={styles.itemDetailValue}>{row.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.midSection} aria-label="市場資料">
          <div className={styles.panelGrid}>
            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeaderLeft}>
                  <div className={styles.panelIcon} aria-hidden="true">
                    G
                  </div>
                  <div className={styles.panelTitleRow}>
                    <div className={styles.panelTitle}>同款成交走勢</div>
                    <div className={styles.panelHint}>· 近 90 天</div>
                  </div>
                </div>
                <div className={styles.panelToggles}>
                  {(["7d", "30d", "90d"] as RangeKey[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`${styles.toggle} ${range === r ? styles.toggleActive : ""}`}
                      onClick={() => {
                        setRange(r);
                        setActiveChartIndex(null);
                      }}
                    >
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.panelBody}>
                {rangedPoints.length >= 2 ? (
                  <>
                    <div className={styles.panelKpiRow}>
                      <div className={styles.panelKpiValue}>{displayPoint ? `${gnum(Math.round(displayPoint.v))} G` : "—"}</div>
                      <div className={`${styles.panelKpiChange} ${trendUp ? styles.panelKpiChangeUp : styles.panelKpiChangeDown}`}>
                        {trendUp ? "↑" : "↓"} {Math.abs(trendPct).toFixed(1)}%
                      </div>
                      <div className={styles.panelKpiSub}>{rangedPoints.length} 筆成交</div>
                    </div>
                    <PriceHistoryChart
                      points={rangedPoints}
                      activeIndex={activeChartIndex}
                      setActiveIndex={setActiveChartIndex}
                      trendUp={trendUp}
                    />
                  </>
                ) : (
                  <div className={styles.panelBodyCenter}>
                    <div className={styles.comingSoonCard}>
                      <div className={styles.comingSoonTitle}>
                        {deals.length > 0 ? "這個時間範圍內成交太少，畫不出走勢" : "這個品項還沒有成交紀錄"}
                      </div>
                      <div className={styles.comingSoonSub}>價格由賣家自己開 —— 買之前先想想值不值。</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeaderLeft}>
                  <div className={styles.panelIcon} aria-hidden="true">
                    ↗
                  </div>
                  <div className={styles.panelTitleRow}>
                    <div className={styles.panelTitle}>品項動態</div>
                  </div>
                </div>
              </div>
              <div className={styles.panelList}>
                {activity.map((x, idx) => (
                  <div key={`${x.left}_${idx}`} className={styles.panelListRow}>
                    <div className={styles.panelListLeft}>{x.left}</div>
                    <div className={styles.panelListMid}>{x.mid}</div>
                    <div className={styles.panelListRight}>{x.right}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {related.length > 0 ? (
          <section className={styles.section} aria-label="相關品項">
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                相關品項
              </div>
              <Link className={styles.sectionLink} href="/market">
                查看全部
              </Link>
            </div>
            <div className={styles.relatedGrid}>
              {related.map((o) => (
                <Link key={o.id} className={styles.relatedCard} href={`/market/${o.id}`}>
                  <div className={styles.relatedMedia}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.relatedImage} src={o.prizeImage || FALLBACK} alt="" />
                  </div>
                  <div className={styles.relatedBody}>
                    <div className={styles.relatedTitle}>{o.prizeName}</div>
                    <div className={styles.relatedPriceRow}>
                      <div className={styles.relatedPrice}>{gnum(o.price)} G</div>
                      <div className={styles.relatedFmv}>{o.prizeLevel || o.productName}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.section} aria-label="交易規則">
          <div
            style={{
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              padding: "14px 18px",
              fontSize: 13,
              fontWeight: 700,
              color: "#374151",
              lineHeight: "20px",
            }}
          >
            交易所賣的是別人抽到的實體獎品，買到之後<b>東西直接進你的倉庫</b>，可以申請配送、分解或再掛回來賣。
            <b>交易完成不能反悔</b>，也沒有鑑賞期。
          </div>
        </section>
      </div>

      {confirmOpen ? (
        <div
          role="presentation"
          onClick={() => setConfirmOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="確認購買"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, calc(100vw - 32px))",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              padding: 18,
              color: "#111827",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 950 }}>確認購買</div>
            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 800, color: "#374151", lineHeight: "20px" }}>
              買下「{item.prizeName}」要花 <b>{gnum(item.price)} G</b>，按下去立刻扣款，東西直接進你的倉庫。
              <br />
              交易完成不能反悔，也沒有鑑賞期。
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
              目前餘額 {gnum(balance)} G，付款後剩 {gnum(Math.max(0, balance - item.price))} G
            </div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{ height: 40, padding: "0 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#111827", fontSize: 13, fontWeight: 900, cursor: "pointer" }}
              >
                再想想
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={doBuy}
                style={{
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid rgb(var(--primary))",
                  background: "rgb(var(--primary))",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "處理中…" : "確認購買"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div
          role="presentation"
          onClick={() => setEditOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="編輯價格"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, calc(100vw - 32px))",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              padding: 18,
              color: "#111827",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 950 }}>編輯價格</div>
            <input
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              style={{
                marginTop: 12,
                width: "100%",
                height: 42,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                color: "#111827",
                padding: "0 14px",
                fontSize: 14,
                fontWeight: 900,
                outline: "none",
              }}
            />
            {settings ? (
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                可填 {gnum(settings.minPrice)} ~ {gnum(settings.maxPrice)} G。成交時平台收 {settings.feePercent}% 手續費，你實際拿到{" "}
                <b style={{ color: "#dc2626" }}>
                  {gnum(Math.max(0, Math.round(Number(editPrice) || 0) - Math.floor(((Number(editPrice) || 0) * settings.feePercent) / 100)))} G
                </b>
                。
              </div>
            ) : null}
            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                style={{ height: 40, padding: "0 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#111827", fontSize: 13, fontWeight: 900, cursor: "pointer" }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={doEditPrice}
                style={{
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid rgb(var(--primary))",
                  background: "rgb(var(--primary))",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "處理中…" : "確認修改"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {chatOpen ? (
        <div
          role="presentation"
          onClick={() => setChatOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`跟 ${item.sellerName} 聊聊`}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, calc(100vw - 32px))",
              height: "min(70vh, 620px)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              color: "#111827",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 950 }}>跟 {item.sellerName} 聊聊</div>
              <button
                type="button"
                aria-label="關閉"
                onClick={() => setChatOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#374151", display: "grid", placeItems: "center", padding: 0, cursor: "pointer" }}
              >
                <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                  ×
                </span>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "grid", gap: 10, alignContent: "start" }}>
              {chat.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, fontWeight: 800, color: "#9ca3af" }}>
                  {chatBusy ? "讀取中" : "還沒聊過，打個招呼吧"}
                </div>
              ) : (
                chat.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.fromMe ? "flex-end" : "flex-start" }}>
                    <div
                      style={{
                        maxWidth: "78%",
                        borderRadius: 14,
                        padding: "9px 12px",
                        background: m.fromMe ? "rgb(var(--primary))" : "#f3f4f6",
                        color: m.fromMe ? "#ffffff" : "#111827",
                        fontSize: 13,
                        fontWeight: 700,
                        lineHeight: "19px",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.body}
                      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{ago(m.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: 14, borderTop: "1px solid #e5e7eb", display: "flex", gap: 10 }}>
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    doSendChat();
                  }
                }}
                placeholder="問問這件的狀況…"
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  color: "#111827",
                  padding: "0 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  outline: "none",
                }}
              />
              <button
                type="button"
                disabled={chatBusy || !chatDraft.trim()}
                onClick={doSendChat}
                style={{
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid rgb(var(--primary))",
                  background: "rgb(var(--primary))",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: chatBusy || !chatDraft.trim() ? "not-allowed" : "pointer",
                  opacity: chatBusy || !chatDraft.trim() ? 0.55 : 1,
                }}
              >
                送出
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
