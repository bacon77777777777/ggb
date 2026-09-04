"use client";

/**
 * 桌機近期瀏覽（/recent）—— 真資料版（老闆 2026-09-04）。
 *
 * 近期瀏覽**沒有後端**：瀏覽過哪幾件只記在這台裝置的 localStorage
 * （`cardx.recent.detailVisits`，內容是 `{ kind:"product", id, ts }`）。
 * 但畫面上的名稱／價格／剩餘一律**回頭查真商品**（`/api/public/home`）——
 * 記在瀏覽器裡的只有 id 與時間，不存商品內容，不然改價／完抽了這頁還在講舊的。
 *
 * 舊的 mock 紀錄（`kind: "market" / "packs" / "trades"`，id 長 `pack_001` 那樣）
 * 讀到就跳過；它們對應的是假頁面。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { HomeProductCard } from "@/cardx/components/home/HomeClient";
import { fetchHomeCatalog, type HomeProduct } from "@/lib/queries/home";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const RECENTS_KEY = "cardx.recent.detailVisits";

interface RecentEntry { id: number; ts: number }

/** 讀出「看過哪些商品」。只認得出數字 id 的才留，其餘（舊 mock 紀錄）丟掉。 */
function readRecentProductIds(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentEntry[] = [];
    const seen = new Set<number>();
    for (const row of parsed) {
      let id: number | null = null;
      let ts = 0;
      if (typeof row === "number" && Number.isFinite(row)) id = row;
      else if (typeof row === "string" && /^\d+$/.test(row)) id = Number(row);
      else if (row && typeof row === "object") {
        const rawId = (row as { id?: unknown }).id;
        const n = typeof rawId === "number" ? rawId : typeof rawId === "string" && /^\d+$/.test(rawId) ? Number(rawId) : NaN;
        if (Number.isFinite(n)) id = n;
        const rawTs = (row as { ts?: unknown }).ts;
        if (typeof rawTs === "number" && Number.isFinite(rawTs)) ts = rawTs;
      }
      if (id === null || !Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, ts });
    }
    return out.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ color: "#111827" }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <polyline points="12 7 12 12 15.5 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CardSkeleton() {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="animate-pulse" style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, background: "#e5e7eb" }} />
      <div className="animate-pulse" style={{ height: 14, borderRadius: 6, background: "#e5e7eb" }} />
      <div className="animate-pulse" style={{ height: 14, width: "60%", borderRadius: 6, background: "#e5e7eb" }} />
    </div>
  );
}

export default function RecentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [supabase] = useState(() => createClient());
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [entriesRead, setEntriesRead] = useState(false);
  const [products, setProducts] = useState<HomeProduct[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [follows, setFollows] = useState<Set<number>>(new Set());
  const [columns, setColumns] = useState(5);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.setTimeout(() => { setEntries(readRecentProductIds()); setEntriesRead(true); }, 0);
  }, []);

  useEffect(() => {
    function sync() { setEntries(readRecentProductIds()); }
    function onStorage(e: StorageEvent) { if (e.key === RECENTS_KEY) sync(); }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", sync); };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchHomeCatalog()
      .then((d) => { if (alive) { setProducts(d.products); setCatalogLoaded(true); } })
      .catch(() => { if (alive) setCatalogLoaded(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!user?.id) { setFollows(new Set()); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase.from("product_follows").select("product_id").eq("user_id", user.id).limit(500);
      if (!alive) return;
      setFollows(new Set(((data ?? []) as Array<{ product_id: number }>).map((r) => Number(r.product_id))));
    })();
    return () => { alive = false; };
  }, [user?.id, supabase]);

  const items = useMemo(() => {
    if (entries.length === 0) return [] as HomeProduct[];
    const byId = new Map(products.map((p) => [Number(p.id), p]));
    return entries.map((e) => byId.get(e.id)).filter((p): p is HomeProduct => !!p);
  }, [entries, products]);

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
  }, [items.length]);

  const toggleFollow = useCallback(async (productId: number) => {
    if (!user?.id) { router.push("/login"); return; }
    const has = follows.has(productId);
    setFollows((prev) => { const next = new Set(prev); if (has) next.delete(productId); else next.add(productId); return next; });
    try {
      if (has) await supabase.from("product_follows").delete().eq("user_id", user.id).eq("product_id", productId);
      else await supabase.from("product_follows").insert({ user_id: user.id, product_id: productId });
    } catch {}
  }, [user?.id, follows, supabase, router]);

  function clearHistory() {
    try { window.localStorage.removeItem(RECENTS_KEY); } catch {}
    setEntries([]);
  }

  const loading = !entriesRead || (entries.length > 0 && !catalogLoaded);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <div style={{ display: "flex", alignItems: "center", alignSelf: "stretch", justifyContent: "space-between", paddingTop: 4, paddingBottom: 4, gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <ClockIcon />
                <h1
                  style={{
                    margin: 0, height: 24, lineHeight: "24px", letterSpacing: "-0.36px", color: "#111827",
                    fontFamily: 'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                    fontSize: 18, fontWeight: 600,
                  }}
                >
                  近期瀏覽
                </h1>
                {!loading && items.length > 0 ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>{items.length.toLocaleString()} 件</span>
                ) : null}
              </div>
              {!loading && items.length > 0 ? (
                <button
                  type="button"
                  onClick={clearHistory}
                  style={{
                    height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff",
                    color: "#6b7280", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  清除紀錄
                </button>
              ) : null}
            </div>

            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 650, color: "#9ca3af" }}>
              只記在這台裝置上，換裝置或清瀏覽資料就會不見
            </div>

            <section className={homeStyles.section} aria-label="近期瀏覽的商品" style={{ marginTop: 14, width: "100%" }}>
              {loading ? (
                <div
                  className={homeStyles.frame12}
                  style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16, width: "100%", marginTop: 0 }}
                >
                  {Array.from({ length: columns }).map((_, i) => <CardSkeleton key={`sk_${i}`} />)}
                </div>
              ) : items.length === 0 ? (
                <div style={{ padding: "56px 0", display: "grid", justifyItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>還沒有瀏覽紀錄，看過的商品會留在這裡方便你找回來</div>
                  <Link href="/" style={{ fontSize: 13, fontWeight: 800, color: "#111827", textDecoration: "underline" }}>
                    去逛逛
                  </Link>
                </div>
              ) : (
                <div
                  ref={listRef}
                  className={homeStyles.frame12}
                  style={{
                    display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16,
                    justifyItems: "stretch", alignItems: "stretch", width: "100%", overflow: "visible",
                    overflowX: "visible", marginTop: 0, paddingTop: 0, paddingBottom: 0,
                  }}
                >
                  {items.map((p) => (
                    <HomeProductCard
                      key={p.id}
                      product={p}
                      followed={follows.has(Number(p.id))}
                      onToggleFollow={() => void toggleFollow(Number(p.id))}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
