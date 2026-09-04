"use client";

/**
 * 桌機商品列表（/packs）—— 真資料版（老闆 2026-09-04）。
 *
 * 資料與演算法整份沿用首頁那套：`fetchHomeCatalog()`（/api/public/home）+
 * `useHomeCatalogView`（類別 tab／系列二級籤／排序／推薦籤）。這頁多一個關鍵字搜尋，
 * 其餘一律不自己算 —— 兩邊要改一起改。
 *
 * 卡片用首頁匯出的 `HomeProductCard`（同一顆），點了走 `/item/<id>` 真商品頁。
 * 原本的「供應商」下拉（寶可夢／海賊王／遊戲王…）是 mock，DB 沒有這個維度，已移除；
 * 真正的分面是類別 tab 與系列籤。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { FilterIcon, PillSelect } from "@/cardx/components/ui/PillSelect";
import { HomeProductCard } from "@/cardx/components/home/HomeClient";
import { useHomeCatalogView } from "@/cardx/lib/useHomeCatalogView";
import { fetchHomeCatalog, type HomeProduct } from "@/lib/queries/home";
import Link from "next/link";

/** 近期瀏覽：只記商品 id 與時間，內容一律回頭查 DB（見 /recent） */
const RECENTS_KEY = "cardx.recent.detailVisits";
const RECENTS_MAX = 60;

function rememberProductVisit(productId: number) {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [
      { kind: "product", id: productId, ts: Date.now() },
      ...list.filter((x) => !(x && typeof x === "object" && x.kind === "product" && Number(x.id) === productId)),
    ].slice(0, RECENTS_MAX);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {}
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
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ color: "#111827" }}>
      <path
        d="M12 2.2 3.5 6.4v11.2L12 21.8l8.5-4.2V6.4L12 2.2Zm0 2.24 5.8 2.86L12 10.16 6.2 7.3 12 4.44ZM5.3 8.78l5.8 2.86v7.06L5.3 15.84V8.78Zm7.6 9.92v-7.06l5.8-2.86v7.06l-5.8 2.86Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** 骨架格（不自創 spinner；載入中先給灰塊） */
function CardSkeleton() {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="animate-pulse" style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, background: "#e5e7eb" }} />
      <div className="animate-pulse" style={{ height: 14, borderRadius: 6, background: "#e5e7eb" }} />
      <div className="animate-pulse" style={{ height: 14, width: "60%", borderRadius: 6, background: "#e5e7eb" }} />
    </div>
  );
}

export default function PacksPage() {
  const [products, setProducts] = useState<HomeProduct[]>([]);
  const [menus, setMenus] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [columns, setColumns] = useState(5);
  const [visibleRows, setVisibleRows] = useState(4);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryTrimmed = query.trim();
  const searchActive = queryTrimmed.length > 0;

  useEffect(() => {
    let alive = true;
    fetchHomeCatalog()
      .then((d) => {
        if (!alive) return;
        setProducts(d.products);
        setMenus(d.menus);
        setLoaded(true);
      })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const view = useHomeCatalogView(products, menus);

  const items = useMemo(() => {
    const q = queryTrimmed.toLowerCase();
    if (!q) return view.items;
    return view.items.filter((p) => {
      const hay = `${p.name ?? ""} ${p.series ?? ""} ${p.category ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [view.items, queryTrimmed]);

  const visibleCount = Math.min(items.length, visibleRows * columns);

  useEffect(() => { setVisibleRows(4); }, [view.activePrimaryTab, view.activeSecondaryTab, view.sortMode, queryTrimmed]);

  useEffect(() => {
    function computeColumns() {
      if (typeof window === "undefined") return;
      if (window.innerWidth <= 1023) { setColumns(2); return; }
      const el = listRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const gap = 16;
      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (280 + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (220 + gap)));
      const next = Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin));
      setColumns((prev) => (prev === next ? prev : next));
    }
    computeColumns();
    const ro = new ResizeObserver(() => computeColumns());
    if (listRef.current) ro.observe(listRef.current);
    window.addEventListener("resize", computeColumns);
    return () => { ro.disconnect(); window.removeEventListener("resize", computeColumns); };
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= items.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisibleRows((r) => r + 4);
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, items.length]);

  const onCardClick = useCallback((id: number) => { rememberProductVisit(id); }, []);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <div
              style={{
                display: "flex", flexShrink: 0, alignItems: "center", alignSelf: "stretch",
                justifyContent: "space-between", paddingTop: 4, paddingBottom: 4, gap: 16, flexWrap: "nowrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", width: "auto", minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ display: "flex", alignItems: "center", overflow: "hidden" }}><BoxIcon /></div>
                <h1
                  style={{
                    display: "flex", alignItems: "center", margin: "0 0 0 8px", width: "auto", height: 24,
                    lineHeight: "24px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    letterSpacing: "-0.36px", color: "#111827",
                    fontFamily: 'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                    fontSize: 18, fontWeight: 600,
                  }}
                >
                  商品
                </h1>
                {loaded ? (
                  <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {items.length.toLocaleString()} 件
                  </span>
                ) : null}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "nowrap", justifyContent: "flex-end", flex: "0 0 auto", minWidth: 0 }}>
                <div style={{ position: "relative", flex: "0 0 auto", width: "clamp(160px, 18vw, 220px)" }}>
                  <div
                    aria-hidden="true"
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280", pointerEvents: "none", display: "grid", placeItems: "center" }}
                  >
                    <SearchIcon />
                  </div>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="搜尋商品"
                    placeholder="輸入關鍵字"
                    style={{
                      width: "100%", height: 38, borderRadius: 12, border: "1px solid #e5e7eb", background: "#ffffff",
                      color: "#111827", padding: searchActive ? "0 40px 0 40px" : "0 14px 0 40px", fontSize: 14, fontWeight: 800, outline: "none",
                    }}
                  />
                  {searchActive ? (
                    <button
                      type="button"
                      aria-label="清除搜尋"
                      onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                      style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 28, height: 28,
                        display: "grid", placeItems: "center", borderRadius: 10, border: 0, background: "#f3f4f6",
                        color: "#374151", cursor: "pointer", padding: 0,
                      }}
                    >
                      <XIcon />
                    </button>
                  ) : null}
                </div>
                <PillSelect
                  value={view.sortMode}
                  onChange={(next) => view.setSortMode(next)}
                  options={view.sortOptions.map((o) => ({ key: o.id, label: o.label }))}
                  ariaLabel="排序"
                  icon={<FilterIcon />}
                  borderless
                  fit
                />
              </div>
            </div>

            {/* 類別 tab（一番賞／盒玩／轉蛋／抽卡／自製賞＋後台自建分類）—— 跟首頁同一份來源 */}
            <div style={{ display: "flex", gap: 8, borderRadius: 14, background: "#f3f4f6", padding: 6, overflowX: "auto", scrollbarWidth: "none", marginTop: 4 }}>
              {view.primaryTabs.map((t) => {
                const active = t.id === view.activePrimaryTab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { view.setActivePrimaryTab(t.id); view.setActiveSecondaryTab("featured"); }}
                    style={{
                      flex: "1 0 auto", height: 42, border: 0, borderRadius: 10, padding: "0 14px", cursor: "pointer",
                      fontSize: 14, fontWeight: 600, transition: "all 200ms ease", whiteSpace: "nowrap",
                      background: active ? "#ffffff" : "transparent",
                      color: active ? "#111827" : "#6b7280",
                      boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* 二級籤：推薦＋系列（順序照玩家偏好／全站人氣，同首頁） */}
            {view.secondaryTabs.length > 1 ? (
              <div className={homeStyles.container9} style={{ marginTop: 8, minWidth: 0 }}>
                {view.secondaryTabs.map((t) => {
                  const active = t.id === view.activeSecondaryTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={active ? homeStyles.link6 : homeStyles.link7}
                      style={{ cursor: "pointer" }}
                      onClick={() => view.setActiveSecondaryTab(t.id)}
                    >
                      <p className={active ? homeStyles.text7 : homeStyles.text8}>{t.label}</p>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <section className={homeStyles.section} aria-label="商品列表">
              <div
                ref={listRef}
                className={homeStyles.frame12}
                style={{
                  display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16,
                  justifyItems: "stretch", alignItems: "stretch", width: "100%", overflow: "visible",
                  overflowX: "visible", marginTop: 0, paddingTop: 0, paddingBottom: 0,
                }}
              >
                {!loaded
                  ? Array.from({ length: columns * 2 }).map((_, i) => <CardSkeleton key={`sk_${i}`} />)
                  : items.slice(0, visibleCount).map((p) => (
                      <div key={p.id} onClickCapture={() => onCardClick(Number(p.id))} style={{ display: "contents" }}>
                        <HomeProductCard
                          product={p}
                          meta={view.feedMeta.current.get(String(p.id))}
                          followed={view.follows.has(Number(p.id))}
                          onToggleFollow={() => void view.toggleFollow(Number(p.id))}
                        />
                      </div>
                    ))}
              </div>
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

              {loaded && items.length === 0 ? (
                <div style={{ padding: "48px 0", display: "grid", justifyItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>
                    {searchActive ? `找不到符合「${queryTrimmed}」的商品` : "這個分類目前沒有商品"}
                  </div>
                  <Link href="/" style={{ fontSize: 13, fontWeight: 800, color: "#111827", textDecoration: "underline" }}>
                    回首頁看看其他商品
                  </Link>
                </div>
              ) : null}

              {loaded && items.length > 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0 8px", fontSize: 13, fontWeight: 700, color: "#6b7280" }}>
                  {visibleCount < items.length ? "載入中…" : "到底了"}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
