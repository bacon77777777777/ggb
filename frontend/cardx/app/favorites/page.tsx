"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { mockMarketListings } from "@/cardx/lib/mock/home";

const FAVORITES_KEY = "cardx.favorites.byId";
const marketCardImages = Array.from({ length: 11 }, () => "/cardx/placeholder.svg");
const packImages = Array.from({ length: 5 }, () => "/cardx/placeholder.svg");

function stableSeedFromString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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

type MarketItem = {
  id: string;
  detailId: string;
  title: string;
  imageUrl: string;
  price: number;
  fmv: number;
};

type PackItem = {
  id: string;
  routeId: string;
  title: string;
  imageUrl: string;
  price: number;
  remaining: string;
};

type TradeItem = {
  id: string;
  routeId: string;
  offerTitle: string;
  wantTitle: string;
  offerImageUrl: string;
  wantImageUrl: string;
  user: string;
};

const homeMarketItems: MarketItem[] = [
  { id: "m-1", detailId: "listing_001", title: "【寶可夢】經典卡磚特選組", price: 690, fmv: 790, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-2", detailId: "listing_002", title: "【運動卡】新秀簽名卡（精選）", price: 590, fmv: 720, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-3", detailId: "listing_003", title: "【收藏品】封裝展示級卡片", price: 1280, fmv: 1490, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-4", detailId: "listing_004", title: "【寶可夢】高評級卡片展示", price: 1680, fmv: 1990, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-5", detailId: "listing_005", title: "【運動卡】熱門新人卡（盒裝）", price: 880, fmv: 1060, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-6", detailId: "listing_006", title: "【收藏品】限量卡套組（精選）", price: 980, fmv: 1150, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-7", detailId: "listing_007", title: "【寶可夢】經典卡磚特選組（加開）", price: 720, fmv: 820, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-8", detailId: "listing_001", title: "【收藏品】封裝展示級卡片（特選）", price: 1380, fmv: 1590, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-9", detailId: "listing_002", title: "【運動卡】熱門新人卡（精選）", price: 930, fmv: 1120, imageUrl: "/cardx/placeholder.svg" },
  { id: "m-10", detailId: "listing_003", title: "【寶可夢】高評級卡片展示（新上架）", price: 1750, fmv: 2080, imageUrl: "/cardx/placeholder.svg" },
];

const homePackItems: PackItem[] = [
  { id: "p-1", routeId: "pack_001", title: "【卡包】夢幻擴充包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "34/80", price: 199 },
  { id: "p-2", routeId: "pack_002", title: "【卡包】新系列首發包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "12/80", price: 199 },
  { id: "p-3", routeId: "pack_003", title: "【卡包】人氣角色加強包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "58/80", price: 249 },
  { id: "p-4", routeId: "pack_004", title: "【卡包】經典回歸特典包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "6/80", price: 249 },
  { id: "p-5", routeId: "pack_005", title: "【卡包】收藏家限定包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "41/80", price: 299 },
  { id: "p-6", routeId: "pack_006", title: "【卡包】夢幻擴充包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "23/80", price: 199 },
  { id: "p-7", routeId: "pack_007", title: "【卡包】新系列首發包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "70/80", price: 199 },
  { id: "p-8", routeId: "pack_008", title: "【卡包】人氣角色加強包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "9/80", price: 249 },
  { id: "p-9", routeId: "pack_009", title: "【卡包】經典回歸特典包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "52/80", price: 249 },
  { id: "p-10", routeId: "pack_010", title: "【卡包】收藏家限定包（隨機一抽）", imageUrl: "/cardx/placeholder.svg", remaining: "18/80", price: 299 },
];

const homeTradeItems: TradeItem[] = [
  {
    id: "t-1",
    routeId: "t-1",
    offerTitle: "冰騎士蕾冠王V",
    wantTitle: "新葉喵",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-2",
    routeId: "t-2",
    offerTitle: "噴火龍ex",
    wantTitle: "古劍豹ex",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-3",
    routeId: "t-3",
    offerTitle: "咬咬龜",
    wantTitle: "蜈蚣王",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-4",
    routeId: "t-4",
    offerTitle: "伊布",
    wantTitle: "冰騎士蕾冠王V",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-5",
    routeId: "t-5",
    offerTitle: "古劍豹ex",
    wantTitle: "噴火龍ex",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-6",
    routeId: "t-6",
    offerTitle: "新葉喵",
    wantTitle: "伊布",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-7",
    routeId: "t-7",
    offerTitle: "蜈蚣王",
    wantTitle: "咬咬龜",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-8",
    routeId: "t-8",
    offerTitle: "伊布",
    wantTitle: "新葉喵",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-9",
    routeId: "t-9",
    offerTitle: "噴火龍ex",
    wantTitle: "皮卡丘",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
  {
    id: "t-10",
    routeId: "t-10",
    offerTitle: "古劍豹ex",
    wantTitle: "伊布",
    offerImageUrl: "/cardx/placeholder.svg",
    wantImageUrl: "/cardx/placeholder.svg",
    user: "@coddy20123",
  },
];

export default function FavoritesPage() {
  const router = useRouter();
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const [marketColumns, setMarketColumns] = useState(5);
  const [packColumns, setPackColumns] = useState(5);
  const [tradeColumns, setTradeColumns] = useState(2);
  const marketListRef = useRef<HTMLDivElement | null>(null);
  const packListRef = useRef<HTMLDivElement | null>(null);
  const tradeListRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    function computeColumnsFor(
      el: HTMLDivElement | null,
      minCardWidth: number,
      maxCardWidth: number,
      mobileCols: number,
      setCols: (n: number) => void
    ) {
      if (!el) return;
      const gap = 16;
      const wvw = window.innerWidth;
      if (wvw <= 640) {
        setCols(mobileCols);
        return;
      }
      if (wvw <= 1023 && minCardWidth <= 280) {
        setCols(2);
        return;
      }
      const w = el.clientWidth;
      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (maxCardWidth + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (minCardWidth + gap)));
      const next = Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin));
      setCols(next);
    }

    function computeAll() {
      computeColumnsFor(marketListRef.current, 220, 280, 2, (n) => setMarketColumns((prev) => (prev === n ? prev : n)));
      computeColumnsFor(packListRef.current, 220, 280, 2, (n) => setPackColumns((prev) => (prev === n ? prev : n)));
    }

    computeAll();
    const ro = new ResizeObserver(() => computeAll());
    if (marketListRef.current) ro.observe(marketListRef.current);
    if (packListRef.current) ro.observe(packListRef.current);
    if (tradeListRef.current) ro.observe(tradeListRef.current);
    window.addEventListener("resize", computeAll);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeAll);
    };
  }, []);

  const formatTwd = useMemo(() => {
    const formatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
    return (value: number) => formatter.format(Math.round(value));
  }, []);

  const marketItems: MarketItem[] = useMemo(() => {
    const baseItems = mockMarketListings.map((x, idx) => {
      const grade = idx === 0 ? 9.0 : 10 - ((idx + 3) % 10) * 0.5;
      const views = 1200 - idx * 83;
      return { ...x, grade, views };
    });

    const inflated = Array.from({ length: 120 }, (_, i) => {
      const base = baseItems[i % baseItems.length]!;
      const price = Math.max(50, base.price.amount + (i % 11) * 35 - ((i % 4) + 1) * 18);
      const fmv = Math.max(price, (base.fmv?.amount ?? Math.round(base.price.amount * 1.15)) + (i % 9) * 22);
      return {
        ...base,
        id: `${base.id}_${String(i).padStart(3, "0")}`,
        imageUrl: marketCardImages[i % marketCardImages.length]!,
        price: { ...base.price, amount: price },
        fmv: { amount: fmv, currency: base.price.currency },
      };
    });

    return inflated.map((x) => ({
      id: x.id,
      detailId: x.id.replace(/_\d{3}$/, ""),
      title: x.title,
      imageUrl: x.imageUrl,
      price: x.price.amount,
      fmv: x.fmv?.amount ?? Math.round(x.price.amount * 1.15),
    }));
  }, []);

  const packItems: PackItem[] = useMemo(() => {
    return Array.from({ length: 120 }, (_, idx) => {
      const i = idx + 1;
      const imageUrl = packImages[idx % packImages.length]!;
      const game = (["pokemon", "onepiece", "yugioh", "basketball", "baseball", "comic", "other"] as const)[idx % 7]!;
      const seed = stableSeedFromString(`pack_${i}_${game}`);
      const price = 149 + (seed % 5) * 50;
      const remaining = 1 + (seed % 78);
      const total = 80;
      const label =
        game === "pokemon"
          ? "寶可夢"
          : game === "onepiece"
            ? "海賊王"
            : game === "yugioh"
              ? "遊戲王"
              : game === "basketball"
                ? "籃球"
                : game === "baseball"
                  ? "棒球"
                  : game === "comic"
                    ? "漫畫"
                    : "其他";
      return {
        id: `pack_${String(i).padStart(3, "0")}`,
        routeId: `pack_${String(i).padStart(3, "0")}`,
        title: `【卡包】${label}（隨機一抽）`,
        imageUrl,
        price,
        remaining: `${remaining}/${total}`,
      };
    });
  }, []);

  const tradeItems: TradeItem[] = useMemo(() => {
    const baseTradeItems: Array<Omit<TradeItem, "id" | "routeId">> = [
      {
        offerTitle: "冰騎士蕾冠王V",
        wantTitle: "新葉喵",
        offerImageUrl: "/cardx/placeholder.svg",
        wantImageUrl: "/cardx/placeholder.svg",
        user: "@coddy20123",
      },
      {
        offerTitle: "噴火龍ex",
        wantTitle: "古劍豹ex",
        offerImageUrl: "/cardx/placeholder.svg",
        wantImageUrl: "/cardx/placeholder.svg",
        user: "@coddy20123",
      },
      {
        offerTitle: "咬咬龜",
        wantTitle: "蜈蚣王",
        offerImageUrl: "/cardx/placeholder.svg",
        wantImageUrl: "/cardx/placeholder.svg",
        user: "@coddy20123",
      },
      {
        offerTitle: "伊布",
        wantTitle: "冰騎士蕾冠王V",
        offerImageUrl: "/cardx/placeholder.svg",
        wantImageUrl: "/cardx/placeholder.svg",
        user: "@coddy20123",
      },
      {
        offerTitle: "皮卡丘",
        wantTitle: "噴火龍",
        offerImageUrl: "/cardx/placeholder.svg",
        wantImageUrl: "/cardx/placeholder.svg",
        user: "@pikacoddy",
      },
    ];

    return Array.from({ length: 120 }, (_, idx) => {
      const base = baseTradeItems[idx % baseTradeItems.length]!;
      const id = `trade_${String(idx + 1).padStart(3, "0")}`;
      return { ...base, id, routeId: id };
    });
  }, []);

  const allMarketItems = useMemo(() => [...homeMarketItems, ...marketItems], [marketItems]);
  const allPackItems = useMemo(() => [...homePackItems, ...packItems], [packItems]);
  const allTradeItems = useMemo(() => [...homeTradeItems, ...tradeItems], [tradeItems]);

  // Legacy ids may be stored with a "cp-" prefix (e.g. "cp-p-1"); treat them as their base id.
  const normalizedFavoriteById = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(favoriteById)) {
      if (!value || typeof key !== "string") continue;
      const baseId = key.startsWith("cp-") ? key.slice(3) : key;
      if (baseId) out[baseId] = true;
    }
    return out;
  }, [favoriteById]);

  // Market detail pages favorite bare base ids like "listing_001" (no _NNN suffix).
  // Synthesize a market card for any such favorited id that no known item covers.
  const synthesizedMarket = useMemo<MarketItem[]>(() => {
    const knownIds = new Set(allMarketItems.map((x) => x.id));
    const out: MarketItem[] = [];
    for (const id of Object.keys(normalizedFavoriteById)) {
      if (!/^listing_\d{3}$/.test(id) || knownIds.has(id)) continue;
      const base = mockMarketListings.find((x) => x.id === id);
      const price = base?.price.amount ?? 690;
      const fmv = base?.fmv?.amount ?? Math.round(price * 1.15);
      out.push({
        id,
        detailId: id,
        title: base?.title ?? `市集商品 ${id.replace(/^listing_/, "")}`,
        imageUrl: "/cardx/placeholder.svg",
        price,
        fmv: Math.max(price, fmv),
      });
    }
    return out;
  }, [allMarketItems, normalizedFavoriteById]);

  const favoritedMarket = useMemo(
    () => [...allMarketItems.filter((x) => !!normalizedFavoriteById[x.id]), ...synthesizedMarket],
    [normalizedFavoriteById, allMarketItems, synthesizedMarket]
  );
  const favoritedPacks = useMemo(() => allPackItems.filter((x) => !!normalizedFavoriteById[x.id]), [normalizedFavoriteById, allPackItems]);
  const favoritedTrades = useMemo(() => allTradeItems.filter((x) => !!normalizedFavoriteById[x.id]), [normalizedFavoriteById, allTradeItems]);

  useEffect(() => {
    if (favoritedTrades.length === 0) return;
    const gap = 16;
    const minCardWidth = 340;
    const maxCardWidth = 420;

    function computeColumns() {
      const el = tradeListRef.current;
      if (!el) return;
      const wvw = window.innerWidth;
      const isPhone = wvw <= 640;
      const isTabletOrPhone = wvw <= 1023;
      if (isPhone) {
        setTradeColumns((prev) => (prev === 1 ? prev : 1));
        return;
      }
      if (isTabletOrPhone) {
        setTradeColumns((prev) => (prev === 2 ? prev : 2));
        return;
      }

      const w = el.clientWidth;
      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (maxCardWidth + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (minCardWidth + gap)));
      const next = Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin));
      setTradeColumns((prev) => (prev === next ? prev : next));
    }

    computeColumns();
    const ro = new ResizeObserver(() => computeColumns());
    if (tradeListRef.current) ro.observe(tradeListRef.current);
    window.addEventListener("resize", computeColumns);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeColumns);
    };
  }, [favoritedTrades.length]);

  function toggleFavorite(id: string) {
    setFavoriteById((prev) => {
      const legacyId = `cp-${id}`;
      const wasFavorited = !!prev[id] || !!prev[legacyId];
      const next = { ...prev };
      delete next[legacyId];
      if (wasFavorited) delete next[id];
      else next[id] = true;
      writeFavorites(next);
      return next;
    });
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <div
              style={{
                display: "flex",
                flexShrink: 0,
                alignItems: "center",
                alignSelf: "stretch",
                justifyContent: "space-between",
                paddingTop: 4,
                paddingBottom: 4,
                gap: 16,
                flexWrap: "nowrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", width: "auto", minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ display: "flex", alignItems: "center", paddingRight: 1, paddingLeft: 1, overflow: "hidden" }}>
                  <img alt="" src="/cardx/placeholder.svg" style={{ width: 23, height: 24, overflow: "hidden" }} />
                </div>
                <h1
                  style={{
                    display: "flex",
                    alignItems: "center",
                    margin: "0 0 0 8px",
                    width: "auto",
                    height: 24,
                    lineHeight: "24px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    letterSpacing: "-0.36px",
                    color: "#111827",
                    fontFamily: 'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  收藏
                </h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "nowrap", justifyContent: "flex-end", flex: "0 0 auto", minWidth: 0, height: 38 }} />
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 16, width: "100%" }}>

            <section className={homeStyles.section} aria-label="收藏市集">
              <div className={homeStyles.header}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#6b7280", margin: 0 }}>市集</p>
              </div>
              {favoritedMarket.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 700 }}>尚未收藏任何市集商品</div>
              ) : (
                <div
                  ref={marketListRef}
                  className={homeStyles.frame12}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${marketColumns}, minmax(0, 1fr))`,
                    gap: 16,
                    justifyItems: "stretch",
                    alignItems: "stretch",
                    width: "100%",
                    overflow: "visible",
                    overflowX: "visible",
                    marginTop: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                >
                  {favoritedMarket.map((item) => (
                    <div
                      className={homeStyles.item4}
                      key={item.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/market/${item.detailId}`)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        router.push(`/market/${item.detailId}`);
                      }}
                      style={{ width: "100%", maxWidth: "none", flex: "unset", cursor: "pointer" }}
                    >
                      <div
                        className={homeStyles.rectangle2}
                        style={{
                          backgroundImage: `url(${item.imageUrl})`,
                          width: "100%",
                          height: "auto",
                          aspectRatio: "1 / 1",
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        <button
                          type="button"
                          className={homeStyles.favoriteButton}
                          aria-pressed
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
                          <p className={homeStyles.heading62225}>{formatTwd(item.price)}</p>
                          <div className={homeStyles.overlayBorder}>
                            <p className={homeStyles.fMv2730}>FMV {formatTwd(item.fmv)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={homeStyles.section} aria-label="收藏卡包">
              <div className={homeStyles.header}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#6b7280", margin: 0 }}>卡包</p>
              </div>
              {favoritedPacks.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 700 }}>尚未收藏任何卡包</div>
              ) : (
                <div
                  ref={packListRef}
                  className={homeStyles.frame12}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${packColumns}, minmax(0, 1fr))`,
                    gap: 16,
                    justifyItems: "stretch",
                    alignItems: "stretch",
                    width: "100%",
                    overflow: "visible",
                    overflowX: "visible",
                    marginTop: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                >
                  {favoritedPacks.map((item) => (
                    <div
                      className={homeStyles.item4}
                      key={item.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/packs/${item.routeId}`)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        router.push(`/packs/${item.routeId}`);
                      }}
                      style={{ width: "100%", maxWidth: "none", flex: "unset", cursor: "pointer" }}
                    >
                      <div
                        className={homeStyles.rectangle2}
                        style={{
                          backgroundImage: `url(${item.imageUrl})`,
                          width: "100%",
                          height: "auto",
                          aspectRatio: "1 / 1",
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        <button
                          type="button"
                          className={homeStyles.favoriteButton}
                          aria-pressed
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
                          <p className={homeStyles.heading62225}>
                            <span className={homeStyles.priceValue}>{formatTwd(item.price)}</span>
                            <span className={homeStyles.priceSep}> / </span>
                            <span className={homeStyles.priceUnit}>單抽</span>
                          </p>
                          <div className={homeStyles.overlayBorder}>
                            <p className={homeStyles.fMv2730}>{item.remaining}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {favoritedTrades.length > 0 ? (
              <section className={homeStyles.section} aria-label="收藏交換">
                <div className={homeStyles.header}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#6b7280", margin: 0 }}>交換</p>
                </div>
                <div
                  ref={tradeListRef}
                  className={homeStyles.frame12}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${tradeColumns}, minmax(0, 1fr))`,
                    gap: 16,
                    justifyItems: "stretch",
                    alignItems: "stretch",
                    width: "100%",
                    overflow: "visible",
                    overflowX: "visible",
                    marginTop: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                >
                  {favoritedTrades.map((item) => {
                    const getCount = 1 + (stableSeedFromString(`${item.id}_get`) % 4);
                    const loseCount = 1 + (stableSeedFromString(`${item.id}_lose`) % 4);
                    const getBase = [item.offerImageUrl, item.wantImageUrl].filter(Boolean);
                    const loseBase = [item.wantImageUrl, item.offerImageUrl].filter(Boolean);
                    const getImages =
                      getBase.length === 0 ? [] : Array.from({ length: getCount }, (_, idx) => getBase[idx % getBase.length]).slice(0, 4);
                    const loseImages =
                      loseBase.length === 0 ? [] : Array.from({ length: loseCount }, (_, idx) => loseBase[idx % loseBase.length]).slice(0, 4);
                    const getN = getImages.length;
                    const loseN = loseImages.length;
                    const gridClassFor = (n: number) =>
                      n === 1
                        ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridOne}`
                        : n === 2
                          ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridTwo}`
                          : n === 3
                            ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridThree}`
                            : `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridFour}`;
                    const tileClassFor = (n: number, idx: number) => {
                      if (n === 3) return idx === 2 ? `${homeStyles.tradeThumb} ${homeStyles.tradeThumbSpan2}` : homeStyles.tradeThumb;
                      return homeStyles.tradeThumb;
                    };
                    return (
                      <div
                        className={`${homeStyles.item4} ${homeStyles.tradeItem}`}
                        key={item.id}
                        style={{ width: "100%", maxWidth: "none", cursor: "pointer" }}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/trades/${item.routeId}`)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          router.push(`/trades/${item.routeId}`);
                        }}
                      >
                        <div className={homeStyles.tradeCard}>
                          <div className={homeStyles.tradeHeader}>
                            <div className={homeStyles.tradeHeaderLeft}>
                              <div className={homeStyles.tradeAvatar} aria-hidden="true" />
                              <div className={homeStyles.tradeHeaderText}>
                                <div className={homeStyles.tradeUserRow}>
                                  <span className={homeStyles.tradeUserHandle}>{item.user}</span>
                                </div>
                                <div className={homeStyles.tradeHeaderSub}>50+卡牌可交換</div>
                              </div>
                            </div>
                          <div className={homeStyles.tradeHeaderActions}>
                            <div className={homeStyles.tradeDeltaPill}>+ 18%</div>
                            <button
                              type="button"
                              className={homeStyles.tradeFavoriteButton}
                              aria-label="收藏"
                              aria-pressed={!!normalizedFavoriteById[item.id]}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(item.id);
                              }}
                            >
                              <HeartIcon />
                            </button>
                          </div>
                          </div>

                          <div className={homeStyles.tradeBody}>
                            <div className={homeStyles.tradeSide}>
                              <div className={homeStyles.tradeSideTitle}>你將獲得</div>
                              <div className={gridClassFor(getN)}>
                                {getImages.map((src, idx) => (
                                  <div key={`${item.id}_get_${idx}`} className={tileClassFor(getN, idx)}>
                                    <img alt="" className={homeStyles.tradeThumbImg} src={src} />
                                    <div className={homeStyles.tradeThumbOverlay}>PSA 10</div>
                                  </div>
                                ))}
                              </div>
                              <div className={homeStyles.tradeValueRow}>
                                <span>總價值約:</span>
                                <span>$20,000</span>
                              </div>
                            </div>

                            <svg className={homeStyles.tradeSwapIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M12 3C10.7839 3.00179 9.58073 3.25003 8.46322 3.72973C7.3457 4.20942 6.33699 4.91063 5.498 5.791L3.854 4.146C3.78407 4.07589 3.6949 4.02813 3.59779 4.00876C3.50068 3.9894 3.40001 3.9993 3.30854 4.03722C3.21706 4.07513 3.13891 4.13936 3.08398 4.22175C3.02905 4.30414 2.99982 4.40098 3 4.5V9C3 9.26522 3.10536 9.51957 3.29289 9.70711C3.48043 9.89464 3.73478 10 4 10H8.5C8.59902 10.0002 8.69586 9.97095 8.77825 9.91602C8.86064 9.86109 8.92487 9.78294 8.96279 9.69146C9.0007 9.59999 9.01061 9.49932 8.99124 9.40221C8.97187 9.3051 8.92411 9.21593 8.854 9.146L6.914 7.207C7.56678 6.51217 8.35461 5.95802 9.22919 5.57851C10.1038 5.199 11.0466 5.00214 12 5C13.7038 5.00118 15.3487 5.62372 16.6263 6.75093C17.9039 7.87815 18.7265 9.43263 18.94 11.123C18.9527 11.2561 18.9919 11.3853 19.0554 11.503C19.1189 11.6207 19.2053 11.7244 19.3096 11.8081C19.4139 11.8918 19.5339 11.9537 19.6626 11.9902C19.7912 12.0267 19.9258 12.037 20.0585 12.0206C20.1912 12.0041 20.3193 11.9612 20.4351 11.8944C20.5509 11.8276 20.6522 11.7383 20.7329 11.6316C20.8136 11.525 20.8721 11.4033 20.9049 11.2737C20.9377 11.1441 20.9442 11.0092 20.924 10.877C20.6485 8.70351 19.5905 6.70486 17.948 5.25503C16.3054 3.8052 14.1909 3.00352 12 3Z"
                                fill="currentColor"
                              />
                            </svg>

                            <div className={homeStyles.tradeSide}>
                              <div className={homeStyles.tradeSideTitle}>你將失去</div>
                              <div className={gridClassFor(loseN)}>
                                {loseImages.map((src, idx) => (
                                  <div key={`${item.id}_lose_${idx}`} className={tileClassFor(loseN, idx)}>
                                    <img alt="" className={homeStyles.tradeThumbImg} src={src} />
                                    <div className={homeStyles.tradeThumbOverlay}>PSA 10</div>
                                  </div>
                                ))}
                              </div>
                              <div className={homeStyles.tradeValueRow}>
                                <span>總價值約:</span>
                                <span>$27,000</span>
                              </div>
                            </div>
                          </div>

                          <div className={homeStyles.tradeFooter}>23分鐘前</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
