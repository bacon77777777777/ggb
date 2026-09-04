"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { FilterIcon, PillSelect, VendorIcon } from "@/cardx/components/ui/PillSelect";

type SortKey = "featured" | "latest" | "views" | "grade" | "priceDesc" | "priceAsc";
type VendorKey = "all" | "pokemon" | "onepiece" | "yugioh" | "basketball" | "baseball" | "comic" | "other";
type SearchTab = "offer" | "want";

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
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zm6.2-1.1L21 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
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

type TradeItem = {
  id: string;
  offerTitle: string;
  wantTitle: string;
  offerImageUrl: string;
  wantImageUrl: string;
  user: string;
  game: VendorKey;
  views: number;
  createdAt: number;
  value: number;
  grade: number;
};

const baseTradeItems: Array<Omit<TradeItem, "id" | "game" | "views" | "createdAt" | "value" | "grade">> = [
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

type MyTradeStatus = "chatting" | "matching" | "completed" | "cancelled";
type MyTradeRecord = {
  tradeId: string;
  status: MyTradeStatus;
  updatedAtIso: string;
  title?: string;
  offerSummary?: string;
  wantSummary?: string;
};

const MY_TRADES_KEY = "cardx.trades.my.v1";

function parseMyTrades(raw: string | null): MyTradeRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cleaned: MyTradeRecord[] = [];
    for (const x of parsed) {
      if (!x || typeof x !== "object") continue;
      const rec = x as Record<string, unknown>;
      const tradeId = typeof rec.tradeId === "string" ? rec.tradeId : "";
      if (!tradeId) continue;
      const status: MyTradeStatus =
        rec.status === "chatting" || rec.status === "matching" || rec.status === "completed" || rec.status === "cancelled"
          ? rec.status
          : "chatting";
      cleaned.push({
        tradeId,
        status,
        updatedAtIso: typeof rec.updatedAtIso === "string" ? rec.updatedAtIso : new Date().toISOString(),
        title: typeof rec.title === "string" ? rec.title : undefined,
        offerSummary: typeof rec.offerSummary === "string" ? rec.offerSummary : undefined,
        wantSummary: typeof rec.wantSummary === "string" ? rec.wantSummary : undefined,
      });
    }
    return cleaned;
  } catch {
    return [];
  }
}

function myTradeStatusMeta(status: MyTradeStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case "matching":
      return { label: "配對中", color: "rgba(120,200,255,0.95)", bg: "rgba(34,131,246,0.16)" };
    case "chatting":
      return { label: "私聊中", color: "rgba(140,235,180,0.95)", bg: "rgba(46,204,113,0.14)" };
    case "completed":
      return { label: "已完成", color: "rgba(255,255,255,0.82)", bg: "rgba(255,255,255,0.10)" };
    case "cancelled":
    default:
      return { label: "已取消", color: "rgba(255,150,160,0.92)", bg: "rgba(237,29,73,0.14)" };
  }
}

function formatMyTradeTime(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TradesPage() {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("featured");
  const [vendorKey, setVendorKey] = useState<VendorKey>("all");
  const [query, setQuery] = useState("");
  const [searchTab, setSearchTab] = useState<SearchTab>("offer");
  const [columns, setColumns] = useState(4);
  const [visibleRows, setVisibleRows] = useState(4);
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
  const [myTrades, setMyTrades] = useState<MyTradeRecord[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const queryTrimmed = query.trim();
  const searchActive = queryTrimmed.length > 0;
  useEffect(() => {
    if (!searchActive) return;
    window.setTimeout(() => setSearchTab("offer"), 0);
  }, [searchActive]);

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

  useEffect(() => {
    function sync() {
      try {
        setMyTrades(parseMyTrades(window.localStorage.getItem(MY_TRADES_KEY)));
      } catch {
        setMyTrades([]);
      }
    }
    window.setTimeout(sync, 0);
    function onStorage(e: StorageEvent) {
      if (e.key !== MY_TRADES_KEY) return;
      sync();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);

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

  useEffect(() => {
    const gap = 16;
    const minCardWidth = 340;
    const maxCardWidth = 420;

    function computeColumns() {
      const el = listRef.current;
      if (!el) return;
      const wvw = window.innerWidth;
      const isPhone = wvw <= 640;
      const isTabletOrPhone = wvw <= 1023;
      if (isPhone) {
        setColumns((prev) => (prev === 1 ? prev : 1));
        return;
      }
      if (isTabletOrPhone) {
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

  const allItems = useMemo(() => {
    const games: VendorKey[] = ["pokemon", "onepiece", "yugioh", "basketball", "baseball", "comic", "other"];
    return Array.from({ length: 120 }, (_, idx): TradeItem => {
      const base = baseTradeItems[idx % baseTradeItems.length]!;
      const game = games[idx % games.length]!;
      const seed = stableSeedFromString(`${idx}_${base.offerTitle}_${base.wantTitle}_${game}`);
      const views = 2600 - idx * 11 + (seed % 150);
      const createdAt = 2000000000 - idx * 900;
      const value = 200 + (seed % 12) * 45;
      const grade = 6 + (seed % 9) * 0.5;
      return {
        ...base,
        id: `trade_${String(idx + 1).padStart(3, "0")}`,
        game,
        views,
        createdAt,
        value,
        grade,
      };
    });
  }, []);

  const vendorFiltered = useMemo(() => {
    if (vendorKey === "all") return allItems;
    return allItems.filter((x) => x.game === vendorKey);
  }, [allItems, vendorKey]);

  const offerCount = useMemo(() => {
    if (!searchActive) return 0;
    const q = queryTrimmed.toLowerCase();
    return vendorFiltered.filter((x) => x.offerTitle.toLowerCase().includes(q)).length;
  }, [queryTrimmed, searchActive, vendorFiltered]);

  const wantCount = useMemo(() => {
    if (!searchActive) return 0;
    const q = queryTrimmed.toLowerCase();
    return vendorFiltered.filter((x) => x.wantTitle.toLowerCase().includes(q)).length;
  }, [queryTrimmed, searchActive, vendorFiltered]);

  const items = useMemo(() => {
    let filtered = vendorFiltered;
    if (searchActive) {
      const q = queryTrimmed.toLowerCase();
      filtered = vendorFiltered.filter((x) => {
        const offer = x.offerTitle.toLowerCase();
        const want = x.wantTitle.toLowerCase();
        return searchTab === "offer" ? offer.includes(q) : want.includes(q);
      });
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "priceDesc") return b.value - a.value;
      if (sortKey === "priceAsc") return a.value - b.value;
      if (sortKey === "views") return b.views - a.views;
      if (sortKey === "grade") return b.grade - a.grade;
      if (sortKey === "latest") return b.createdAt - a.createdAt;
      return a.id.localeCompare(b.id);
    });

    return sorted;
  }, [queryTrimmed, searchActive, searchTab, sortKey, vendorFiltered]);

  const visibleCount = Math.min(items.length, visibleRows * columns);

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

  useEffect(() => {
    window.setTimeout(() => setVisibleRows(4), 0);
  }, [sortKey, vendorKey, queryTrimmed, searchTab]);

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
                  交換
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
                <button
                  className="button-3d button-3d_blue button-3d_sm"
                  data-v-c8c96dbe=""
                  type="button"
                  onClick={() => router.push("/trades/new")}
                  style={{ borderRadius: 8, whiteSpace: "nowrap", flex: "0 0 auto" }}
                >
                  <span className="button-3d__outer" data-v-c8c96dbe="">
                    <span className="button-3d__inner" data-v-c8c96dbe="">
                      <span className="button-3d__text" data-v-c8c96dbe="">
                        建立交換
                      </span>
                    </span>
                  </span>
                </button>

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
                    aria-label="搜尋卡牌"
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
                  onChange={(next) => setSortKey(next)}
                  options={sortOptions}
                  ariaLabel="功能"
                  icon={<FilterIcon />}
                  borderless
                />
                <PillSelect
                  value={vendorKey}
                  onChange={(next) => setVendorKey(next)}
                  options={vendorOptions}
                  ariaLabel="供應商"
                  icon={<VendorIcon />}
                  borderless
                />
              </div>
            </div>

            {searchActive ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 10,
                  marginBottom: 2,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 14,
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: "rgba(255, 255, 255, 0.04)",
                    padding: 4,
                    gap: 4,
                  }}
                >
                  {searchTab === "offer" ? (
                    <button
                      className="button-3d button-3d_red button-3d_sm"
                      data-v-c8c96dbe=""
                      type="button"
                      onClick={() => setSearchTab("offer")}
                      style={{ borderRadius: 8, whiteSpace: "nowrap" }}
                    >
                      <span className="button-3d__outer" data-v-c8c96dbe="">
                        <span className="button-3d__inner" data-v-c8c96dbe="">
                          <span className="button-3d__text" data-v-c8c96dbe="">
                            尋找卡牌 ({offerCount})
                          </span>
                        </span>
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSearchTab("offer")}
                      style={{
                        height: 33,
                        padding: "0 12px",
                        borderRadius: 12,
                        border: "1px solid transparent",
                        background: "transparent",
                        color: "rgba(255, 255, 255, 0.92)",
                        fontSize: 13,
                        fontWeight: 850,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      尋找卡牌 ({offerCount})
                    </button>
                  )}

                  {searchTab === "want" ? (
                    <button
                      className="button-3d button-3d_red button-3d_sm"
                      data-v-c8c96dbe=""
                      type="button"
                      onClick={() => setSearchTab("want")}
                      style={{ borderRadius: 8, whiteSpace: "nowrap" }}
                    >
                      <span className="button-3d__outer" data-v-c8c96dbe="">
                        <span className="button-3d__inner" data-v-c8c96dbe="">
                          <span className="button-3d__text" data-v-c8c96dbe="">
                            其他人在找 ({wantCount})
                          </span>
                        </span>
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSearchTab("want")}
                      style={{
                        height: 33,
                        padding: "0 12px",
                        borderRadius: 12,
                        border: "1px solid transparent",
                        background: "transparent",
                        color: "rgba(255, 255, 255, 0.92)",
                        fontSize: 13,
                        fontWeight: 850,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      其他人在找 ({wantCount})
                    </button>
                  )}
                </div>
                <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                  搜尋：{queryTrimmed}
                </div>
              </div>
            ) : null}

            <section aria-label="我的提案" style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)", letterSpacing: "0.02em" }}>我的提案</div>
                {myTrades.length > 0 ? (
                  <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>{myTrades.length} 筆</div>
                ) : null}
              </div>

              {myTrades.length === 0 ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    border: "1px dashed rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.03)",
                    padding: "16px 14px",
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  尚未建立任何交換提案，點擊右上角「建立交換」發起你的第一筆交換。
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 12,
                  }}
                >
                  {myTrades.map((t) => {
                    const meta = myTradeStatusMeta(t.status);
                    return (
                      <Link
                        key={t.tradeId}
                        href={`/trades/${t.tradeId}`}
                        style={{
                          display: "grid",
                          gap: 8,
                          textDecoration: "none",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          padding: "12px 14px",
                          minWidth: 0,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 950,
                              color: "rgba(255,255,255,0.94)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                          >
                            {t.title || t.tradeId}
                          </div>
                          <span
                            style={{
                              flex: "0 0 auto",
                              fontSize: 11,
                              fontWeight: 900,
                              color: meta.color,
                              background: meta.bg,
                              borderRadius: 999,
                              padding: "3px 10px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "rgba(255,255,255,0.68)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          我有：{t.offerSummary || "—"} · 想要：{t.wantSummary || "—"}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.48)" }}>{formatMyTradeTime(t.updatedAtIso)}</div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={homeStyles.section} aria-label="交換列表">
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
                    className={`${homeStyles.item4} ${homeStyles.tradeItem}`}
                    key={item.id}
                    style={{ width: "100%", maxWidth: "none", cursor: "pointer" }}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/trades/${item.id}`)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      router.push(`/trades/${item.id}`);
                    }}
                  >
                    <div
                      className={homeStyles.tradeCard}
                    >
                      <div className={homeStyles.tradeHeader}>
                        <div className={homeStyles.tradeHeaderLeft}>
                          <div className={homeStyles.tradeAvatar} aria-hidden="true" />
                          <div className={homeStyles.tradeHeaderText}>
                            <div className={homeStyles.tradeUserRow}>
                              <span className={homeStyles.tradeUserHandle}>{item.user}</span>
                              <svg className={homeStyles.tradeVerifiedIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path
                                  d="M6.97917 3.62H6.96917C6.21667 3.62 5.63833 3.62 5.19 3.68C4.73583 3.74083 4.39583 3.86583 4.13083 4.13C3.86583 4.39417 3.74083 4.73583 3.68083 5.19C3.62 5.63833 3.62 6.21667 3.62 6.96917V6.97917C3.62 7.20333 3.6175 7.27917 3.59 7.345C3.5625 7.41083 3.51083 7.46583 3.3525 7.62417L3.345 7.6325C2.81333 8.16417 2.40417 8.5725 2.13 8.9325C1.8525 9.29667 1.7 9.62583 1.7 9.99917C1.7 10.3742 1.8525 10.7033 2.13 11.0675C2.405 11.4275 2.81333 11.8358 3.345 12.3675L3.3525 12.3758C3.51083 12.5342 3.5625 12.5883 3.59 12.655C3.6175 12.7217 3.62 12.7967 3.62 13.0208V13.0308C3.62 13.7833 3.62 14.3617 3.68 14.81C3.74083 15.2642 3.86583 15.6042 4.13083 15.8683C4.39583 16.1325 4.73583 16.2583 5.19 16.32C5.63833 16.38 6.21667 16.38 6.96917 16.38H6.97917C7.20333 16.38 7.27917 16.3825 7.345 16.41C7.41083 16.4375 7.46583 16.4892 7.62417 16.6475L7.6325 16.655C8.16417 17.1867 8.5725 17.595 8.9325 17.87C9.29667 18.1475 9.62583 18.3 10 18.3C10.375 18.3 10.7033 18.1475 11.0675 17.87C11.4275 17.595 11.8358 17.1867 12.3675 16.655L12.3758 16.6467C12.5342 16.4883 12.5892 16.4375 12.655 16.41C12.7208 16.3825 12.7967 16.38 13.0208 16.38H13.0308C13.7833 16.38 14.3617 16.38 14.81 16.32C15.2642 16.2592 15.6042 16.1333 15.8692 15.8692C16.1342 15.605 16.2592 15.2642 16.3192 14.81C16.38 14.3617 16.38 13.7833 16.38 13.0308V13.0208C16.38 12.7967 16.3825 12.7208 16.41 12.655C16.4375 12.5892 16.4892 12.5333 16.6475 12.375L16.655 12.3683C17.1867 11.8358 17.5958 11.4267 17.87 11.0683C18.1475 10.7033 18.3 10.3742 18.3 10C18.3 9.62583 18.1475 9.29667 17.87 8.9325C17.595 8.5725 17.1867 8.16417 16.655 7.6325L16.6475 7.62417C16.4892 7.46583 16.4375 7.41083 16.41 7.345C16.3825 7.27917 16.38 7.20333 16.38 6.97833V6.96917C16.38 6.21667 16.38 5.63833 16.32 5.19C16.2592 4.73583 16.1342 4.395 15.8692 4.13083C15.6042 3.86583 15.2642 3.74083 14.81 3.68C14.3617 3.62 13.7833 3.62 13.0308 3.62H13.0208C12.7967 3.62 12.7208 3.6175 12.655 3.59C12.5892 3.5625 12.5333 3.51083 12.3758 3.3525L12.3675 3.345C11.8358 2.81333 11.4275 2.40417 11.0683 2.13C10.7033 1.8525 10.3742 1.7 10 1.7C9.62583 1.7 9.29667 1.8525 8.9325 2.13C8.5725 2.405 8.16417 2.81333 7.6325 3.345L7.62417 3.3525C7.46583 3.51083 7.41083 3.5625 7.345 3.59C7.27917 3.6175 7.20333 3.62 6.97917 3.62ZM8.1725 13.6425C7.93 13.44 7.8975 13.08 8.1 12.8375L10.3 10.1975C10.3902 10.0888 10.5205 10.0212 10.662 10.01C10.8035 9.99876 10.9428 10.0448 11.05 10.1375L11.8775 10.845L13.8375 8.395C14.035 8.1475 14.395 8.1075 14.6425 8.305C14.89 8.5025 14.93 8.8625 14.7325 9.11L12.4025 12.0225C12.3155 12.1315 12.1887 12.2 12.05 12.2133C11.9114 12.2267 11.7738 12.1838 11.6675 12.095L10.8525 11.395L8.9775 13.6425C8.775 13.885 8.415 13.9158 8.1725 13.6425Z"
                                  fill="#1D9BF0"
                                  fillRule="evenodd"
                                  clipRule="evenodd"
                                />
                              </svg>
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
                          {(() => {
                            const getCount = 1 + (stableSeedFromString(`${item.id}_get`) % 4);
                            const base = [item.offerImageUrl, item.wantImageUrl].filter(Boolean);
                            const getImages =
                              base.length === 0 ? [] : Array.from({ length: getCount }, (_, idx) => base[idx % base.length]).slice(0, 4);
                            const n = getImages.length;
                            const gridClass =
                              n === 1
                                ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridOne}`
                                : n === 2
                                  ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridTwo}`
                                  : n === 3
                                    ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridThree}`
                                    : `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridFour}`;
                            const tileClassFor = (idx: number) => {
                              if (n === 3)
                                return idx === 2
                                  ? `${homeStyles.tradeThumb} ${homeStyles.tradeThumbSpan2}`
                                  : homeStyles.tradeThumb;
                              return homeStyles.tradeThumb;
                            };
                            return (
                              <div className={gridClass}>
                                {getImages.map((src, idx) => (
                                  <div key={`${item.id}_get_${idx}`} className={tileClassFor(idx)}>
                                    <img alt="" className={homeStyles.tradeThumbImg} src={src} />
                                    <div className={homeStyles.tradeThumbOverlay}>PSA 10</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                          <div className={homeStyles.tradeValueRow}>
                            <span>總價值約:</span>
                            <span>$20,000</span>
                          </div>
                        </div>

                        <svg className={homeStyles.tradeSwapIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M12 3C10.7839 3.00179 9.58073 3.25003 8.46322 3.72973C7.3457 4.20942 6.33699 4.91063 5.498 5.791L3.854 4.146C3.78407 4.07589 3.6949 4.02813 3.59779 4.00876C3.50068 3.9894 3.40001 3.9993 3.30854 4.03722C3.21706 4.07513 3.13891 4.13936 3.08398 4.22175C3.02905 4.30414 2.99982 4.40098 3 4.5V9C3 9.26522 3.10536 9.51957 3.29289 9.70711C3.48043 9.89464 3.73478 10 4 10H8.5C8.59902 10.0002 8.69586 9.97095 8.77825 9.91602C8.86064 9.86109 8.92487 9.78294 8.96279 9.69146C9.0007 9.59999 9.01061 9.49932 8.99124 9.40221C8.97187 9.3051 8.92411 9.21593 8.854 9.146L6.914 7.207C7.56678 6.51217 8.35461 5.95802 9.22919 5.57851C10.1038 5.199 11.0466 5.00214 12 5C13.7038 5.00118 15.3487 5.62372 16.6263 6.75093C17.9039 7.87815 18.7265 9.43263 18.94 11.123C18.9527 11.2561 18.9919 11.3853 19.0554 11.503C19.1189 11.6207 19.2053 11.7244 19.3096 11.8081C19.4139 11.8918 19.5339 11.9537 19.6626 11.9902C19.7912 12.0267 19.9258 12.037 20.0585 12.0206C20.1912 12.0041 20.3193 11.9612 20.4351 11.8944C20.5509 11.8276 20.6522 11.7383 20.7329 11.6316C20.8136 11.525 20.8721 11.4033 20.9049 11.2737C20.9377 11.1441 20.9442 11.0092 20.924 10.877C20.6485 8.70351 19.5905 6.70486 17.948 5.25503C16.3054 3.8052 14.1909 3.00352 12 3ZM3.945 12.008C3.68195 12.0407 3.44266 12.1765 3.27971 12.3856C3.11676 12.5947 3.04349 12.8599 3.076 13.123C3.3515 15.2965 4.4095 17.2951 6.05204 18.745C7.69459 20.1948 9.80912 20.9965 12 21C13.2166 21.0018 14.4206 20.7549 15.5384 20.2746C16.6561 19.7944 17.6639 19.0908 18.5 18.207L20.146 19.853C20.2159 19.923 20.3049 19.9708 20.402 19.9902C20.499 20.0096 20.5996 19.9998 20.691 19.962C20.7824 19.9242 20.8606 19.8601 20.9156 19.7779C20.9706 19.6956 21 19.5989 21 19.5V15C21 14.7348 20.8946 14.4804 20.7071 14.2929C20.5196 14.1054 20.2652 14 20 14H15.5C15.401 13.9998 15.3041 14.0291 15.2217 14.084C15.1394 14.1389 15.0751 14.2171 15.0372 14.3085C14.9993 14.4 14.9894 14.5007 15.0088 14.5978C15.0281 14.6949 15.0759 14.7841 15.146 14.854L17.086 16.793C16.4354 17.4907 15.648 18.0467 14.7724 18.4239C13.8968 18.8011 12.9527 18.9912 12 18.982C10.2962 18.9808 8.65133 18.3583 7.3737 17.2311C6.09607 16.1039 5.27347 14.5494 5.06 12.859C5.04342 12.7264 5.00084 12.5989 4.93472 12.483C4.8686 12.3671 4.78022 12.2652 4.6747 12.1831C4.56918 12.1009 4.44864 12.0401 4.31986 12.0041C4.19109 11.9682 4.05661 11.9578 3.92375 11.9735L3.945 12.008Z"
                            fill="currentColor"
                          />
                        </svg>

                        <div className={homeStyles.tradeSide}>
                          <div className={homeStyles.tradeSideTitle}>你將失去</div>
                          {(() => {
                            const loseCount = 1 + (stableSeedFromString(`${item.id}_lose`) % 4);
                            const base = [item.wantImageUrl, item.offerImageUrl].filter(Boolean);
                            const loseImages =
                              base.length === 0 ? [] : Array.from({ length: loseCount }, (_, idx) => base[idx % base.length]).slice(0, 4);
                            const n = loseImages.length;
                            const gridClass =
                              n === 1
                                ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridOne}`
                                : n === 2
                                  ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridTwo}`
                                  : n === 3
                                    ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridThree}`
                                    : `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridFour}`;
                            const tileClassFor = (idx: number) => {
                              if (n === 3)
                                return idx === 2
                                  ? `${homeStyles.tradeThumb} ${homeStyles.tradeThumbSpan2}`
                                  : homeStyles.tradeThumb;
                              return homeStyles.tradeThumb;
                            };
                            return (
                              <div className={gridClass}>
                                {loseImages.map((src, idx) => (
                                  <div key={`${item.id}_lose_${idx}`} className={tileClassFor(idx)}>
                                    <img alt="" className={homeStyles.tradeThumbImg} src={src} />
                                    <div className={homeStyles.tradeThumbOverlay}>PSA 10</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                          <div className={homeStyles.tradeValueRow}>
                            <span>總價值約:</span>
                            <span>$27,000</span>
                          </div>
                        </div>
                      </div>

                      <div className={homeStyles.tradeFooter}>23分鐘前</div>
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
