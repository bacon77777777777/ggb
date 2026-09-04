"use client";

/**
 * 首頁「綜合」底下的二級頁籤：推薦＋系列（老闆 2026-09-04：cardx 首頁的膠囊列改成真資料，演算法要一樣）。
 *
 * 演算法**照抄手機首頁**（app/page.tsx 的 seriesTabs）：系列出現在哪些商品裡先數一遍，
 * 排序依序看 ①玩家自己的系列偏好（get_user_series_preferences，登入才有）
 * ②全站系列人氣（get_popular_series）③該系列商品數，最多 20 顆，標籤超過 8 字截斷。
 * 「綜合」只算類別開關是 on 的商品（維護中／關閉的不列）。
 * 手機那份沒有動，這裡是複製一份給 cardx 用——兩邊要改要一起改。
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { categoryState } from "@/lib/categoryFlags";
import type { HomeProduct } from "@/lib/queries/home";

const MAX_SERIES_TABS = 20;

export interface SecondaryTab { id: string; label: string }

export function useHomeSecondaryTabs(products: HomeProduct[]): SecondaryTab[] {
  const [supabase] = useState(() => createClient());
  const { user } = useAuth();
  const { states: flagStates } = useFeatureFlags();
  const [userSeriesPref, setUserSeriesPref] = useState<Map<string, number>>(new Map());
  const [globalSeriesPop, setGlobalSeriesPop] = useState<Map<string, number>>(new Map());

  // 全站系列人氣（新玩家的預設排序）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_popular_series");
        if (cancelled || !Array.isArray(data)) return;
        const map = new Map<string, number>();
        for (const row of data as Array<{ series: string; score: number }>) {
          if (row.series) map.set(row.series, Number(row.score) || 0);
        }
        setGlobalSeriesPop(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // 登入玩家的系列偏好
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_user_series_preferences", { p_user_id: user.id, p_limit: 10 });
        if (cancelled || !Array.isArray(data)) return;
        const map = new Map<string, number>();
        for (const row of data as Array<{ series: string; score: number }>) {
          if (row.series) map.set(row.series, Number(row.score) || 0);
        }
        setUserSeriesPref(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user?.id, supabase]);

  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (categoryState(p.type, flagStates, false) !== "on") continue;
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
  }, [products, flagStates, userSeriesPref, globalSeriesPop]);
}
