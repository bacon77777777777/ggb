"use client";

/**
 * cardx 首頁的商品瀏覽狀態：類別 tab → 二級頁籤（推薦／系列）→ 排序 → 商品順序。
 *
 * **演算法整份照抄手機首頁 `app/page.tsx`**（老闆 2026-09-04：電腦端要跟手機端一樣的瀏覽方式、一樣要有演算法）：
 *   - 類別 tab：綜合＋類別開關不是「關閉」的五類＋後台自建分類（`?menu=`）
 *   - 二級頁籤：推薦＋系列，順序看 玩家系列偏好 → 全站系列人氣 → 商品數（最多 20 顆、8 字截斷）
 *   - 排序：推薦／最新、熱門（get_popular_products 的熱度分）、價格低到高、價格高到低、已完抽
 *   - 推薦籤：v2 走 lib/feed/assemble 的分桶配額＋加權抽籤＋Thompson 權重＋看過懲罰；
 *     同一輪（同種子＋同籤＋同批商品）只抽一次，返回首頁沿用（sessionFeedOrders）；
 *     v1（A/B 另一組）是「頭部照實力、其餘加權洗牌、看過打折」
 *   - 完抽／結束的一律排最後（已完抽排序除外）
 * 手機那份一行沒動；這裡是給 cardx 版面用的複本，兩邊要改要一起改。
 * 手機版獨有的「價格區間」「下拉更新換一輪」這裡沒有。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/swr";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { categoryState } from "@/lib/categoryFlags";
import { assembleFeed, seededRng, type FeedBucket, type FeedSignals, type FeedCtrItem } from "@/lib/feed/assemble";
import { loadSeenRounds, saveRound } from "@/lib/feed/memory";
import { resolveVariant } from "@/lib/feed/variant";
import { sessionIntent } from "@/lib/feed/session";
import type { HomeProduct } from "@/lib/queries/home";

export type SortMode = "latest" | "hot" | "price-asc" | "price-desc" | "sold-out";
export interface TabItem { id: string; label: string }
export type FeedMetaMap = Map<string, { bucket: FeedBucket; position: number }>;

export const BUILT_IN_TAB_IDS = ["all", "ichiban", "blindbox", "gacha", "card", "custom"] as const;
const CATEGORY_TABS: { id: string; label: string; type: string }[] = [
  { id: "ichiban", label: "一番賞", type: "ichiban" },
  { id: "blindbox", label: "盒玩", type: "blindbox" },
  { id: "gacha", label: "轉蛋", type: "gacha" },
  { id: "card", label: "抽卡", type: "card" },
  { id: "custom", label: "自製賞", type: "custom" },
];
const MAX_SERIES_TABS = 20;
const HEAD_KEEP = 5;
const SEEN_DEMOTE = 0.3;

/** 這一趟（同一次進站）每個類別抽過的推薦順序，返回首頁沿用（跟手機版同一個做法） */
const sessionFeedOrders = new Map<string, { order: Map<string, number>; meta: FeedMetaMap }>();
if (typeof window !== "undefined") {
  window.addEventListener("ggb:content-refresh", () => { sessionFeedOrders.clear(); });
}

export function useHomeCatalogView(products: HomeProduct[], menus: { id: string; name: string }[]) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const { user } = useAuth();
  const { states: flagStates } = useFeatureFlags();

  const [activePrimaryTab, setActivePrimaryTab] = useState("all");
  const [activeSecondaryTab, setActiveSecondaryTab] = useState("featured");
  const [sortMode, setSortMode] = useState<SortMode>("latest");

  const [userSeriesPref, setUserSeriesPref] = useState<Map<string, number>>(new Map());
  const [globalSeriesPop, setGlobalSeriesPop] = useState<Map<string, number>>(new Map());
  const [productHeat, setProductHeat] = useState<Map<number, number>>(new Map());
  const [feedAux, setFeedAux] = useState<{ topics: { keyword: string; weight: number }[]; ctr: FeedSignals["ctr"]; abRatio: number }>({
    topics: [], ctr: { mean: 0.03, items: new Map() }, abRatio: 0,
  });
  const [follows, setFollows] = useState<Set<number>>(new Set());
  const [feedVariant, setFeedVariant] = useState<"v1" | "v2">("v2");
  const [menuProductIdsByMenuId, setMenuProductIdsByMenuId] = useState<Record<string, number[]>>({});

  /* ── 訊號載入（照手機版）── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_popular_series");
        if (cancelled || !Array.isArray(data)) return;
        const map = new Map<string, number>();
        for (const row of data as Array<{ series: string; score: number }>) if (row.series) map.set(row.series, Number(row.score) || 0);
        setGlobalSeriesPop(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [supabase]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_popular_products", { p_limit: 200 });
        if (cancelled || !Array.isArray(data)) return;
        const map = new Map<number, number>();
        for (const row of data as Array<{ product_id: number; score: number }>) map.set(Number(row.product_id), Number(row.score) || 0);
        setProductHeat(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [supabase]);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_user_series_preferences", { p_user_id: user.id, p_limit: 10 });
        if (cancelled || !Array.isArray(data)) return;
        const map = new Map<string, number>();
        for (const row of data as Array<{ series: string; score: number }>) if (row.series) map.set(row.series, Number(row.score) || 0);
        setUserSeriesPref(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user?.id, supabase]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchJson<{ keyword: string; weight: number }[]>("/api/public/topics").catch(() => [] as { keyword: string; weight: number }[]),
      fetchJson<{ mean: number; items: Record<string, FeedCtrItem>; abRatio: number }>("/api/public/feed-weights").catch(() => null),
    ]).then(([topics, w]) => {
      if (!alive) return;
      const items = new Map<number, FeedCtrItem>();
      if (w) for (const [id, v] of Object.entries(w.items || {})) items.set(Number(id), v);
      setFeedAux({ topics: Array.isArray(topics) ? topics : [], ctr: { mean: w?.mean ?? 0.03, items }, abRatio: w?.abRatio ?? 0 });
      setFeedVariant(resolveVariant(w?.abRatio ?? 0));
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!user?.id) { setFollows(new Set()); return; }
    let alive = true;
    supabase.from("product_follows").select("product_id").eq("user_id", user.id).limit(500)
      .then(({ data }) => { if (alive) setFollows(new Set((data ?? []).map((r) => Number(r.product_id)))); });
    return () => { alive = false; };
  }, [user?.id, supabase]);

  /* ── 類別 tab ── */
  const primaryTabs = useMemo<TabItem[]>(() => {
    const base: TabItem[] = [{ id: "all", label: "綜合" }];
    for (const t of CATEGORY_TABS) {
      if (categoryState(t.type, flagStates, false) === "off") continue;
      base.push({ id: t.id, label: t.label });
    }
    return [...base, ...menus.map((m) => ({ id: `menu:${m.id}`, label: m.name }))];
  }, [flagStates, menus]);

  // 自建分類的商品清單：切到那一籤才抓
  useEffect(() => {
    if (!activePrimaryTab.startsWith("menu:")) return;
    const menuId = activePrimaryTab.slice("menu:".length);
    if (!menuId || menuProductIdsByMenuId[menuId]) return;
    (async () => {
      const { data, error } = await supabase.from("product_categories").select("product_id").eq("category_id", menuId).order("sort_order", { ascending: false });
      if (error) return;
      const ids = ((data || []) as Array<{ product_id: number }>).map((r) => Number(r.product_id)).filter((n) => Number.isFinite(n));
      setMenuProductIdsByMenuId((prev) => ({ ...prev, [menuId]: Array.from(new Set(ids)) }));
    })();
  }, [activePrimaryTab, supabase, menuProductIdsByMenuId]);

  const filterByPrimaryTab = useCallback((list: HomeProduct[]) => list.filter((product) => {
    if (activePrimaryTab === "all") return categoryState(product.type, flagStates, false) === "on";
    if (activePrimaryTab.startsWith("menu:")) {
      const ids = menuProductIdsByMenuId[activePrimaryTab.slice("menu:".length)];
      if (!ids) return false;
      if (categoryState(product.type, flagStates, false) !== "on") return false;
      return ids.includes(Number(product.id));
    }
    if (activePrimaryTab === "card") {
      if (categoryState("card", flagStates, false) !== "on") return false;
      const category = product.category || "";
      if (product.type === "card") return true;
      return category.includes("卡") || category.toLowerCase().includes("card");
    }
    if (categoryState(product.type, flagStates, false) !== "on") return false;
    return product.type === activePrimaryTab;
  }), [activePrimaryTab, flagStates, menuProductIdsByMenuId]);

  /* ── 二級頁籤 ── */
  const secondaryTabs = useMemo<TabItem[]>(() => {
    const counts = new Map<string, number>();
    for (const p of filterByPrimaryTab(products)) {
      const s = p.series;
      if (s && typeof s === "string" && s.trim()) counts.set(s.trim(), (counts.get(s.trim()) || 0) + 1);
    }
    const series = Array.from(counts.entries())
      .sort((a, b) => {
        const prefDiff = (userSeriesPref.get(b[0]) || 0) - (userSeriesPref.get(a[0]) || 0);
        if (prefDiff !== 0) return prefDiff;
        const popDiff = (globalSeriesPop.get(b[0]) || 0) - (globalSeriesPop.get(a[0]) || 0);
        if (popDiff !== 0) return popDiff;
        return b[1] - a[1];
      })
      .slice(0, MAX_SERIES_TABS)
      .map(([s]) => ({ id: `series:${s}`, label: s.length > 8 ? s.slice(0, 8) : s }));
    return [{ id: "featured", label: "推薦" }, ...series];
  }, [products, filterByPrimaryTab, userSeriesPref, globalSeriesPop]);
  useEffect(() => { setActiveSecondaryTab("featured"); }, [activePrimaryTab]);

  const sortOptions = useMemo<{ id: SortMode; label: string }[]>(() => [
    { id: "latest", label: activeSecondaryTab === "featured" ? "推薦" : "最新" },
    { id: "hot", label: "熱門" },
    { id: "price-asc", label: "價格：低到高" },
    { id: "price-desc", label: "價格：高到低" },
    { id: "sold-out", label: "已完抽" },
  ], [activeSecondaryTab]);

  /* ── 推薦 feed 的每輪狀態（照手機版）── */
  const feedSeed = useRef<number>(Math.floor(Math.random() * 0xffffffff));
  const feedMeta = useRef<FeedMetaMap>(new Map());
  const feedSeenRounds = useRef<string[][] | null>(null);
  if (feedSeenRounds.current === null) feedSeenRounds.current = loadSeenRounds();
  const feedOrder = useRef<{ key: string; order: Map<string, number> } | null>(null);
  const feedFirstScreen = useRef<string[] | null>(null);
  const feedJitter = useRef<Map<string, number>>(new Map());
  const jitterOf = (id: string) => {
    let v = feedJitter.current.get(id);
    if (v === undefined) { v = Math.random(); feedJitter.current.set(id, v); }
    return v;
  };
  const seenTop = useRef<Set<string>>(new Set());
  useEffect(() => {
    try { seenTop.current = new Set(JSON.parse(sessionStorage.getItem("ggb:feed:seen") || "[]")); } catch {}
  }, []);

  const items = useMemo(() => {
    let result = [...filterByPrimaryTab(products)];
    if (activeSecondaryTab.startsWith("series:")) {
      const seriesName = activeSecondaryTab.slice("series:".length);
      result = result.filter((p) => p.series === seriesName);
    }
    if (sortMode === "sold-out") {
      result = result.filter((p) => (typeof p.remaining === "number" && p.remaining <= 0) || p.status === "ended");
    }
    const heatOf = (p: HomeProduct) => productHeat.get(Number(p.id)) || 0;
    const createdAt = (p: HomeProduct) => (p.created_at ? new Date(p.created_at).getTime() : 0);

    if (sortMode === "price-asc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortMode === "price-desc") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortMode === "hot") {
      result.sort((a, b) => {
        const d = heatOf(b) - heatOf(a);
        return d !== 0 ? d : createdAt(b) - createdAt(a);
      });
    } else if (
      activeSecondaryTab === "featured" &&
      sessionFeedOrders.has(activePrimaryTab) &&
      sessionFeedOrders.get(activePrimaryTab)!.order.size > 0
    ) {
      // 這個類別這一趟已經抽過籤：沿用同一份順序（返回首頁、切回這一籤）
      const { order, meta } = sessionFeedOrders.get(activePrimaryTab)!;
      feedMeta.current = meta;
      result = [...result].sort((a, b) => (order.get(String(a.id)) ?? 1e9) - (order.get(String(b.id)) ?? 1e9));
    } else if (activeSecondaryTab === "featured" && feedVariant === "v2") {
      const signals: FeedSignals = {
        seriesPref: userSeriesPref.size > 0 ? userSeriesPref : globalSeriesPop,
        heat: productHeat,
        follows,
        topics: feedAux.topics,
        ctr: feedAux.ctr,
        session: sessionIntent(),
        isGuest: !user,
      };
      const orderKey = `${feedSeed.current}|${activePrimaryTab}|${result.length}|${result.map((p) => p.id).join(",")}`;
      if (feedOrder.current?.key === orderKey) {
        const order = feedOrder.current.order;
        result = [...result].sort((a, b) => (order.get(String(a.id)) ?? 1e9) - (order.get(String(b.id)) ?? 1e9));
      } else {
        const feedItems = assembleFeed(result, signals, feedSeenRounds.current ?? [], seededRng(feedSeed.current));
        feedMeta.current = new Map(feedItems.map((i) => [String(i.product.id), { bucket: i.bucket, position: i.position }]));
        feedOrder.current = { key: orderKey, order: new Map(feedItems.map((i) => [String(i.product.id), i.position])) };
        result = feedItems.map((i) => i.product);
        if (result.length > 0) {
          feedFirstScreen.current = result.slice(0, 6).map((p) => String(p.id));
          sessionFeedOrders.set(activePrimaryTab, { order: feedOrder.current.order, meta: feedMeta.current });
        }
      }
    } else if (activeSecondaryTab === "featured") {
      const prefMap = userSeriesPref.size > 0 ? userSeriesPref : globalSeriesPop;
      const scored = Array.from(prefMap.values()).filter((v) => v > 0).sort((x, y) => x - y);
      const newcomerFloor = scored.length > 0 ? scored[Math.floor(scored.length / 2)] : 0;
      const NEW_WINDOW_MS = 7 * 24 * 3600 * 1000;
      const now = Date.now();
      const scoreOf = (p: HomeProduct) => {
        const base = prefMap.get(p.series || "") || 0;
        const age = p.created_at ? now - new Date(p.created_at).getTime() : Infinity;
        return age <= NEW_WINDOW_MS ? Math.max(base, newcomerFloor) : base;
      };
      const byScore = [...result].sort((a, b) => {
        const sd = scoreOf(b) - scoreOf(a);
        if (sd !== 0) return sd;
        const hd = heatOf(b) - heatOf(a);
        if (hd !== 0) return hd;
        return createdAt(b) - createdAt(a);
      });
      const head = byScore.slice(0, HEAD_KEEP);
      const tail = byScore.slice(HEAD_KEEP);
      const rankKey = (p: HomeProduct) => {
        const w = (scoreOf(p) + heatOf(p) + 1) * (seenTop.current.has(String(p.id)) ? SEEN_DEMOTE : 1);
        return Math.pow(jitterOf(String(p.id)), 1 / w);
      };
      tail.sort((a, b) => rankKey(b) - rankKey(a));
      result = [...head, ...tail];
      if (result.length > 0) sessionFeedOrders.set(activePrimaryTab, {
        order: new Map(result.map((p, i) => [String(p.id), i])),
        meta: feedMeta.current,
      });
      try { sessionStorage.setItem("ggb:feed:seen", JSON.stringify(result.slice(0, 24).map((p) => String(p.id)))); } catch {}
    } else {
      // 系列籤：商品熱度 → 新到舊
      result.sort((a, b) => {
        const hd = heatOf(b) - heatOf(a);
        return hd !== 0 ? hd : createdAt(b) - createdAt(a);
      });
    }
    if (sortMode !== "sold-out") {
      const isEndedOrSoldOut = (p: HomeProduct) => (typeof p.remaining === "number" && p.remaining <= 0) || p.status === "ended";
      result = [...result.filter((p) => !isEndedOrSoldOut(p)), ...result.filter(isEndedOrSoldOut)];
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, filterByPrimaryTab, activePrimaryTab, activeSecondaryTab, sortMode, userSeriesPref, globalSeriesPop, productHeat, feedVariant, feedAux, follows, user]);

  // 首屏記進「看過記憶」（排序穩定後才寫，跟手機版一樣）
  useEffect(() => {
    const first = feedFirstScreen.current;
    if (!first || !first.length) return;
    feedFirstScreen.current = null;
    saveRound(first);
  }, [items]);

  /* ── 收藏（愛心）：直接寫 product_follows，訪客先去登入 ── */
  const toggleFollow = useCallback(async (productId: number) => {
    if (!user?.id) { router.push("/login"); return; }
    const has = follows.has(productId);
    setFollows((prev) => { const next = new Set(prev); if (has) next.delete(productId); else next.add(productId); return next; });
    try {
      if (has) await supabase.from("product_follows").delete().eq("user_id", user.id).eq("product_id", productId);
      else await supabase.from("product_follows").insert({ user_id: user.id, product_id: productId });
    } catch {}
  }, [user?.id, follows, supabase, router]);

  return {
    primaryTabs, activePrimaryTab, setActivePrimaryTab,
    secondaryTabs, activeSecondaryTab, setActiveSecondaryTab,
    sortMode, setSortMode, sortOptions,
    items, feedMeta, follows, toggleFollow,
  };
}
