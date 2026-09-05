"use client";

/**
 * 桌機關注（/favorites）—— 真資料版（老闆 2026-09-04；2026-09-05 由「收藏」改名「關注」，跟手機端「我的關注」同一個詞）。
 *
 * 關注只有一種：商品關注，存在 `product_follows`（跟導覽列那顆愛心、首頁卡片上那顆
 * 是同一張表）。商品內容從 `/api/public/home` 撈，卡片沿用首頁的 `HomeProductCard`。
 *
 * 拿掉的假東西：「收藏的交易所商品」「收藏的交換」兩個分頁 —— DB 沒有對應的表，
 * 那兩區整份是 mock；連帶拿掉 localStorage 的 `cardx.favorites.byId`（收藏一律進 DB，
 * 換裝置才看得到同一份）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { HomeProductCard } from "@/cardx/components/home/HomeClient";
import { fetchHomeCatalog, type HomeProduct } from "@/lib/queries/home";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

function HeartOutlineIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ color: "#111827" }}>
      <path
        fill="currentColor"
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
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

export default function FavoritesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [supabase] = useState(() => createClient());
  const [followIds, setFollowIds] = useState<number[]>([]);
  const [followed, setFollowed] = useState<Set<number>>(new Set());
  const [products, setProducts] = useState<HomeProduct[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [followsLoaded, setFollowsLoaded] = useState(false);
  const [columns, setColumns] = useState(5);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetchHomeCatalog()
      .then((d) => { if (alive) { setProducts(d.products); setCatalogLoaded(true); } })
      .catch(() => { if (alive) setCatalogLoaded(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) { setFollowIds([]); setFollowed(new Set()); setFollowsLoaded(true); return; }
    let alive = true;
    setFollowsLoaded(false);
    (async () => {
      const { data } = await supabase
        .from("product_follows")
        .select("product_id")
        .eq("user_id", user.id)
        .limit(500);
      if (!alive) return;
      const ids = ((data ?? []) as Array<{ product_id: number }>)
        .map((r) => Number(r.product_id))
        .filter((n) => Number.isFinite(n));
      setFollowIds(ids);
      setFollowed(new Set(ids));
      setFollowsLoaded(true);
    })();
    return () => { alive = false; };
  }, [user?.id, authLoading, supabase]);

  const items = useMemo(() => {
    if (followIds.length === 0) return [] as HomeProduct[];
    const order = new Map(followIds.map((id, i) => [id, i]));
    return products
      .filter((p) => order.has(Number(p.id)))
      .sort((a, b) => (order.get(Number(a.id)) ?? 0) - (order.get(Number(b.id)) ?? 0));
  }, [products, followIds]);

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

  /* 取消／重新收藏：直接寫 DB，卡片留在畫面上（誤按可以馬上按回來） */
  const toggleFollow = useCallback(async (productId: number) => {
    if (!user?.id) return;
    const has = followed.has(productId);
    setFollowed((prev) => { const next = new Set(prev); if (has) next.delete(productId); else next.add(productId); return next; });
    try {
      if (has) await supabase.from("product_follows").delete().eq("user_id", user.id).eq("product_id", productId);
      else await supabase.from("product_follows").insert({ user_id: user.id, product_id: productId });
    } catch {}
  }, [user?.id, followed, supabase]);

  const loading = authLoading || !followsLoaded || (followIds.length > 0 && !catalogLoaded);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <div style={{ display: "flex", alignItems: "center", alignSelf: "stretch", paddingTop: 4, paddingBottom: 4, gap: 8 }}>
              <HeartOutlineIcon />
              <h1
                style={{
                  margin: 0, height: 24, lineHeight: "24px", letterSpacing: "-0.36px", color: "#111827",
                  fontFamily: 'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                  fontSize: 18, fontWeight: 600,
                }}
              >
                關注
              </h1>
              {!loading && items.length > 0 ? (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>{items.length.toLocaleString()} 件</span>
              ) : null}
            </div>

            <section className={homeStyles.section} aria-label="關注的商品" style={{ marginTop: 14, width: "100%", flex: "1 0 auto" }}>
              {loading ? (
                <div
                  className={homeStyles.frame12}
                  style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16, width: "100%", marginTop: 0 }}
                >
                  {Array.from({ length: columns }).map((_, i) => <CardSkeleton key={`sk_${i}`} />)}
                </div>
              ) : !user ? (
                <div style={{ flex: "1 0 auto", alignSelf: "stretch", display: "grid", placeContent: "center", justifyItems: "center", gap: 10, padding: "40px 0" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>登入之後，關注的商品會跟著帳號走</div>
                  <Link href="/login" style={{ fontSize: 13, fontWeight: 800, color: "#111827", textDecoration: "underline" }}>
                    去登入
                  </Link>
                </div>
              ) : items.length === 0 ? (
                <div style={{ flex: "1 0 auto", alignSelf: "stretch", display: "grid", placeContent: "center", justifyItems: "center", gap: 10, padding: "40px 0" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>還沒有關注任何商品，到商品頁按一下愛心就會收在這裡</div>
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
                    <div key={p.id} onClickCapture={() => rememberProductVisit(Number(p.id))} style={{ display: "contents" }}>
                      <HomeProductCard
                        product={p}
                        followed={followed.has(Number(p.id))}
                        onToggleFollow={() => void toggleFollow(Number(p.id))}
                      />
                    </div>
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
