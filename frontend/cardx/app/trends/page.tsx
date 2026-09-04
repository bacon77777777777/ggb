"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { PageHeader } from "@/cardx/components/ui/Kit";

export default function TrendsPage() {
  return (
    <Suspense fallback={null}>
      <TrendsPageInner />
    </Suspense>
  );
}

function TrendsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  type GameKey = "all" | "pokemon" | "onepiece" | "yugioh" | "sports" | "other";
  type RangeKey = "24h" | "7d" | "30d";
  type SortKey = "hot" | "gainers" | "losers";
  const FOLLOW_KEY = "cardx.trends.follow.byId";

  const games = useMemo<Array<{ key: GameKey; label: string }>>(
    () => [
      { key: "all", label: "全部" },
      { key: "pokemon", label: "寶可夢" },
      { key: "onepiece", label: "海賊王" },
      { key: "yugioh", label: "遊戲王" },
      { key: "sports", label: "運動卡" },
      { key: "other", label: "其他" },
    ],
    []
  );

  const ranges = useMemo<Array<{ key: RangeKey; label: string }>>(
    () => [
      { key: "24h", label: "24H" },
      { key: "7d", label: "7D" },
      { key: "30d", label: "30D" },
    ],
    []
  );

  const sorts = useMemo<Array<{ key: SortKey; label: string }>>(
    () => [
      { key: "hot", label: "熱門" },
      { key: "gainers", label: "上漲" },
      { key: "losers", label: "下跌" },
    ],
    []
  );

  type TrendItem = {
    id: string;
    game: Exclude<GameKey, "all">;
    name: string;
    price: number;
    deltaPct: number;
    points: number[];
    traders: number;
  };

  const items = useMemo<TrendItem[]>(() => {
    const base: Array<Omit<TrendItem, "price" | "deltaPct" | "points" | "traders"> & { basePrice: number }> = [
      { id: "tr-001", game: "pokemon", name: "噴火龍 ex", basePrice: 27900 },
      { id: "tr-002", game: "pokemon", name: "皮卡丘", basePrice: 15200 },
      { id: "tr-003", game: "pokemon", name: "基拉祈 / 熱門異圖", basePrice: 32900 },
      { id: "tr-004", game: "onepiece", name: "魯夫 · 霸王色", basePrice: 19800 },
      { id: "tr-005", game: "onepiece", name: "索隆 · 異畫", basePrice: 11300 },
      { id: "tr-006", game: "yugioh", name: "青眼白龍", basePrice: 22700 },
      { id: "tr-007", game: "yugioh", name: "黑魔導", basePrice: 16400 },
      { id: "tr-008", game: "sports", name: "NBA 新人卡 / 限量", basePrice: 9200 },
      { id: "tr-009", game: "sports", name: "MLB 簽名卡 / 稀有", basePrice: 15800 },
      { id: "tr-010", game: "other", name: "漫畫卡 / 首刷", basePrice: 6800 },
    ];

    return base.map((b, idx) => {
      const seed = idx * 97 + b.basePrice;
      const wave = ((seed % 13) - 6) / 10;
      const drift = ((seed % 9) - 4) / 10;
      const deltaPct = Math.max(-18, Math.min(18, Math.round((wave * 2.4 + drift) * 10) / 10));
      const price = Math.max(80, Math.round(b.basePrice * (1 + deltaPct / 100)));

      const points = Array.from({ length: 18 }, (_, pIdx) => {
        const t = pIdx / 17;
        const noise = (((seed + pIdx * 41) % 17) - 8) / 60;
        const slope = (deltaPct / 100) * 0.9;
        const v = 0.5 + (t - 0.5) * slope + noise;
        return Math.max(0.05, Math.min(0.95, v));
      });

      const traders = Math.max(12, Math.round(1200 - idx * 93 + ((seed % 37) - 18)));
      return { id: b.id, game: b.game, name: b.name, price, deltaPct, points, traders };
    });
  }, []);

  const [activeGame, setActiveGame] = useState<GameKey>("all");
  const [activeRange, setActiveRange] = useState<RangeKey>("7d");
  const [activeSort, setActiveSort] = useState<SortKey>("hot");
  const [query, setQuery] = useState("");
  const [followOnly, setFollowOnly] = useState(false);
  const [followById, setFollowById] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const g = (searchParams?.get("game") ?? "").trim().toLowerCase();
    const r = (searchParams?.get("range") ?? "").trim().toLowerCase();
    const s = (searchParams?.get("sort") ?? "").trim().toLowerCase();
    const q = searchParams?.get("q") ?? "";
    const fo = (searchParams?.get("follow") ?? "").trim() === "1";
    const id = (searchParams?.get("id") ?? "").trim();

    const nextGame: GameKey = g === "pokemon" || g === "onepiece" || g === "yugioh" || g === "sports" || g === "other" ? (g as GameKey) : "all";
    const nextRange: RangeKey = r === "24h" || r === "7d" || r === "30d" ? (r as RangeKey) : "7d";
    const nextSort: SortKey = s === "hot" || s === "gainers" || s === "losers" ? (s as SortKey) : "hot";

    setActiveGame((prev) => (prev === nextGame ? prev : nextGame));
    setActiveRange((prev) => (prev === nextRange ? prev : nextRange));
    setActiveSort((prev) => (prev === nextSort ? prev : nextSort));
    setQuery((prev) => (prev === q ? prev : q));
    setFollowOnly((prev) => (prev === fo ? prev : fo));
    setSelectedId((prev) => (prev === (id || null) ? prev : id || null));
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeGame !== "all") params.set("game", activeGame);
    if (activeRange !== "7d") params.set("range", activeRange);
    if (activeSort !== "hot") params.set("sort", activeSort);
    if (query.trim()) params.set("q", query.trim());
    if (followOnly) params.set("follow", "1");
    if (selectedId) params.set("id", selectedId);
    const qs = params.toString();
    router.replace(qs ? `/trends?${qs}` : "/trends");
  }, [activeGame, activeRange, activeSort, followOnly, query, router, selectedId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOLLOW_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      window.setTimeout(() => setFollowById(parsed as Record<string, boolean>), 0);
    } catch {}
  }, []);

  function toggleFollow(id: string) {
    setFollowById((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      try {
        window.localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function resample(values: number[], n: number) {
    if (!values.length || n <= 0) return [];
    if (n === 1) return [values[0] ?? 0.5];
    if (values.length === n) return values;
    const lastIdx = values.length - 1;
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const x = t * lastIdx;
      const a = Math.floor(x);
      const b = Math.min(lastIdx, a + 1);
      const r = x - a;
      const va = values[a] ?? 0.5;
      const vb = values[b] ?? 0.5;
      return va + (vb - va) * r;
    });
  }

  function deltaForRange(deltaPct: number, range: RangeKey) {
    if (range === "24h") return Math.round(deltaPct * 0.6 * 10) / 10;
    if (range === "30d") return Math.round(deltaPct * 1.4 * 10) / 10;
    return deltaPct;
  }

  function pointsForRange(points: number[], range: RangeKey) {
    const len = range === "24h" ? 12 : range === "30d" ? 30 : 18;
    return resample(points, len);
  }

  type TrendComputed = TrendItem & { rangeDeltaPct: number; rangePrice: number; rangePoints: number[] };
  const computedItems = useMemo<TrendComputed[]>(() => {
    return items.map((c) => {
      const rangeDeltaPct = deltaForRange(c.deltaPct, activeRange);
      const basePrice = c.deltaPct === -100 ? c.price : c.price / (1 + c.deltaPct / 100);
      const rangePrice = Math.max(80, Math.round(basePrice * (1 + rangeDeltaPct / 100)));
      const rangePoints = pointsForRange(c.points, activeRange);
      return { ...c, rangeDeltaPct, rangePrice, rangePoints };
    });
  }, [activeRange, items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list0 = activeGame === "all" ? computedItems : computedItems.filter((x) => x.game === activeGame);
    const list1 = followOnly ? list0.filter((x) => !!followById[x.id]) : list0;
    const list2 = q ? list1.filter((x) => x.name.toLowerCase().includes(q)) : list1;
    const list = list2;
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (activeSort === "gainers") return b.rangeDeltaPct - a.rangeDeltaPct;
      if (activeSort === "losers") return a.rangeDeltaPct - b.rangeDeltaPct;
      return b.traders - a.traders;
    });
    return sorted;
  }, [activeGame, activeSort, computedItems, followById, followOnly, query]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    const gap = 16;
    const minCardWidth = 340;
    const maxCardWidth = 420;

    function computeColumns() {
      const el = listRef.current;
      if (!el) return;
      const w = el.clientWidth;

      if (w <= 520) {
        setColumns((prev) => (prev === 1 ? prev : 1));
        return;
      }
      if (w <= 1023) {
        setColumns((prev) => (prev === 2 ? prev : 2));
        return;
      }

      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (maxCardWidth + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (minCardWidth + gap)));
      const next = Math.min(4, Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin)));
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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSelectedId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function avatarSrc(_seedKey: string) {
    return "/cardx/placeholder.svg";
  }

  function formatTwd(v: number) {
    return `NT$ ${Math.round(v).toLocaleString("zh-TW")}`;
  }

  function sparkPath(values: number[], w = 120, h = 32, pad = 2) {
    if (!values.length) return "";
    const xs = values.map((_, idx) => pad + (idx * (w - pad * 2)) / Math.max(1, values.length - 1));
    const ys = values.map((v) => pad + (1 - v) * (h - pad * 2));
    return xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  }

  const selected = useMemo(() => (selectedId ? computedItems.find((x) => x.id === selectedId) ?? null : null), [computedItems, selectedId]);

  function mapToMarketVendorKey(game: Exclude<GameKey, "all">) {
    if (game === "pokemon") return "pokemon";
    if (game === "onepiece") return "onepiece";
    if (game === "yugioh") return "yugioh";
    if (game === "sports") return "basketball";
    return "other";
  }

  function goToMarket(item: TrendItem) {
    try {
      window.sessionStorage.setItem("cardx.market.prefill.vendorKey", mapToMarketVendorKey(item.game));
    } catch {}
    router.push("/market");
    setSelectedId(null);
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="卡牌走勢" />

            <div style={{ marginTop: 14, alignSelf: "stretch", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", width: "100%" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    overflowX: "auto",
                    overflowY: "hidden",
                    paddingBottom: 2,
                    WebkitOverflowScrolling: "touch",
                    maxWidth: "100%",
                  }}
                >
                  {games.map((t) => {
                    const active = activeGame === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveGame(t.key)}
                        style={{
                          height: 34,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: 0,
                          cursor: "pointer",
                          background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                          color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)",
                          fontSize: 13,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flex: "0 0 auto" }}>
                  <button
                    type="button"
                    onClick={() => setFollowOnly((v) => !v)}
                    style={{
                      height: 34,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: 0,
                      cursor: "pointer",
                      background: followOnly ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                      color: followOnly ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)",
                      fontSize: 13,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    追蹤
                  </button>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜尋卡牌"
                    style={{
                      height: 34,
                      width: "clamp(160px, 22vw, 260px)",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      padding: "0 12px",
                      color: "rgba(255,255,255,0.92)",
                      fontSize: 13,
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>
                    {filtered.length.toLocaleString()} 張
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {ranges.map((r) => {
                    const active = activeRange === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setActiveRange(r.key)}
                        style={{
                          height: 34,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: 0,
                          cursor: "pointer",
                          background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                          color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)",
                          fontSize: 13,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {sorts.map((s) => {
                    const active = activeSort === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setActiveSort(s.key)}
                        style={{
                          height: 34,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: 0,
                          cursor: "pointer",
                          background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                          color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)",
                          fontSize: 13,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>區間：{activeRange.toUpperCase()}</div>
              </div>

              <section className={homeStyles.section} aria-label="走勢列表">
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
                    marginTop: 14,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                >
                  {filtered.map((c) => {
                    const up = c.rangeDeltaPct >= 0;
                    const pctAbs = Math.min(99, Math.max(1, Math.round(Math.abs(c.rangeDeltaPct) * 3.2)));
                    const ringColor = up ? "rgba(102,187,106,0.92)" : "rgba(239,83,80,0.92)";
                    const followed = !!followById[c.id];
                    return (
                      <div
                        key={c.id}
                        className={`${homeStyles.newsCard} ${homeStyles.topicCard}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(c.id);
                          }
                        }}
                        style={{
                          borderRadius: 16,
                          background: "#1c2532",
                          overflow: "hidden",
                          boxShadow: "0px 2px 15px 0px rgba(0,0,0,0.10)",
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div className={homeStyles.topicHeader}>
                          <div className={homeStyles.topicAvatar}>
                            <img alt="" src={avatarSrc(c.id)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          </div>
                          <div className={homeStyles.topicTitle} style={{ WebkitLineClamp: 2 }}>
                            {c.name}
                          </div>
                          <div
                            className={homeStyles.topicRing}
                            style={
                              {
                                ["--p" as never]: pctAbs,
                                ["--ring-color" as never]: ringColor,
                              } as React.CSSProperties
                            }
                          >
                            <div className={homeStyles.topicRingInner}>
                              <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1 }}>
                                {up ? "+" : "-"}
                                {Math.abs(c.rangeDeltaPct).toFixed(1)}%
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 850, color: "rgba(255,255,255,0.55)", lineHeight: 1, marginTop: 2 }}>
                                {activeRange.toUpperCase()}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.55)" }}>參考價</div>
                            <div style={{ fontSize: 16, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{formatTwd(c.rangePrice)}</div>
                          </div>
                          <svg width="120" height="32" viewBox="0 0 120 32" aria-hidden="true">
                            <polyline
                              points={sparkPath(c.rangePoints, 120, 32, 2)}
                              fill="none"
                              stroke={up ? "rgba(102,187,106,0.92)" : "rgba(239,83,80,0.92)"}
                              strokeWidth="2.25"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>

                        <div className={homeStyles.topicSpacer} />
                        <div className={homeStyles.topicFooter}>
                          <div className={homeStyles.topicMetaRow}>
                            <div className={homeStyles.topicVoters}>{c.traders.toLocaleString()} 人關注</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 900, color: up ? "rgba(102,187,106,0.92)" : "rgba(239,83,80,0.92)" }}>
                                {up ? "+" : "-"}
                                {Math.abs(c.rangeDeltaPct).toFixed(1)}%
                              </div>
                              <button
                                type="button"
                                aria-pressed={followed}
                                onClick={() => toggleFollow(c.id)}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClickCapture={(e) => e.stopPropagation()}
                                style={{
                                  height: 28,
                                  padding: "0 10px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  background: followed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                                  color: followed ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)",
                                  fontSize: 12,
                                  fontWeight: 900,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {followed ? "已追蹤" : "追蹤"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <div
          role="presentation"
          onClick={() => setSelectedId(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(0,0,0,0.62)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="走勢詳情"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(640px, 96vw)",
              borderRadius: 18,
              border: "1px solid rgba(255, 255, 255, 0.10)",
              background: "rgba(17, 25, 35, 0.92)",
              boxShadow: "0 18px 60px rgba(0, 0, 0, 0.6)",
              padding: 16,
              position: "relative",
            }}
          >
            <button
              type="button"
              aria-label="關閉"
              onClick={() => setSelectedId(null)}
              style={{
                appearance: "none",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.18)",
                color: "rgba(255,255,255,0.9)",
                width: 38,
                height: 38,
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 950,
                lineHeight: 1,
                position: "absolute",
                top: 12,
                right: 12,
              }}
            >
              ×
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 44 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.06)", flex: "0 0 auto" }}>
                <img alt="" src={avatarSrc(selected.id)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ fontSize: 16, fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>{selected.name}</div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                  {selected.traders.toLocaleString()} 人關注 · 區間 {activeRange.toUpperCase()}
                </div>
              </div>
              <div
                className={homeStyles.topicRing}
                style={
                  {
                    ["--p" as never]: Math.min(99, Math.max(1, Math.round(Math.abs(selected.rangeDeltaPct) * 3.2))),
                    ["--ring-color" as never]: selected.rangeDeltaPct >= 0 ? "rgba(102,187,106,0.92)" : "rgba(239,83,80,0.92)",
                  } as React.CSSProperties
                }
              >
                <div className={homeStyles.topicRingInner}>
                  <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1 }}>
                    {selected.rangeDeltaPct >= 0 ? "+" : "-"}
                    {Math.abs(selected.rangeDeltaPct).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 850, color: "rgba(255,255,255,0.55)", lineHeight: 1, marginTop: 2 }}>
                    {activeRange.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.55)" }}>參考價</div>
                <div style={{ fontSize: 18, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{formatTwd(selected.rangePrice)}</div>
              </div>
              <div style={{ marginTop: 10 }}>
                <svg width="100%" height="150" viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={sparkPath(selected.rangePoints, 600, 150, 6)}
                    fill="none"
                    stroke={selected.rangeDeltaPct >= 0 ? "rgba(102,187,106,0.92)" : "rgba(239,83,80,0.92)"}
                    strokeWidth="3.25"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  aria-pressed={!!followById[selected.id]}
                  onClick={() => toggleFollow(selected.id)}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: followById[selected.id] ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                    color: followById[selected.id] ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.80)",
                    fontSize: 13,
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {followById[selected.id] ? "已追蹤" : "追蹤"}
                </button>
                <button
                  type="button"
                  onClick={() => goToMarket(selected)}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderRadius: 12,
                    border: 0,
                    background: "rgba(11, 121, 247, 0.92)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  前往市集
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
