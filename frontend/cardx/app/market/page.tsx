"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import { mockMarketListings } from "@/cardx/lib/mock/home";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { FilterIcon, PillSelect, VendorIcon } from "@/cardx/components/ui/PillSelect";

type SortKey = "featured" | "latest" | "views" | "grade" | "priceDesc" | "priceAsc";
type VendorKey = "all" | "pokemon" | "onepiece" | "yugioh" | "basketball" | "baseball" | "comic" | "other";

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "featured", label: "精選" },
  { key: "latest", label: "最新" },
  { key: "views", label: "最多人瀏覽" },
  { key: "grade", label: "鑑定等級" },
  { key: "priceDesc", label: "價格由高到低" },
  { key: "priceAsc", label: "價格由低到高" },
];

const vendorOptions: Array<{ key: VendorKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pokemon", label: "寶可夢" },
  { key: "onepiece", label: "海賊王" },
  { key: "yugioh", label: "遊戲王" },
  { key: "basketball", label: "籃球" },
  { key: "baseball", label: "棒球" },
  { key: "comic", label: "漫畫" },
  { key: "other", label: "其他" },
];

const FAVORITES_KEY = "cardx.favorites.byId";
const cardImages = Array.from({ length: 11 }, () => "/cardx/placeholder.svg");

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M10.5 3a7.5 7.5 0 1 0 4.64 13.4l4.23 4.23a1 1 0 0 0 1.41-1.41l-4.23-4.23A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"
        fill="currentColor"
        opacity="0.92"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function MarketPage() {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("featured");
  const [vendorKey, setVendorKey] = useState<VendorKey>("all");
  const [query, setQuery] = useState("");
  const [columns, setColumns] = useState(5);
  const [restoreState] = useState<{ y: number; rows: number } | null>(() => {
    try {
      const rawY = window.sessionStorage.getItem("cardx.market.scrollY");
      if (!rawY) return null;
      const y = Number(rawY);
      if (!Number.isFinite(y)) return null;
      const rows = Math.max(4, Number(window.sessionStorage.getItem("cardx.market.visibleRows") ?? 4));
      return { y, rows };
    } catch {
      return null;
    }
  });
  const [visibleRows, setVisibleRows] = useState(() => Math.max(4, restoreState?.rows ?? 4));
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<{ y: number } | null>(restoreState ? { y: restoreState.y } : null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryTrimmed = query.trim();
  const searchActive = queryTrimmed.length > 0;

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("cardx.market.prefill.vendorKey");
      if (!raw) return;
      const v = raw.trim();
      const ok = vendorOptions.some((x) => x.key === v);
      if (!ok) return;
      window.sessionStorage.removeItem("cardx.market.prefill.vendorKey");
      window.setTimeout(() => setVendorKey(v as VendorKey), 0);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) {
        window.setTimeout(() => setFavoriteById({}), 0);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        window.setTimeout(() => setFavoriteById({}), 0);
        return;
      }
      window.setTimeout(() => setFavoriteById(parsed as Record<string, boolean>), 0);
    } catch {}
  }, []);

  useEffect(() => {
    function sync() {
      try {
        const raw = window.localStorage.getItem(FAVORITES_KEY);
        if (!raw) {
          setFavoriteById({});
          return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          setFavoriteById({});
          return;
        }
        setFavoriteById(parsed as Record<string, boolean>);
      } catch {
        setFavoriteById({});
      }
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

  const formatTwd = useMemo(() => {
    const formatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
    return (value: number) => formatter.format(Math.round(value));
  }, []);

  const baseItems = useMemo(() => {
    return mockMarketListings.map((x, idx) => {
      const grade = idx === 0 ? 9.0 : 10 - ((idx + 3) % 10) * 0.5;
      const views = 1200 - idx * 83;
      return { ...x, grade, views };
    });
  }, []);

  const items = useMemo(() => {
    const inflated = Array.from({ length: 120 }, (_, i) => {
      const base = baseItems[i % baseItems.length];
      const price = Math.max(50, base.price.amount + (i % 11) * 35 - ((i % 4) + 1) * 18);
      const fmv = Math.max(price, (base.fmv?.amount ?? Math.round(base.price.amount * 1.15)) + (i % 9) * 22);
      return {
        ...base,
        id: `${base.id}_${String(i).padStart(3, "0")}`,
        views: base.views + i * 17,
        grade: Math.max(0, Math.min(10, base.grade + (i % 6) * 0.5 - 1)),
        imageUrl: cardImages[i % cardImages.length],
        price: { ...base.price, amount: price },
        fmv: { amount: fmv, currency: base.price.currency },
      };
    });

    let filtered = inflated.filter((x) => {
      if (vendorKey === "all") return true;
      if (vendorKey === "basketball" || vendorKey === "baseball") return x.game === "sports";
      return x.game === vendorKey;
    });

    const q = queryTrimmed.toLowerCase();
    if (q) filtered = filtered.filter((x) => (x.title ?? "").toLowerCase().includes(q));

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "priceDesc") return (b.price.amount ?? 0) - (a.price.amount ?? 0);
      if (sortKey === "priceAsc") return (a.price.amount ?? 0) - (b.price.amount ?? 0);
      if (sortKey === "views") return (b.views ?? 0) - (a.views ?? 0);
      if (sortKey === "grade") return (b.grade ?? 0) - (a.grade ?? 0);
      if (sortKey === "latest") return b.id.localeCompare(a.id);
      return a.id.localeCompare(b.id);
    });

    return sorted.map((x) => ({
      id: x.id,
      detailId: x.id.replace(/_\d{3}$/, ""),
      title: x.title,
      imageUrl: x.imageUrl,
      price: x.price.amount,
      fmv: x.fmv?.amount ?? Math.round(x.price.amount * 1.15),
    }));
  }, [baseItems, queryTrimmed, sortKey, vendorKey]);

  const visibleCount = Math.min(items.length, visibleRows * columns);

  useEffect(() => {
    let raf = 0;
    let tries = 0;
    function attempt() {
      const restore = restoreRef.current;
      if (!restore) return;
      tries += 1;
      const scrollHeight = document.documentElement.scrollHeight;
      if (scrollHeight >= restore.y + window.innerHeight - 20 || tries > 24) {
        window.scrollTo(0, restore.y);
        restoreRef.current = null;
        try {
          window.sessionStorage.removeItem("cardx.market.scrollY");
          window.sessionStorage.removeItem("cardx.market.visibleRows");
        } catch {}
        return;
      }
      raf = window.requestAnimationFrame(attempt);
    }

    raf = window.requestAnimationFrame(attempt);
    return () => window.cancelAnimationFrame(raf);
  }, [visibleRows, columns]);

  function rememberMarketScroll() {
    try {
      window.sessionStorage.setItem("cardx.market.scrollY", String(window.scrollY));
      window.sessionStorage.setItem("cardx.market.visibleRows", String(visibleRows));
    } catch {}
  }

  useEffect(() => {
    const gap = 16;
    const minCardWidth = 220;
    const maxCardWidth = 280;

    function computeColumns() {
      const el = listRef.current;
      if (!el) return;
      const isMobile = window.innerWidth <= 1023;
      if (isMobile) {
        setColumns((prev) => (prev === 2 ? prev : 2));
        return;
      }

      const w = el.clientWidth;
      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (maxCardWidth + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (minCardWidth + gap)));
      const next = Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin));
      setColumns((prev) => (prev === next ? prev : next));
    }

    computeColumns();
    const ro = new ResizeObserver(() => computeColumns());
    if (listRef.current) ro.observe(listRef.current);
    window.addEventListener("resize", computeColumns);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeColumns);
    };
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        setVisibleRows((rows) => {
          const maxRows = Math.ceil(items.length / columns);
          return Math.min(rows + 2, maxRows);
        });
      },
      { rootMargin: "300px 0px" }
    );

    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [items.length, columns]);

  function toggleFavorite(id: string) {
    setFavoriteById((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
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
                <div
                  style={{ display: "flex", alignItems: "center", paddingRight: 1, paddingLeft: 1, overflow: "hidden" }}
                >
                  <img
                    alt=""
                    src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg"
                    style={{ width: 23, height: 24, overflow: "hidden" }}
                  />
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
                    fontFamily:
                      'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  市集
                </h1>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "nowrap",
                  justifyContent: "flex-end",
                  flex: "0 0 auto",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    flex: "0 0 auto",
                    width: "clamp(160px, 18vw, 220px)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "rgba(255, 255, 255, 0.65)",
                      pointerEvents: "none",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <SearchIcon />
                  </div>

                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="搜尋市集"
                    placeholder="輸入關鍵字"
                    style={{
                      width: "100%",
                      height: 38,
                      borderRadius: 12,
                      border: 0,
                      background: "rgba(255, 255, 255, 0.06)",
                      color: "rgba(255, 255, 255, 0.92)",
                      padding: searchActive ? "0 40px 0 40px" : "0 14px 0 40px",
                      fontSize: 14,
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />

                  {searchActive ? (
                    <button
                      type="button"
                      aria-label="清除搜尋"
                      onClick={() => {
                        setQuery("");
                        inputRef.current?.focus();
                      }}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 28,
                        height: 28,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 10,
                        border: 0,
                        background: "rgba(0, 0, 0, 0.12)",
                        color: "rgba(255, 255, 255, 0.75)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <XIcon />
                    </button>
                  ) : null}
                </div>
                <PillSelect
                  value={sortKey}
                  onChange={(next) => {
                    setSortKey(next);
                    setVisibleRows(4);
                  }}
                  options={sortOptions}
                  ariaLabel="功能"
                  icon={<FilterIcon />}
                  borderless
                />
                <PillSelect
                  value={vendorKey}
                  onChange={(next) => {
                    setVendorKey(next);
                    setVisibleRows(4);
                  }}
                  options={vendorOptions}
                  ariaLabel="供應商"
                  icon={<VendorIcon />}
                  borderless
                />
              </div>
            </div>

            <section className={homeStyles.section} aria-label="市集列表">
              <div
                ref={listRef}
                className={homeStyles.frame12}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
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
                {items.slice(0, visibleCount).map((item) => (
                  <div
                    className={homeStyles.item4}
                    key={item.id}
                    role="link"
                    tabIndex={0}
                      onClick={() => {
                        rememberMarketScroll();
                        router.push(`/market/${item.detailId}`);
                      }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                        rememberMarketScroll();
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
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
