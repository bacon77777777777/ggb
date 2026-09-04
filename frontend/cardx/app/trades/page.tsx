"use client";

/**
 * 卡牌交換（桌機版，768 以上）—— 真資料
 *
 * 玩家貼一張「我拿出這幾張、想換這幾張」的公告，別人看到就拿啟動碼開單。
 * 資料在 `exchange_offers` + `exchange_offer_cards`（跟手機版 /exchange 同一批），
 * 擁有者的暱稱與頭像走 `get_user_displays` RPC（users 表只看得到自己的）。
 *
 * ⚠️ 這頁原本是 cardx 的 mock：120 筆用 seed 亂數生出來的提案、清一色 @coddy20123、
 * 寫死的「+18%」「PSA 10」「50+卡牌可交換」「總價值約 $20,000」「23分鐘前」，
 * 還有一塊只存 localStorage 的「我的提案」。全部拿掉：
 *   ・列表 → exchange_offers（status=active，30 筆一頁，捲到底接下一頁）
 *   ・我的交換 → 自己 owner_id 的那幾筆，點進去可以看啟動碼
 *   ・價值 → exchange_offer_cards.value 加總
 *   ・排序 → 最新上架／價值高到低／價值低到高（同手機版）
 *   ・系列頁籤 → 卡片自己帶的 series
 *
 * ⚠️ 兩側標題用「對方拿出／對方想要」，不是「你將獲得／你將失去」——
 * side='give' 是刊登者自己填的「我拿出」、side='want' 是「我想要」，
 * 用刊登者的說法就不會有「這是誰的視角」的疑問。
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { FilterIcon, PillSelect, VendorIcon } from "@/cardx/components/ui/PillSelect";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureGate } from "@/lib/useFeatureGate";
import { useRequireLogin } from "@/hooks/useRequireLogin";
import { asset } from "@/lib/asset";
import { ago } from "@/components/market/ui";

const AVATAR_FALLBACK = asset("/images/avatar.webp");
const PAGE_SIZE = 30;

type SortKey = "latest" | "valueDesc" | "valueAsc";
type SearchTab = "give" | "want";

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "latest", label: "最新上架" },
  { key: "valueDesc", label: "價值由高到低" },
  { key: "valueAsc", label: "價值由低到高" },
];

type ExchangeCard = {
  id: string;
  name: string;
  image: string;
  series: string;
  value: number;
};

type ExchangeOffer = {
  id: string;
  owner: { id: string; name: string; avatar: string };
  /** side='give'：刊登者拿出來的 */
  give: ExchangeCard[];
  /** side='want'：刊登者想換到的 */
  want: ExchangeCard[];
  createdAt: string;
  status: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const toCard = (r: any): ExchangeCard => ({
  id: String(r.external_id || ""),
  name: String(r.name || ""),
  image: String(r.image_url || ""),
  series: String(r.series || ""),
  value: typeof r.value === "number" ? r.value : Number(r.value || 0),
});

const sumValue = (cards: ExchangeCard[]) => cards.reduce((s, c) => s + (c.value || 0), 0);
const formatTwd = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

const OFFER_SELECT = `
  id,
  owner_id,
  status,
  created_at,
  cards:exchange_offer_cards (
    side,
    external_id,
    name,
    series,
    image_url,
    value,
    position
  )
`;

function mapOffers(rows: any[], displayById: Map<string, { name: string; avatar: string }>): ExchangeOffer[] {
  return rows.map((row) => {
    const ownerId = String(row.owner_id || "");
    const display = displayById.get(ownerId) || { name: "user", avatar: AVATAR_FALLBACK };
    const cardRows = Array.isArray(row.cards) ? [...row.cards] : [];
    cardRows.sort((a: any, b: any) => (Number(a.position) || 0) - (Number(b.position) || 0));
    return {
      id: String(row.id),
      owner: { id: ownerId, name: display.name, avatar: display.avatar },
      give: cardRows.filter((c: any) => c.side === "give").map(toCard),
      want: cardRows.filter((c: any) => c.side === "want").map(toCard),
      createdAt: String(row.created_at || ""),
      status: String(row.status || "active"),
    };
  });
}

async function loadDisplays(ownerIds: string[]): Promise<Map<string, { name: string; avatar: string }>> {
  const out = new Map<string, { name: string; avatar: string }>();
  const ids = Array.from(new Set(ownerIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const { data, error } = await createClient().rpc("get_user_displays", { p_ids: ids });
  if (error) return out;
  for (const d of (Array.isArray(data) ? data : []) as any[]) {
    const id = String(d.id || "");
    if (!id) continue;
    out.set(id, { name: String(d.name || "user"), avatar: String(d.avatar_url || AVATAR_FALLBACK) });
  }
  return out;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zm6.2-1.1L21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div style={{ borderRadius: 16, border: "1px solid #e5e7eb", background: "#ffffff", padding: 14, display: "grid", gap: 12 }}>
      <div style={{ height: 34, borderRadius: 10, background: "#f3f4f6" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ height: 120, borderRadius: 10, background: "#f3f4f6" }} />
        <div style={{ height: 120, borderRadius: 10, background: "#f3f4f6" }} />
      </div>
    </div>
  );
}

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        borderRadius: 14,
        border: "1px dashed #d1d5db",
        background: "#f9fafb",
        padding: "48px 20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 900, color: "#111827" }}>{text}</div>
      {hint ? <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{hint}</div> : null}
    </div>
  );
}

/** 一側的卡圖牆：1~4 張，照 cardx 既有的四種排法 */
function ThumbWall({ cards }: { cards: ExchangeCard[] }) {
  const shown = cards.slice(0, 4);
  const n = shown.length;
  if (n === 0) {
    return (
      <div className={`${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridOne}`}>
        <div className={homeStyles.tradeThumb} style={{ background: "#f3f4f6" }} />
      </div>
    );
  }
  const gridClass =
    n === 1
      ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridOne}`
      : n === 2
        ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridTwo}`
        : n === 3
          ? `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridThree}`
          : `${homeStyles.tradeThumbGrid} ${homeStyles.tradeThumbGridFour}`;
  const tileClassFor = (idx: number) =>
    n === 3 && idx === 2 ? `${homeStyles.tradeThumb} ${homeStyles.tradeThumbSpan2}` : homeStyles.tradeThumb;

  return (
    <div className={gridClass}>
      {shown.map((c, idx) => (
        <div key={`${c.id}_${idx}`} className={tileClassFor(idx)} title={c.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={c.name} className={homeStyles.tradeThumbImg} src={c.image} style={{ objectFit: "contain" }} />
          {c.series ? <div className={homeStyles.tradeThumbOverlay}>{c.series}</div> : null}
        </div>
      ))}
    </div>
  );
}

export default function TradesPage() {
  useFeatureGate("exchange"); // 功能關閉／維護中、或在 App 內 → 直接 404
  const router = useRouter();
  const { user } = useAuth();
  const requireLogin = useRequireLogin();

  const [sortKey, setSortKey] = useState<SortKey>("latest");
  const [seriesKey, setSeriesKey] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [searchTab, setSearchTab] = useState<SearchTab>("give");

  const [offers, setOffers] = useState<ExchangeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState("");

  const [myOffers, setMyOffers] = useState<ExchangeOffer[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  const [columns, setColumns] = useState(2);

  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pageRef = useRef(0);

  const searchActive = query.trim().length > 0;

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(draft.trim()), 300);
    return () => window.clearTimeout(t);
  }, [draft]);

  const loadPage = useCallback(async (page: number) => {
    if (page === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const from = page * PAGE_SIZE;
      const { data, error } = await createClient()
        .from("exchange_offers")
        .select(OFFER_SELECT)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as any[];
      const displays = await loadDisplays(rows.map((r) => String(r.owner_id || "")));
      const mapped = mapOffers(rows, displays);
      setOffers((prev) => {
        if (page === 0) return mapped;
        const seen = new Set(prev.map((o) => o.id));
        return [...prev, ...mapped.filter((o) => !seen.has(o.id))];
      });
      if (rows.length < PAGE_SIZE) setDone(true);
      pageRef.current = page;
    } catch {
      setNotice("讀取交換列表失敗，請稍後再試");
      if (page === 0) setOffers([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    pageRef.current = 0;
    setDone(false);
    loadPage(0);
  }, [loadPage]);

  const loadMyOffers = useCallback(async () => {
    if (!user) {
      setMyOffers([]);
      return;
    }
    setMyLoading(true);
    try {
      const { data, error } = await createClient()
        .from("exchange_offers")
        .select(OFFER_SELECT)
        .eq("owner_id", user.id)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as any[];
      const displays = await loadDisplays(rows.map((r) => String(r.owner_id || "")));
      setMyOffers(mapOffers(rows, displays));
    } catch {
      setMyOffers([]);
    } finally {
      setMyLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadMyOffers();
  }, [loadMyOffers]);

  /* 捲到底接下一頁 */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done || loading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingMore) loadPage(pageRef.current + 1);
      },
      { rootMargin: "300px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [done, loading, loadingMore, loadPage]);

  useEffect(() => {
    const gap = 16;
    const minCardWidth = 340;
    const maxCardWidth = 420;
    function computeColumns() {
      const el = listRef.current;
      if (!el) return;
      const wvw = window.innerWidth;
      if (wvw <= 640) {
        setColumns((prev) => (prev === 1 ? prev : 1));
        return;
      }
      if (wvw <= 1023) {
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

  /* 系列頁籤照已載入的卡片自己長出來（DB 沒有系列表，series 是卡片帶的） */
  const seriesOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const o of offers) {
      for (const c of [...o.give, ...o.want]) {
        const s = c.series.trim();
        if (!s) continue;
        count.set(s, (count.get(s) || 0) + 1);
      }
    }
    const list = [...count.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([name, n]) => ({ key: name, label: `${name}（${n}）` }));
    return [{ key: "", label: "全部系列" }, ...list];
  }, [offers]);

  const seriesFiltered = useMemo(() => {
    if (!seriesKey) return offers;
    return offers.filter((o) => [...o.give, ...o.want].some((c) => c.series.toLowerCase() === seriesKey.toLowerCase()));
  }, [offers, seriesKey]);

  const q = query.trim().toLowerCase();

  const giveCount = useMemo(
    () => (q ? seriesFiltered.filter((o) => o.give.some((c) => c.name.toLowerCase().includes(q))).length : 0),
    [seriesFiltered, q]
  );
  const wantCount = useMemo(
    () => (q ? seriesFiltered.filter((o) => o.want.some((c) => c.name.toLowerCase().includes(q))).length : 0),
    [seriesFiltered, q]
  );

  const items = useMemo(() => {
    let out = seriesFiltered;
    if (q) {
      out = out.filter((o) => {
        const side = searchTab === "give" ? o.give : o.want;
        if (side.some((c) => c.name.toLowerCase().includes(q))) return true;
        return o.owner.name.toLowerCase().includes(q);
      });
    }
    if (sortKey === "latest") return out;
    const total = (o: ExchangeOffer) => sumValue(o.give) + sumValue(o.want);
    return [...out].sort((a, b) => (sortKey === "valueAsc" ? total(a) - total(b) : total(b) - total(a)));
  }, [seriesFiltered, q, searchTab, sortKey]);

  const goNew = () => {
    if (!requireLogin("登入後就可以貼出你的交換")) return;
    router.push("/trades/new");
  };

  const tabPillStyle = (active: boolean): React.CSSProperties => ({
    height: 33,
    padding: "0 12px",
    borderRadius: 12,
    border: active ? "1px solid #111827" : "1px solid transparent",
    background: active ? "#111827" : "transparent",
    color: active ? "#ffffff" : "#111827",
    fontSize: 13,
    fontWeight: 850,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

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
                    color: "#111827",
                    fontFamily:
                      'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  卡牌交換
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
                  onClick={goNew}
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

                <div style={{ position: "relative", flex: "0 0 auto", width: "clamp(160px, 18vw, 220px)" }}>
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#6b7280",
                      pointerEvents: "none",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <SearchIcon />
                  </div>

                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="搜尋卡牌"
                    placeholder="卡牌名稱或玩家"
                    style={{
                      width: "100%",
                      height: 38,
                      borderRadius: 12,
                      border: 0,
                      background: "#f3f4f6",
                      color: "#111827",
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
                        setDraft("");
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
                        background: "#e5e7eb",
                        color: "#374151",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <XIcon />
                    </button>
                  ) : null}
                </div>

                <PillSelect value={sortKey} onChange={(next) => setSortKey(next)} options={sortOptions} ariaLabel="排序" icon={<FilterIcon />} borderless />
                <PillSelect value={seriesKey} onChange={(next) => setSeriesKey(next)} options={seriesOptions} ariaLabel="系列" icon={<VendorIcon />} borderless />
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
                    border: "1px solid #e5e7eb",
                    background: "#f3f4f6",
                    padding: 4,
                    gap: 4,
                  }}
                >
                  <button type="button" onClick={() => setSearchTab("give")} style={tabPillStyle(searchTab === "give")}>
                    有人拿出這張（{giveCount}）
                  </button>
                  <button type="button" onClick={() => setSearchTab("want")} style={tabPillStyle(searchTab === "want")}>
                    有人在找這張（{wantCount}）
                  </button>
                </div>
                <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>搜尋：{query}</div>
              </div>
            ) : null}

            {notice ? (
              <div
                role="status"
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#111827",
                }}
              >
                {notice}
              </div>
            ) : null}

            <section aria-label="我的交換" style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", letterSpacing: "0.02em" }}>我的交換</div>
                {myOffers.length > 0 ? <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{myOffers.length} 筆</div> : null}
              </div>

              {!user ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    border: "1px dashed #d1d5db",
                    background: "#f9fafb",
                    padding: "16px 14px",
                    color: "#6b7280",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  登入之後，你貼出的交換會列在這裡。
                </div>
              ) : myLoading ? (
                <div style={{ marginTop: 10, color: "#9ca3af", fontSize: 13, fontWeight: 900 }}>載入中</div>
              ) : myOffers.length === 0 ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    border: "1px dashed #d1d5db",
                    background: "#f9fafb",
                    padding: "16px 14px",
                    color: "#6b7280",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  你還沒有貼出任何交換，點右上角「建立交換」開始你的第一筆。
                </div>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                  {myOffers.map((o) => (
                    <Link
                      key={o.id}
                      href={`/trades/${o.id}`}
                      style={{
                        display: "grid",
                        gap: 8,
                        textDecoration: "none",
                        borderRadius: 14,
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        padding: "12px 14px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {o.give[0]?.name || "（沒有填拿出的卡）"}
                        </div>
                        <span
                          style={{
                            flex: "0 0 auto",
                            fontSize: 11,
                            fontWeight: 900,
                            color: o.status === "active" ? "#1d4ed8" : "#374151",
                            background: o.status === "active" ? "rgba(34,131,246,0.14)" : "#f3f4f6",
                            borderRadius: 999,
                            padding: "3px 10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {o.status === "active" ? "刊登中" : "已結束"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        拿出 {o.give.length} 張 · 想要 {o.want.length} 張
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280" }}>{o.createdAt ? `${ago(o.createdAt)}貼出` : ""}</div>
                    </Link>
                  ))}
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
                {loading ? (
                  Array.from({ length: columns * 2 }).map((_, i) => <SkeletonCard key={`sk_${i}`} />)
                ) : items.length === 0 ? (
                  <Empty
                    text={searchActive ? "找不到符合的交換" : "目前沒有人貼交換"}
                    hint={searchActive ? "換個卡名，或看看其他系列" : "有想換的卡，點右上角「建立交換」貼一則"}
                  />
                ) : (
                  items.map((offer) => (
                    <div
                      className={`${homeStyles.item4} ${homeStyles.tradeItem}`}
                      key={offer.id}
                      style={{ width: "100%", maxWidth: "none", cursor: "pointer" }}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/trades/${offer.id}`)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        router.push(`/trades/${offer.id}`);
                      }}
                    >
                      <div className={homeStyles.tradeCard}>
                        <div className={homeStyles.tradeHeader}>
                          <div className={homeStyles.tradeHeaderLeft}>
                            <div
                              className={homeStyles.tradeAvatar}
                              aria-hidden="true"
                              style={{
                                backgroundImage: `url(${offer.owner.avatar || AVATAR_FALLBACK})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }}
                            />
                            <div className={homeStyles.tradeHeaderText}>
                              <div className={homeStyles.tradeUserRow}>
                                <span className={homeStyles.tradeUserHandle}>@{offer.owner.name}</span>
                              </div>
                              <div className={homeStyles.tradeHeaderSub}>
                                拿出 {offer.give.length} 張 · 想要 {offer.want.length} 張
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={homeStyles.tradeBody}>
                          <div className={homeStyles.tradeSide}>
                            <div className={homeStyles.tradeSideTitle}>對方拿出</div>
                            <ThumbWall cards={offer.give} />
                            <div className={homeStyles.tradeValueRow}>
                              <span>約價值</span>
                              <span>{formatTwd(sumValue(offer.give))}</span>
                            </div>
                          </div>

                          <svg className={homeStyles.tradeSwapIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M12 3C10.7839 3.00179 9.58073 3.25003 8.46322 3.72973C7.3457 4.20942 6.33699 4.91063 5.498 5.791L3.854 4.146C3.78407 4.07589 3.6949 4.02813 3.59779 4.00876C3.50068 3.9894 3.40001 3.9993 3.30854 4.03722C3.21706 4.07513 3.13891 4.13936 3.08398 4.22175C3.02905 4.30414 2.99982 4.40098 3 4.5V9C3 9.26522 3.10536 9.51957 3.29289 9.70711C3.48043 9.89464 3.73478 10 4 10H8.5C8.59902 10.0002 8.69586 9.97095 8.77825 9.91602C8.86064 9.86109 8.92487 9.78294 8.96279 9.69146C9.0007 9.59999 9.01061 9.49932 8.99124 9.40221C8.97187 9.3051 8.92411 9.21593 8.854 9.146L6.914 7.207C7.56678 6.51217 8.35461 5.95802 9.22919 5.57851C10.1038 5.199 11.0466 5.00214 12 5C13.7038 5.00118 15.3487 5.62372 16.6263 6.75093C17.9039 7.87815 18.7265 9.43263 18.94 11.123C18.9527 11.2561 18.9919 11.3853 19.0554 11.503C19.1189 11.6207 19.2053 11.7244 19.3096 11.8081C19.4139 11.8918 19.5339 11.9537 19.6626 11.9902C19.7912 12.0267 19.9258 12.037 20.0585 12.0206C20.1912 12.0041 20.3193 11.9612 20.4351 11.8944C20.5509 11.8276 20.6522 11.7383 20.7329 11.6316C20.8136 11.525 20.8721 11.4033 20.9049 11.2737C20.9377 11.1441 20.9442 11.0092 20.924 10.877C20.6485 8.70351 19.5905 6.70486 17.948 5.25503C16.3054 3.8052 14.1909 3.00352 12 3ZM3.945 12.008C3.68195 12.0407 3.44266 12.1765 3.27971 12.3856C3.11676 12.5947 3.04349 12.8599 3.076 13.123C3.3515 15.2965 4.4095 17.2951 6.05204 18.745C7.69459 20.1948 9.80912 20.9965 12 21C13.2166 21.0018 14.4206 20.7549 15.5384 20.2746C16.6561 19.7944 17.6639 19.0908 18.5 18.207L20.146 19.853C20.2159 19.923 20.3049 19.9708 20.402 19.9902C20.499 20.0096 20.5996 19.9998 20.691 19.962C20.7824 19.9242 20.8606 19.8601 20.9156 19.7779C20.9706 19.6956 21 19.5989 21 19.5V15C21 14.7348 20.8946 14.4804 20.7071 14.2929C20.5196 14.1054 20.2652 14 20 14H15.5C15.401 13.9998 15.3041 14.0291 15.2217 14.084C15.1394 14.1389 15.0751 14.2171 15.0372 14.3085C14.9993 14.4 14.9894 14.5007 15.0088 14.5978C15.0281 14.6949 15.0759 14.7841 15.146 14.854L17.086 16.793C16.4354 17.4907 15.648 18.0467 14.7724 18.4239C13.8968 18.8011 12.9527 18.9912 12 18.982C10.2962 18.9808 8.65133 18.3583 7.3737 17.2311C6.09607 16.1039 5.27347 14.5494 5.06 12.859C5.04342 12.7264 5.00084 12.5989 4.93472 12.483C4.8686 12.3671 4.78022 12.2652 4.6747 12.1831C4.56918 12.1009 4.44864 12.0401 4.31986 12.0041C4.19109 11.9682 4.05661 11.9578 3.92375 11.9735L3.945 12.008Z"
                              fill="currentColor"
                            />
                          </svg>

                          <div className={homeStyles.tradeSide}>
                            <div className={homeStyles.tradeSideTitle}>對方想要</div>
                            <ThumbWall cards={offer.want} />
                            <div className={homeStyles.tradeValueRow}>
                              <span>約價值</span>
                              <span>{formatTwd(sumValue(offer.want))}</span>
                            </div>
                          </div>
                        </div>

                        <div className={homeStyles.tradeFooter}>{offer.createdAt ? `${ago(offer.createdAt)}貼出` : ""}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
              {loadingMore ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, fontWeight: 900, color: "#9ca3af" }}>載入中</div>
              ) : done && items.length > 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, fontWeight: 900, color: "#9ca3af" }}>到底了</div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
