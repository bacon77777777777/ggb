"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { formatMoney } from "@/cardx/components/ui/money";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import { mockMarketListings } from "@/cardx/lib/mock/home";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import styles from "./MarketDetail.module.css";

const cardImages = Array.from({ length: 11 }, () => "/cardx/placeholder.svg");
const FAVORITES_KEY = "cardx.favorites.byId";
const RECENTS_KEY = "cardx.recent.detailVisits";

type PriceRangeKey = "7d" | "30d" | "1y";
type PricePoint = { t: number; v: number };

function readFavorites(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeFavorites(next: Record<string, boolean>) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {}
}

function pushRecentVisit(entry: {
  kind: "market";
  id: string;
  ts: number;
  title: string;
  imageUrl: string;
  price: number;
  fmv: number;
}) {
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

function formatTwd(value: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Math.round(value));
}

function stableSeedFromString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
    </svg>
  );
}

function generateSeries(range: PriceRangeKey, basePriceTwd: number, seed: number): PricePoint[] {
  const now = Date.now();
  if (range === "7d") {
    const points = 28;
    const step = 6 * 60 * 60 * 1000;
    const start = now - step * (points - 1);
    return Array.from({ length: points }, (_, i) => {
      const t = start + step * i;
      const x = i / (points - 1);
      const wave = Math.sin((x * 6 + (seed % 17)) * Math.PI * 0.55) * 0.06;
      const drift = (x - 0.4) * 0.04;
      const noise = Math.sin((x * 13 + (seed % 29)) * Math.PI * 2) * 0.015;
      const v = basePriceTwd * (1 + wave + drift + noise);
      return { t, v: Math.max(1, v) };
    });
  }
  if (range === "30d") {
    const points = 30;
    const step = 24 * 60 * 60 * 1000;
    const start = now - step * (points - 1);
    return Array.from({ length: points }, (_, i) => {
      const t = start + step * i;
      const x = i / (points - 1);
      const wave = Math.sin((x * 5 + (seed % 19)) * Math.PI * 0.6) * 0.09;
      const drift = (x - 0.35) * 0.06;
      const noise = Math.sin((x * 17 + (seed % 31)) * Math.PI * 2) * 0.02;
      const v = basePriceTwd * (1 + wave + drift + noise);
      return { t, v: Math.max(1, v) };
    });
  }
  const points = 12;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const months: PricePoint[] = [];
  for (let i = points - 1; i >= 0; i -= 1) {
    const dt = new Date(d);
    dt.setMonth(dt.getMonth() - i);
    const x = (points - 1 - i) / (points - 1);
    const wave = Math.sin((x * 3 + (seed % 11)) * Math.PI) * 0.12;
    const drift = (x - 0.2) * 0.08;
    const noise = Math.sin((x * 9 + (seed % 23)) * Math.PI * 2) * 0.03;
    const v = basePriceTwd * (1 + wave + drift + noise);
    months.push({ t: dt.getTime(), v: Math.max(1, v) });
  }
  return months;
}

function formatPointTime(range: PriceRangeKey, t: number) {
  const d = new Date(t);
  const base = new Intl.DateTimeFormat("zh-TW", { month: "short", day: "numeric" }).format(d);
  if (range === "1y") return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "short" }).format(d);
  const hm = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${base} ${hm}`;
}

function PriceHistoryChart({
  range,
  points,
  activeIndex,
  setActiveIndex,
  trendUp,
}: {
  range: PriceRangeKey;
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

  function xFor(i: number) {
    if (points.length <= 1) return padX;
    return padX + (i / (points.length - 1)) * innerW;
  }
  function yFor(v: number) {
    const t = (v - yMin) / (yMax - yMin);
    return padY + (1 - t) * innerH;
  }

  const coords = useMemo(() => {
    return points.map((p, i) => ({ x: xFor(i), y: yFor(p.v), t: p.t, v: p.v }));
  }, [points, yMin, yMax]);

  const smoothCommands = useMemo(() => {
    if (coords.length < 2) return "";
    const alpha = 1;
    let d = "";
    for (let i = 0; i < coords.length - 1; i += 1) {
      const p0 = coords[Math.max(0, i - 1)]!;
      const p1 = coords[i]!;
      const p2 = coords[i + 1]!;
      const p3 = coords[Math.min(coords.length - 1, i + 2)]!;
      const cp1x = p1.x + ((p2.x - p0.x) / 6) * alpha;
      const cp1y = p1.y + ((p2.y - p0.y) / 6) * alpha;
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * alpha;
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * alpha;
      d += `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
    }
    return d.trim();
  }, [coords]);

  const lineD = useMemo(() => {
    if (!coords.length) return "";
    const p0 = coords[0]!;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} ${smoothCommands}`.trim();
  }, [coords, smoothCommands]);

  const areaD = useMemo(() => {
    if (!coords.length) return "";
    const p0 = coords[0]!;
    const pN = coords[coords.length - 1]!;
    const baseY = padY + innerH;
    if (coords.length < 2) {
      return `M ${p0.x.toFixed(2)} ${baseY.toFixed(2)} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} L ${pN.x.toFixed(2)} ${baseY.toFixed(2)} Z`;
    }
    const curve = lineD.replace(/^M [^ ]+ [^ ]+/, "").trim();
    return `M ${p0.x.toFixed(2)} ${baseY.toFixed(2)} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} ${curve} L ${pN.x.toFixed(2)} ${baseY.toFixed(2)} Z`.trim();
  }, [coords, lineD]);

  const resolvedActive = activeIndex == null ? null : clamp(activeIndex, 0, points.length - 1);
  const activePoint = resolvedActive == null ? null : points[resolvedActive]!;
  const activeX = activePoint ? xFor(resolvedActive!) : null;
  const activeY = activePoint ? yFor(activePoint.v) : null;
  const tooltipMode = activeX == null ? "center" : activeX < 110 ? "left" : activeX > w - 110 ? "right" : "center";

  function setIndexFromClientX(clientX: number) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const ratio = rect.width <= 1 ? 0 : x / rect.width;
    const idx = Math.round(ratio * (points.length - 1));
    setActiveIndex(clamp(idx, 0, points.length - 1));
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
      <svg className={styles.priceChart} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="價格走勢圖">
        <defs>
          <linearGradient id="priceArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.00" />
          </linearGradient>
        </defs>
        {yTicks.map((t, idx) => (
          <g key={`yt_${idx}`}>
            <line x1={0} x2={w} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text
              x={w - 8}
              y={clamp(t.y, 12, h - 12)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="11"
              fill="rgba(255,255,255,0.42)"
            >
              {formatTwd(t.v).replace("NT$", "")}
            </text>
          </g>
        ))}

        {latestY != null ? (
          <line x1={0} x2={w} y1={latestY} y2={latestY} stroke={guide} strokeWidth="1" strokeDasharray="4 6" />
        ) : null}

        <path d={areaD} fill="url(#priceArea)" />
        <path d={lineD} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />

        {latestX != null && latestY != null ? (
          <g>
            <circle cx={latestX} cy={latestY} r="4" fill={stroke} />
            <circle cx={latestX} cy={latestY} r="8" fill={stroke} opacity="0.12" />
          </g>
        ) : null}

        {activePoint && activeX != null && activeY != null ? (
          <g>
            <line x1={activeX} x2={activeX} y1={0} y2={h} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
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
          <div className={styles.priceTooltipValue}>{formatTwd(activePoint.v)}</div>
          <div className={styles.priceTooltipTime}>{formatPointTime(range, activePoint.t)}</div>
        </div>
      ) : null}
    </div>
  );
}

function MediaGallery({ title, images }: { title: string; images: string[] }) {
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const activeImageSrc = images[Math.min(activeImageIdx, images.length - 1)] ?? images[0];

  return (
    <div className={styles.mediaCard}>
      <div className={styles.mediaStage}>
        <div className={styles.mediaInner}>
          <div className={styles.mediaMain}>
            <Image className={styles.mediaImage} src={activeImageSrc} alt={title} fill sizes="(max-width: 1023px) 92vw, 560px" priority unoptimized />
          </div>

          <div className={styles.mediaThumbRow} aria-label="其他圖片">
            {images.map((src, idx) => (
              <button
                key={`${src}_${idx}`}
                type="button"
                className={`${styles.mediaThumbButton} ${idx === activeImageIdx ? styles.mediaThumbButtonActive : ""}`}
                aria-label={`切換圖片 ${idx + 1}`}
                onClick={() => setActiveImageIdx(idx)}
              >
                <Image className={styles.mediaThumbImage} src={src} alt="" fill sizes="64px" unoptimized />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "listing_001";
  const baseId = id.replace(/_\d{3}$/, "");
  const listing = mockMarketListings.find((x) => x.id === baseId) ?? null;

  const title = listing?.title ?? "2023 Pokemon Japanese Scarlet & Violet";
  const category = listing?.game === "pokemon" ? "寶可夢" : "全部";
  const ownerLabel = "@coddy20123";
  const priceMoney = listing?.price ?? { amount: 890, currency: "TWD" as const };
  const price = formatMoney(priceMoney);
  const packRecommend = listing?.game === "pokemon";
  const [priceRange, setPriceRange] = useState<PriceRangeKey>("7d");
  const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const favorited = !!favoriteById[id];
  const priceSeries = useMemo(() => {
    const base = listing?.price?.amount ?? 890;
    return generateSeries(priceRange, base, stableSeedFromString(id));
  }, [id, listing?.price?.amount, priceRange]);
  const selectedPoint = activeChartIndex == null ? null : priceSeries[clamp(activeChartIndex, 0, priceSeries.length - 1)] ?? null;
  const latestPoint = priceSeries[priceSeries.length - 1] ?? null;
  const displayPoint = selectedPoint ?? latestPoint;
  const firstPoint = priceSeries[0] ?? null;
  const trendUp = firstPoint && latestPoint ? latestPoint.v - firstPoint.v >= 0 : true;
  const trendPct = firstPoint && latestPoint && firstPoint.v > 0 ? ((latestPoint.v - firstPoint.v) / firstPoint.v) * 100 : 0;
  const twdFormatter = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  });

  function handleBuy() {
    try {
      const raw = window.localStorage.getItem("cardx.kyc.v1");
      const parsed = raw ? JSON.parse(raw) : null;
      const status = parsed && typeof parsed === "object" ? (parsed.status as string) : "";
      const next = `/checkout?kind=market&id=${encodeURIComponent(id)}`;
      if (status !== "approved") {
        router.push(`/account/kyc?next=${encodeURIComponent(next)}`);
        return;
      }
      router.push(next);
    } catch {
      const next = `/checkout?kind=market&id=${encodeURIComponent(id)}`;
      router.push(`/account/kyc?next=${encodeURIComponent(next)}`);
    }
  }

  const packOptions = useMemo(
    () => [
      { key: "rookie", label: "Rookie", priceLabel: formatTwd(249), img: "/cardx/placeholder.svg" },
      { key: "elite", label: "Elite", priceLabel: formatTwd(499), img: "/cardx/placeholder.svg" },
      { key: "sealed", label: "Sealed", priceLabel: formatTwd(990), img: "/cardx/placeholder.svg" },
      { key: "legend", label: "Legend", priceLabel: formatTwd(2490), img: "/cardx/placeholder.svg" },
    ],
    []
  );

  const statCards = [
    { k: "CGC 評級", v: "CGC 9.0" },
    { k: "證書編號", v: "6088004099", href: "https://www.cgccards.com/certlookup/6090343051", withArrow: true },
    { k: "Alt 估值", v: twdFormatter.format(340) },
    { k: "託管於", v: "Fanatics" },
  ];

  const activity = [
    { left: "成交", mid: twdFormatter.format(775), right: "2 分鐘前" },
    { left: "上架", mid: twdFormatter.format(820), right: "15 分鐘前" },
    { left: "出價", mid: twdFormatter.format(760), right: "1 小時前" },
    { left: "成交", mid: twdFormatter.format(792), right: "3 小時前" },
    { left: "上架", mid: twdFormatter.format(850), right: "昨天" },
    { left: "轉移", mid: "託管入庫", right: "2 天前" },
    { left: "鑑定", mid: "CGC 9.0", right: "3 天前" },
  ];

  const itemDetails = [
    { label: "發行年份", value: "2023" },
    { label: "系列代碼", value: "SV4a" },
    { label: "稀有度", value: "SAR" },
    { label: "卡片編號", value: "348 / 190" },
    { label: "插畫師", value: "Naoki Saito" },
    { label: "屬性/類型", value: "訓練家 (支援者)" },
    { label: "語言", value: "日文" },
    { label: "鑑定總量", value: "1,420" },
    { label: "近期成交價", value: "約$1,250" },
    { label: "24H 價格波動", value: "+ 3.25%" },
    { label: "即時回購價", value: "約$1,100" },
    { label: "市場流動性", value: "極高" },
  ];

  const similarItems = [
    { id: "m-1", title: "【寶可夢】經典卡磚特選組", price: 690, fmv: 790, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-2", title: "【運動卡】新秀簽名卡（精選）", price: 590, fmv: 720, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-3", title: "【收藏品】封裝展示級卡片", price: 1280, fmv: 1490, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-4", title: "【寶可夢】高評級卡片展示", price: 1680, fmv: 1990, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-5", title: "【運動卡】熱門新人卡（盒裝）", price: 880, fmv: 1060, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-6", title: "【收藏品】限量卡套組（精選）", price: 980, fmv: 1150, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-7", title: "【寶可夢】經典卡磚特選組（加開）", price: 720, fmv: 820, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-8", title: "【收藏品】封裝展示級卡片（特選）", price: 1380, fmv: 1590, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-9", title: "【運動卡】熱門新人卡（精選）", price: 930, fmv: 1120, imageUrl: "/cardx/placeholder.svg" },
    { id: "m-10", title: "【寶可夢】高評級卡片展示（新上架）", price: 1750, fmv: 2080, imageUrl: "/cardx/placeholder.svg" },
  ];

  const listingImages = useMemo(() => {
    const numeric = Number(id.replace(/\D/g, "")) || 1;
    const start = (numeric - 1) % cardImages.length;
    const count = 4;
    return Array.from({ length: count }, (_, i) => cardImages[(start + i) % cardImages.length]);
  }, [id]);

  useEffect(() => {
    window.setTimeout(() => setFavoriteById(readFavorites()), 0);
  }, []);

  useEffect(() => {
    function sync() {
      setFavoriteById(readFavorites());
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== FAVORITES_KEY) return;
      sync();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);

  function toggleFavorite(targetId: string) {
    setFavoriteById((prev) => {
      const next = { ...prev, [targetId]: !prev[targetId] };
      if (!next[targetId]) delete next[targetId];
      writeFavorites(next);
      return next;
    });
  }

  useEffect(() => {
    pushRecentVisit({
      kind: "market",
      id,
      ts: Date.now(),
      title,
      imageUrl: listingImages[0] ?? cardImages[0] ?? "",
      price: priceMoney.amount,
      fmv: listing?.fmv?.amount ?? Math.round(priceMoney.amount * 1.15),
    });
  }, [id, listing?.fmv?.amount, listingImages, priceMoney.amount, title]);

  return (
    <AppShell sidebarItems={defaultSidebarItems} hideBottomNavOnMobile>
      <div className={styles.page}>
        <div className={styles.breadcrumbs} aria-label="Breadcrumbs">
          <Link href="/market" className={styles.breadcrumbBack} scroll={false}>
            <span className={styles.breadcrumbBackIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path
                  d="M15 18l-6-6 6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.breadcrumbBackText}>
              <span>市集</span>
              <span className={styles.breadcrumbSep} aria-hidden="true">
                {" "}
                /{" "}
              </span>
              <span>{category}</span>
              <span className={styles.breadcrumbSep} aria-hidden="true">
                {" "}
                /{" "}
              </span>
              <span className={styles.breadcrumbStrong}>{title}</span>
            </span>
          </Link>
        </div>

        <section className={styles.hero} aria-label="Market Listing">
          <div className={styles.mediaCol}>
            <MediaGallery key={id} title={title} images={listingImages} />
          </div>

          <div className={styles.infoCol}>
            <h1 className={styles.title}>{title}</h1>
            <div className={styles.ownerRow}>
              <span>擁有者</span>
              <span className={styles.ownerName}>{ownerLabel}</span>
            </div>

            <div className={styles.statsGrid} aria-label="關鍵資訊">
              {statCards.map((x) => {
                const inner = (
                  <>
                    <div className={styles.statLabel}>{x.k}</div>
                    {x.withArrow ? (
                      <div className={styles.statValueRow}>
                        <div className={styles.statValue}>{x.v}</div>
                        <div className={styles.statArrow} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                            <path
                              d="M9 18l6-6-6-6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.statValue}>{x.v}</div>
                    )}
                  </>
                );

                return x.href ? (
                  <a
                    key={`${x.k}_${x.v}`}
                    className={`${styles.statCard} ${styles.statCardLink}`}
                    href={x.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={`${x.k}_${x.v}`} className={styles.statCard}>
                    {inner}
                  </div>
                );
              })}
            </div>

            <div className={`${styles.priceCard} ${packRecommend ? styles.priceCardFill : ""}`} aria-label="購買面板">
              {packRecommend ? (
                <div className={styles.packRecSection} aria-label="卡包推薦">
                  <div className={styles.packRecHeader}>
                    <div className={styles.packRecTitleRow}>
                      <div className={styles.packRecTitle}>卡包推薦</div>
                    </div>
                    <button type="button" className={styles.packRecViewAll} onClick={() => router.push("/packs")}>
                      查看全部
                    </button>
                  </div>
                  <div className={styles.packRecRow} aria-label="推薦卡包">
                    {packOptions.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        className={styles.packRecCard}
                        aria-label={`${p.label} pack`}
                        onClick={() => router.push("/packs")}
                      >
                        <div className={styles.packRecCardInner}>
                          <div className={styles.packRecCardBg}>
                            <Image src={p.img} alt="" fill sizes="240px" className={styles.packRecCardBgImg} unoptimized />
                          </div>
                          <div className={styles.packRecCardLabel}>{p.label}</div>
                          <div className={styles.packRecCardPrice}>{p.priceLabel}</div>
                          <div className={styles.packRecCardIcon}>
                            <Image src={p.img} alt="" fill sizes="240px" className={styles.packRecCardIconImg} unoptimized />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.priceNow} aria-label="目前價格">
                <div className={styles.priceCardLabel}>目前價格</div>
                <div className={styles.priceCardValue}>{price}</div>
              </div>

              <div className={styles.actionGrid}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  aria-label="私訊"
                  style={{ width: 48, minWidth: 48, height: 48, padding: 0, display: "grid", placeItems: "center" }}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ display: "block" }}>
                    <use href="#icon-chat-3" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  aria-label="收藏"
                  aria-pressed={favorited}
                  onClick={() => toggleFavorite(id)}
                  style={{
                    width: 48,
                    minWidth: 48,
                    height: 48,
                    padding: 0,
                    display: "grid",
                    placeItems: "center",
                    color: favorited ? "#ff4d4f" : undefined,
                    borderColor: favorited ? "rgba(255, 77, 79, 0.55)" : undefined,
                    background: favorited ? "rgba(255, 77, 79, 0.18)" : undefined,
                  }}
                >
                  <HeartIcon />
                </button>
                <button
                  className={`button-3d button-3d_blue button-3d_sm ${styles.buyButton3d}`}
                  data-v-c8c96dbe=""
                  type="button"
                  onClick={handleBuy}
                >
                  <span className="button-3d__outer" data-v-c8c96dbe="">
                    <span className="button-3d__inner" data-v-c8c96dbe="">
                      <span className="button-3d__text" data-v-c8c96dbe="">
                        立即購買
                      </span>
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.mobileActionBar} aria-label="行動操作">
          <div className={styles.mobileActionGrid}>
            <button
              type="button"
              className={styles.secondaryButton}
              aria-label="私訊"
              style={{ width: 48, minWidth: 48, height: 48, padding: 0, display: "grid", placeItems: "center" }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ display: "block" }}>
                <use href="#icon-chat-3" />
              </svg>
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              aria-label="收藏"
              aria-pressed={favorited}
              onClick={() => toggleFavorite(id)}
              style={{
                width: 48,
                minWidth: 48,
                height: 48,
                padding: 0,
                display: "grid",
                placeItems: "center",
                color: favorited ? "#ff4d4f" : undefined,
                borderColor: favorited ? "rgba(255, 77, 79, 0.55)" : undefined,
                background: favorited ? "rgba(255, 77, 79, 0.18)" : undefined,
              }}
            >
              <HeartIcon />
            </button>
            <button
              className={`button-3d button-3d_blue button-3d_sm ${styles.buyButton3d}`}
              data-v-c8c96dbe=""
              type="button"
              onClick={handleBuy}
            >
              <span className="button-3d__outer" data-v-c8c96dbe="">
                <span className="button-3d__inner" data-v-c8c96dbe="">
                  <span className="button-3d__text" data-v-c8c96dbe="">
                    立即購買
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>

        <section className={styles.section} aria-label="物件資訊">
          <div className={styles.sectionHeader}>物件資訊</div>
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
                    $
                  </div>
                  <div className={styles.panelTitleRow}>
                    <div className={styles.panelTitle}>價格走勢</div>
                    <div className={styles.panelHint}>· CGC 9.0</div>
                  </div>
                </div>
                <div className={styles.panelToggles}>
                  <button
                    type="button"
                    className={`${styles.toggle} ${priceRange === "7d" ? styles.toggleActive : ""}`}
                    onClick={() => setPriceRange("7d")}
                  >
                    7D
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggle} ${priceRange === "30d" ? styles.toggleActive : ""}`}
                    onClick={() => setPriceRange("30d")}
                  >
                    30D
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggle} ${priceRange === "1y" ? styles.toggleActive : ""}`}
                    onClick={() => setPriceRange("1y")}
                  >
                    1Y
                  </button>
                </div>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.panelKpiRow}>
                  <div className={styles.panelKpiValue}>{displayPoint ? formatTwd(displayPoint.v) : price}</div>
                  <div className={`${styles.panelKpiChange} ${trendUp ? styles.panelKpiChangeUp : styles.panelKpiChangeDown}`}>
                    {trendUp ? "↑" : "↓"} {Math.abs(trendPct).toFixed(1)}%
                  </div>
                  <div className={styles.panelKpiSub}>{priceRange}</div>
                </div>
                <PriceHistoryChart
                  range={priceRange}
                  points={priceSeries}
                  activeIndex={activeChartIndex}
                  setActiveIndex={setActiveChartIndex}
                  trendUp={trendUp}
                />
              </div>
            </div>

            <div className={styles.panelCard}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeaderLeft}>
                  <div className={styles.panelIcon} aria-hidden="true">
                    ↗
                  </div>
                  <div className={styles.panelTitleRow}>
                    <div className={styles.panelTitle}>物件動態</div>
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

        <div className={homeStyles.main2}>
          <div className={homeStyles.main}>
            <div className={homeStyles.sectionLobby}>
              <section className={homeStyles.section} aria-label="相似商品">
                <div className={homeStyles.header}>
                  <div className={homeStyles.link8}>
                    <div className={homeStyles.sVg}>
                      <img alt="" src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg" className={homeStyles.iconCherries} />
                    </div>
                    <p className={homeStyles.heading2Slots}>相似商品</p>
                  </div>
                  <Link className={homeStyles.text10} href="/market">
                    查看全部
                  </Link>
                </div>
                <div className={homeStyles.frame12}>
                  {similarItems.map((item) => (
                    <div
                      className={homeStyles.item4}
                      key={item.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/market/${item.id}`)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        router.push(`/market/${item.id}`);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <div className={homeStyles.rectangle2} style={{ backgroundImage: `url(${item.imageUrl})` }}>
                        <button
                          type="button"
                          className={homeStyles.favoriteButton}
                          aria-pressed={!!favoriteById[item.id]}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item.id);
                          }}
                        >
                          <HeartIcon />
                        </button>
                        <div className={homeStyles.backgroundBorderShad}>
                          <p className={homeStyles.a18}>-18%</p>
                        </div>
                      </div>
                      <div className={homeStyles.frame1}>
                        <p className={homeStyles.a2022PaniniPrizm353B}>{item.title}</p>
                        <div className={homeStyles.frame2}>
                          <p className={homeStyles.heading62225}>{twdFormatter.format(Math.round(item.price))}</p>
                          <div className={homeStyles.overlayBorder}>
                            <p className={homeStyles.fMv2730}>FMV {twdFormatter.format(Math.round(item.fmv))}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <footer className={homeStyles.footer} aria-label="Footer">
            <div className={homeStyles.footerInner}>
              <div className={homeStyles.footerBrand}>
                <p className={homeStyles.footerName}>CardX</p>
                <p className={homeStyles.footerDesc}>Collect, trade, and discover cards — all in one place.</p>
              </div>
              <div className={homeStyles.footerCol}>
                <p className={homeStyles.footerTitle}>產品</p>
                <Link className={homeStyles.footerLink} href="/market">
                  市場
                </Link>
                <Link className={homeStyles.footerLink} href="/rewards">
                  獎勵
                </Link>
              </div>
              <div className={homeStyles.footerCol}>
                <p className={homeStyles.footerTitle}>資訊</p>
                <Link className={homeStyles.footerLink} href="/info">
                  最新消息
                </Link>
                <Link className={homeStyles.footerLink} href="/info">
                  新手指南
                </Link>
              </div>
              <div className={homeStyles.footerCol}>
                <p className={homeStyles.footerTitle}>支援</p>
                <a className={homeStyles.footerLink} href="mailto:support@cardx.example">
                  support@cardx.example
                </a>
                <Link className={homeStyles.footerLink} href="/info">
                  隱私權政策
                </Link>
              </div>
            </div>
            <div className={homeStyles.footerBottom}>
              <p className={homeStyles.footerCopy}>© {new Date().getFullYear()} CardX</p>
              <div className={homeStyles.footerSocial} aria-label="Social">
                <a className={homeStyles.footerLink} href="/info">
                  X
                </a>
                <a className={homeStyles.footerLink} href="/info">
                  Discord
                </a>
                <a className={homeStyles.footerLink} href="/info">
                  Telegram
                </a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </AppShell>
  );
}
