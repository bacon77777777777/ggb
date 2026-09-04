"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
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
const packImageUrl = "/cardx/placeholder.svg";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function stableSeedFromString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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

export default function PacksPage() {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("featured");
  const [vendorKey, setVendorKey] = useState<VendorKey>("all");
  const [columns, setColumns] = useState(5);
  const [visibleRows, setVisibleRows] = useState(4);
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryTrimmed = query.trim();
  const searchActive = queryTrimmed.length > 0;

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

  const items = useMemo(() => {
    const base = Array.from({ length: 120 }, (_, idx) => {
      const i = idx + 1;
      const imageUrl = packImageUrl;
      const game: VendorKey = (["pokemon", "onepiece", "yugioh", "basketball", "baseball", "comic", "other"] as VendorKey[])[
        idx % 7
      ]!;
      const seed = stableSeedFromString(`pack_${i}_${game}`);
      const price = 149 + (seed % 5) * 50;
      const remaining = 1 + (seed % 78);
      const total = 80;
      return {
        id: `pack_${String(i).padStart(3, "0")}`,
        title: `【卡包】${vendorOptions.find((x) => x.key === game)?.label ?? "卡包"}（隨機一抽）`,
        imageUrl,
        price,
        remaining: `${remaining}/${total}`,
        game,
        views: 2200 - idx * 13,
        createdAt: 2000000000 - idx * 1200,
      };
    });

    let filtered = base;
    if (vendorKey !== "all") filtered = filtered.filter((x) => x.game === vendorKey);
    const q = query.trim().toLowerCase();
    if (q) filtered = filtered.filter((x) => x.title.toLowerCase().includes(q));

    const sorted = [...filtered];
    if (sortKey === "latest") sorted.sort((a, b) => b.createdAt - a.createdAt);
    if (sortKey === "views") sorted.sort((a, b) => b.views - a.views);
    if (sortKey === "priceDesc") sorted.sort((a, b) => b.price - a.price);
    if (sortKey === "priceAsc") sorted.sort((a, b) => a.price - b.price);
    return sorted;
  }, [favoriteById, query, sortKey, vendorKey]);

  const visibleCount = useMemo(() => Math.min(items.length, visibleRows * columns), [items.length, visibleRows, columns]);

  useEffect(() => {
    function computeColumns() {
      if (typeof window === "undefined") return;
      if (window.innerWidth <= 1023) {
        setColumns(2);
        return;
      }
      const el = listRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const gap = 16;
      const minCardWidth = 220;
      const maxCardWidth = 280;
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
                  <img alt="" src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg" style={{ width: 23, height: 24, overflow: "hidden" }} />
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
                  卡包
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
                    aria-label="搜尋卡包"
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

            <section className={homeStyles.section} aria-label="卡包列表">
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
                    onClick={() => router.push(`/packs/${item.id}`)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      router.push(`/packs/${item.id}`);
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
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
