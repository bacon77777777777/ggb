"use client";

/**
 * 成交行情（桌機版）。
 *
 * 原本這頁叫「卡牌走勢」，十筆商品名與價格全是寫死的，走勢點是用 seed 算出來的假曲線。
 * 平台唯一真實的價格時間序列是交易所的成交紀錄，所以這頁改成列「交易所有成交過的品項」：
 *   ・public_marketplace_price_stats —— 近 90 天成交彙總（筆數／最近／平均／最低最高）
 *   ・public_marketplace_recent_deals —— 逐筆成交（只有價格與時間，買賣雙方不曝露）
 * 沒有成交就顯示空狀態，不補假資料。
 */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { PageHeader, Pill, SecondaryButton, SurfaceCard, TextField } from "@/cardx/components/ui/Kit";
import { createClient } from "@/lib/supabase/client";
import { TYPE_LABEL, fetchRecentDeals, type DealPoint } from "@/app/market/data";

type RangeKey = "7d" | "30d" | "90d";
type SortKey = "hot" | "gainers" | "losers" | "recent";

const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: "7d", label: "近 7 天", days: 7 },
  { key: "30d", label: "近 30 天", days: 30 },
  { key: "90d", label: "近 90 天", days: 90 },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "hot", label: "成交最多" },
  { key: "recent", label: "最近成交" },
  { key: "gainers", label: "漲最多" },
  { key: "losers", label: "跌最多" },
];

type Item = {
  prizeId: number;
  name: string;
  level: string;
  image: string | null;
  productName: string;
  productType: string;
  dealCount: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  lastPrice: number;
  lastDealAt: string;
  deals: DealPoint[];
};

function gnum(n: number) {
  return Math.round(n).toLocaleString();
}

function md(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 只有價格點的迷你折線；一筆成交畫不了線，直接回一條淡底 */
function Spark({ deals, color }: { deals: DealPoint[]; color: string }) {
  const W = 120;
  const H = 34;
  if (deals.length < 2) {
    return <div style={{ width: W, height: H, borderRadius: 8, background: "#f3f4f6" }} />;
  }
  const lo = Math.min(...deals.map((d) => d.price));
  const hi = Math.max(...deals.map((d) => d.price));
  const range = Math.max(1, hi - lo);
  const pts = deals
    .map((d, i) => {
      const x = (i / (deals.length - 1)) * (W - 4) + 2;
      const y = H - 3 - ((d.price - lo) / range) * (H - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: "block" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function deltaColor(pct: number) {
  if (pct > 0.05) return "#16a34a";
  if (pct < -0.05) return "#dc2626";
  return "#6b7280";
}

export default function TrendsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [range, setRange] = useState<RangeKey>("30d");
  const [sort, setSort] = useState<SortKey>("hot");
  const [type, setType] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [selectedDeals, setSelectedDeals] = useState<DealPoint[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createClient();
      const { data: stats } = await sb
        .from("public_marketplace_price_stats")
        .select("product_prize_id, deal_count, min_price, max_price, avg_price, last_price, last_deal_at")
        .order("deal_count", { ascending: false })
        .limit(60);

      const statRows = (stats ?? []) as Array<{
        product_prize_id: number;
        deal_count: number;
        min_price: number;
        max_price: number;
        avg_price: number;
        last_price: number;
        last_deal_at: string;
      }>;
      if (!statRows.length) {
        if (alive) setItems([]);
        return;
      }

      const ids = statRows.map((s) => Number(s.product_prize_id));
      const [{ data: prizes }, { data: deals }] = await Promise.all([
        sb.from("product_prizes").select("id, product_id, level, name, image_url").in("id", ids),
        sb
          .from("public_marketplace_recent_deals")
          .select("product_prize_id, price, created_at")
          .in("product_prize_id", ids)
          .order("created_at", { ascending: true })
          .limit(2000),
      ]);

      const prizeRows = (prizes ?? []) as Array<{
        id: number;
        product_id: number;
        level: string | null;
        name: string | null;
        image_url: string | null;
      }>;
      const productIds = [...new Set(prizeRows.map((p) => p.product_id).filter(Boolean))];
      const { data: products } = productIds.length
        ? await sb.from("products").select("id, name, type").in("id", productIds)
        : { data: [] as Array<{ id: number; name: string; type: string }> };
      const productById = new Map(
        ((products ?? []) as Array<{ id: number; name: string; type: string }>).map((p) => [Number(p.id), p]),
      );
      const prizeById = new Map(prizeRows.map((p) => [Number(p.id), p]));

      const dealsByPrize = new Map<number, DealPoint[]>();
      for (const d of (deals ?? []) as Array<{ product_prize_id: number; price: number; created_at: string }>) {
        const key = Number(d.product_prize_id);
        const list = dealsByPrize.get(key) ?? [];
        list.push({ price: Number(d.price) || 0, createdAt: String(d.created_at) });
        dealsByPrize.set(key, list);
      }

      const next: Item[] = statRows.map((s) => {
        const id = Number(s.product_prize_id);
        const prize = prizeById.get(id);
        const product = prize ? productById.get(Number(prize.product_id)) : undefined;
        return {
          prizeId: id,
          name: prize?.name || "未知品項",
          level: prize?.level || "",
          image: prize?.image_url || null,
          productName: product?.name || "",
          productType: product?.type || "",
          dealCount: Number(s.deal_count) || 0,
          minPrice: Number(s.min_price) || 0,
          maxPrice: Number(s.max_price) || 0,
          avgPrice: Number(s.avg_price) || 0,
          lastPrice: Number(s.last_price) || 0,
          lastDealAt: String(s.last_deal_at),
          deals: dealsByPrize.get(id) ?? [],
        };
      });
      if (alive) setItems(next);
    })().catch(() => {
      if (alive) setItems([]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const days = RANGES.find((r) => r.key === range)?.days ?? 30;

  /** 依時間窗切出這一段的成交，順便算漲跌（第一筆 → 最後一筆） */
  const view = useMemo(() => {
    const since = Date.now() - days * 86400000;
    return (items ?? []).map((it) => {
      const windowed = it.deals.filter((d) => new Date(d.createdAt).getTime() >= since);
      const first = windowed[0]?.price ?? 0;
      const last = windowed[windowed.length - 1]?.price ?? 0;
      const deltaPct = windowed.length >= 2 && first > 0 ? ((last - first) / first) * 100 : 0;
      return { ...it, windowed, deltaPct, windowCount: windowed.length };
    });
  }, [items, days]);

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of view) if (it.productType) counts.set(it.productType, (counts.get(it.productType) ?? 0) + 1);
    return [...counts.entries()].map(([key, count]) => ({ key, label: TYPE_LABEL[key] || key, count }));
  }, [view]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = view
      .filter((it) => it.windowCount > 0)
      .filter((it) => (type ? it.productType === type : true))
      .filter((it) => (q ? `${it.name} ${it.productName} ${it.level}`.toLowerCase().includes(q) : true));
    const sorted = [...rows];
    if (sort === "hot") sorted.sort((a, b) => b.windowCount - a.windowCount || b.dealCount - a.dealCount);
    else if (sort === "recent") sorted.sort((a, b) => new Date(b.lastDealAt).getTime() - new Date(a.lastDealAt).getTime());
    else if (sort === "gainers") sorted.sort((a, b) => b.deltaPct - a.deltaPct);
    else sorted.sort((a, b) => a.deltaPct - b.deltaPct);
    return sorted;
  }, [view, type, query, sort]);

  async function openDetail(it: Item) {
    setSelected(it);
    setSelectedDeals(null);
    try {
      setSelectedDeals(await fetchRecentDeals(it.prizeId));
    } catch {
      setSelectedDeals(it.deals);
    }
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: active ? "1px solid transparent" : "1px solid #e5e7eb",
    background: active ? "rgb(var(--primary))" : "#ffffff",
    color: active ? "#ffffff" : "#374151",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="成交行情" subtitle="交易所實際成交過的品項與近期價格" />

            <SurfaceCard style={{ marginTop: 14, width: "100%", display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {RANGES.map((r) => (
                  <button key={r.key} type="button" onClick={() => setRange(r.key)} style={chipStyle(range === r.key)}>
                    {r.label}
                  </button>
                ))}
                <div style={{ width: 1, background: "#e5e7eb", margin: "2px 4px" }} />
                {SORTS.map((s) => (
                  <button key={s.key} type="button" onClick={() => setSort(s.key)} style={chipStyle(sort === s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
              {types.length > 1 ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setType("")} style={chipStyle(type === "")}>
                    全部
                  </button>
                  {types.map((t) => (
                    <button key={t.key} type="button" onClick={() => setType(t.key)} style={chipStyle(type === t.key)}>
                      {t.label}（{t.count}）
                    </button>
                  ))}
                </div>
              ) : null}
              <div style={{ maxWidth: 320 }}>
                <TextField label="找品項" value={query} onChange={setQuery} placeholder="品項名稱或來源商品" />
              </div>
            </SurfaceCard>

            <div style={{ marginTop: 14, display: "grid", gap: 12, width: "100%" }}>
              {items === null ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <SurfaceCard key={i} style={{ height: 92 }}>
                      <div style={{ height: 16, width: "40%", borderRadius: 6, background: "#f3f4f6" }} />
                      <div style={{ marginTop: 12, height: 12, width: "70%", borderRadius: 6, background: "#f3f4f6" }} />
                    </SurfaceCard>
                  ))}
                </div>
              ) : shown.length === 0 ? (
                <SurfaceCard style={{ padding: 28, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>
                    {items.length === 0 ? "還沒有成交紀錄" : "這個條件下沒有成交紀錄"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 750, color: "#6b7280" }}>
                    {items.length === 0
                      ? "交易所有人成交之後，價格與走勢就會顯示在這裡。"
                      : "換個時間範圍或分類看看。"}
                  </div>
                  <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                    <SecondaryButton href="/market">去交易所逛逛</SecondaryButton>
                  </div>
                </SurfaceCard>
              ) : (
                shown.map((it) => {
                  const color = deltaColor(it.deltaPct);
                  return (
                    <SurfaceCard key={it.prizeId} style={{ padding: 12 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openDetail(it)}
                        onKeyDown={(ev) => {
                          if (ev.key !== "Enter" && ev.key !== " ") return;
                          ev.preventDefault();
                          openDetail(it);
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                      >
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 12,
                            background: "#f3f4f6",
                            flex: "0 0 auto",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {it.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          ) : null}
                        </div>

                        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: "#111827", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.level ? `${it.level}｜` : ""}
                            {it.name}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.productName || "來源商品不明"}・{it.windowCount} 筆成交・最後成交 {md(it.lastDealAt)}
                          </div>
                        </div>

                        <Spark deals={it.windowed} color={color} />

                        <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 104 }}>
                          <div style={{ fontSize: 15, fontWeight: 950, color: "#111827" }}>{gnum(it.lastPrice)} G</div>
                          <div style={{ marginTop: 2, fontSize: 12, fontWeight: 900, color }}>
                            {it.windowCount >= 2 ? `${it.deltaPct >= 0 ? "+" : ""}${it.deltaPct.toFixed(1)}%` : "—"}
                          </div>
                        </div>
                      </div>

                      {selected?.prizeId === it.prizeId ? (
                        <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Pill tone="muted">近 90 天 {it.dealCount} 筆</Pill>
                            <Pill tone="muted">平均 {gnum(it.avgPrice)} G</Pill>
                            <Pill tone="muted">最低 {gnum(it.minPrice)} G</Pill>
                            <Pill tone="muted">最高 {gnum(it.maxPrice)} G</Pill>
                          </div>
                          <div style={{ display: "grid", gap: 6 }}>
                            {selectedDeals === null ? (
                              <div style={{ height: 40, borderRadius: 10, background: "#f3f4f6" }} />
                            ) : selectedDeals.length === 0 ? (
                              <div style={{ fontSize: 12, fontWeight: 750, color: "#9ca3af" }}>近 90 天沒有成交紀錄。</div>
                            ) : (
                              [...selectedDeals]
                                .reverse()
                                .slice(0, 8)
                                .map((d, i) => (
                                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                                    <span>{md(d.createdAt)} 成交</span>
                                    <b style={{ color: "#111827" }}>{gnum(d.price)} G</b>
                                  </div>
                                ))
                            )}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <SecondaryButton onClick={() => setSelected(null)} style={{ height: 34, borderRadius: 10 }}>
                              收起
                            </SecondaryButton>
                            <SecondaryButton href="/market" style={{ height: 34, borderRadius: 10 }}>
                              去交易所
                            </SecondaryButton>
                          </div>
                        </div>
                      ) : null}
                    </SurfaceCard>
                  );
                })
              )}
            </div>

            {items && items.length > 0 ? (
              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 750, color: "#9ca3af" }}>
                價格取自交易所玩家之間的實際成交，僅供參考。
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
