"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";

const FAVORITES_KEY = "cardx.favorites.byId";
const RECENTS_KEY = "cardx.recent.detailVisits";

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

type RecentVisit =
  | {
      kind: "market";
      id: string;
      ts: number;
      title: string;
      imageUrl: string;
      price: number;
      fmv: number;
    }
  | {
      kind: "packs";
      id: string;
      ts: number;
      title: string;
      imageUrl: string;
      price: number;
      remaining: string;
    }
  | {
      kind: "trades";
      id: string;
      ts: number;
      user: string;
      offerTitle: string;
      wantTitle: string;
      offerImageUrl: string;
      wantImageUrl: string;
    };

function readRecentVisits(): RecentVisit[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentVisit[];
  } catch {
    return [];
  }
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

export default function RecentPage() {
  const router = useRouter();
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
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
    window.setTimeout(() => setRecentVisits(readRecentVisits()), 0);
  }, []);

  useEffect(() => {
    function sync() {
      setFavoriteById(readFavorites());
      setRecentVisits(readRecentVisits());
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== FAVORITES_KEY && e.key !== RECENTS_KEY) return;
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

      const tradeEl = tradeListRef.current;
      if (!tradeEl) return;
      const gap = 16;
      const wvw = window.innerWidth;
      if (wvw <= 640) {
        setTradeColumns((prev) => (prev === 1 ? prev : 1));
        return;
      }
      if (wvw <= 1023) {
        setTradeColumns((prev) => (prev === 2 ? prev : 2));
        return;
      }
      const minCardWidth = 340;
      const maxCardWidth = 420;
      const w = tradeEl.clientWidth;
      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (maxCardWidth + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (minCardWidth + gap)));
      const next = Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin));
      setTradeColumns((prev) => (prev === next ? prev : next));
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

  const todayStartMs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const todayVisits = useMemo(() => recentVisits.filter((x) => typeof x?.ts === "number" && x.ts >= todayStartMs), [recentVisits, todayStartMs]);

  const recentMarket = useMemo(() => {
    const seen = new Set<string>();
    const out: MarketItem[] = [];
    for (const v of todayVisits) {
      if (!v || typeof v !== "object" || v.kind !== "market") continue;
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      out.push({
        id: v.id,
        detailId: v.id,
        title: v.title,
        imageUrl: v.imageUrl,
        price: v.price,
        fmv: v.fmv,
      });
    }
    return out;
  }, [todayVisits]);

  const recentPacks = useMemo(() => {
    const seen = new Set<string>();
    const out: PackItem[] = [];
    for (const v of todayVisits) {
      if (!v || typeof v !== "object" || v.kind !== "packs") continue;
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      out.push({
        id: v.id,
        routeId: v.id,
        title: v.title,
        imageUrl: v.imageUrl,
        price: v.price,
        remaining: v.remaining,
      });
    }
    return out;
  }, [todayVisits]);

  const recentTrades = useMemo(() => {
    const seen = new Set<string>();
    const out: TradeItem[] = [];
    for (const v of todayVisits) {
      if (!v || typeof v !== "object" || v.kind !== "trades") continue;
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      out.push({
        id: v.id,
        routeId: v.id,
        user: v.user,
        offerTitle: v.offerTitle,
        wantTitle: v.wantTitle,
        offerImageUrl: v.offerImageUrl,
        wantImageUrl: v.wantImageUrl,
      });
    }
    return out;
  }, [todayVisits]);

  function toggleFavorite(id: string) {
    setFavoriteById((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
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
                    color: "#ffffff",
                    fontFamily: 'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  近期
                </h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "nowrap", justifyContent: "flex-end", flex: "0 0 auto", minWidth: 0, height: 38 }} />
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 16, width: "100%" }}>
              {recentMarket.length > 0 ? (
                <section className={homeStyles.section} aria-label="近期市集">
                  <div className={homeStyles.header}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.62)", margin: 0 }}>市集</p>
                  </div>
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
                    {recentMarket.map((item) => (
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
                            backgroundImage: "url(/cardx/placeholder.svg)",
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
                            aria-label="收藏"
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
                            <p className={homeStyles.heading62225}>{formatTwd(item.price)}</p>
                            <div className={homeStyles.overlayBorder}>
                              <p className={homeStyles.fMv2730}>FMV {formatTwd(item.fmv)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {recentPacks.length > 0 ? (
                <section className={homeStyles.section} aria-label="近期卡包">
                  <div className={homeStyles.header}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.62)", margin: 0 }}>卡包</p>
                  </div>
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
                    {recentPacks.map((item) => (
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
                            backgroundImage: "url(/cardx/placeholder.svg)",
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
                            aria-label="收藏"
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
                </section>
              ) : null}

              {recentTrades.length > 0 ? (
                <section className={homeStyles.section} aria-label="近期交換">
                  <div className={homeStyles.header}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.62)", margin: 0 }}>交換</p>
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
                    {recentTrades.map((item) => {
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
                        key={item.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/trades/${item.routeId}`)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          router.push(`/trades/${item.routeId}`);
                        }}
                        style={{ cursor: "pointer", width: "100%" }}
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
                              aria-pressed={!!favoriteById[item.id]}
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
                                    <img alt="" className={homeStyles.tradeThumbImg} src="/cardx/placeholder.svg" />
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
                                    <img alt="" className={homeStyles.tradeThumbImg} src="/cardx/placeholder.svg" />
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
