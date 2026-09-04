"use client";

/**
 * 交易所（桌機版，768 以上）—— 真資料
 *
 * 玩家把倉庫裡抽到的品項掛上來換 G 幣。資料層整支在 `app/market/data.ts`
 * （手機版與這頁共用），這裡只負責把它畫成 cardx 的版型。
 *
 * ⚠️ 這頁原本是 cardx 的 mock（`lib/mock/home` 的 120 筆假卡片、FMV 折扣標）。
 * 那套「卡片市集 FMV」的語意跟我們的交易所對不上 —— 我們沒有第三方估值，
 * 只有 `public_marketplace_price_stats` 的近 90 天成交行情，而那是逐品項查的，
 * 列表上不會每張卡都打一次。所以 FMV 與 -18% 折扣標整個拿掉，
 * 卡片改露真正有的東西：賞等、賣家、G 幣售價。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { FilterIcon, PillSelect, VendorIcon } from "@/cardx/components/ui/PillSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureGate } from "@/lib/useFeatureGate";
import { useRequireLogin } from "@/hooks/useRequireLogin";
import { asset } from "@/lib/asset";
import { gnum, ago } from "@/components/market/ui";
import {
  fetchFeed, fetchFacets, fetchSettings, fetchMyListings, fetchMyDeals, fetchSellable,
  createListing, cancelListing, levelAllowed,
  PAGE_SIZE, SORTS, TYPE_LABEL,
  type Listing, type MyListing, type Deal, type Sellable, type MarketSettings, type SortKey, type Facets,
} from "@/app/market/data";

const FALLBACK = asset("/images/item_defaulet.webp");
const GCOIN = asset("/images/gcoin.webp");

type Tab = "feed" | "mine" | "deals";
type TypeKey = string;

const sortOptions = SORTS.map((s) => ({ key: s.key, label: s.label }));

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

/** 骨架卡：載入中不要用轉圈圈，也不要整頁蓋掉（頂欄的搜尋與頁籤要留著能用） */
function SkeletonCard() {
  return (
    <div style={{ borderRadius: 14, border: "1px solid #e5e7eb", background: "#ffffff", overflow: "hidden" }}>
      <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#f3f4f6" }} />
      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        <div style={{ height: 12, borderRadius: 6, background: "#f3f4f6" }} />
        <div style={{ height: 12, width: "58%", borderRadius: 6, background: "#f3f4f6" }} />
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

const levelPillStyle: React.CSSProperties = {
  position: "absolute",
  left: 8,
  top: 8,
  padding: "3px 9px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.82)",
  color: "#ffffff",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
};

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  height: 34,
  padding: "0 14px",
  borderRadius: 12,
  border: active ? "1px solid #111827" : "1px solid #e5e7eb",
  background: active ? "#111827" : "#ffffff",
  color: active ? "#ffffff" : "#374151",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export default function MarketPage() {
  useFeatureGate("market"); // 功能關閉／維護中、或在 App 內 → 直接 404
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const requireLogin = useRequireLogin();

  const [tab, setTab] = useState<Tab>("feed");
  const [settings, setSettings] = useState<MarketSettings | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [notice, setNotice] = useState("");

  /* ── 逛街 ── */
  const [sortKey, setSortKey] = useState<SortKey>("new");
  const [typeKey, setTypeKey] = useState<TypeKey>("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [columns, setColumns] = useState(5);

  /* ── 我的上架 / 交易紀錄 ── */
  const [mine, setMine] = useState<MyListing[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [sellable, setSellable] = useState<Sellable[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  /* ── 上架面板 ── */
  const [sellOpen, setSellOpen] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [busy, setBusy] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemsLenRef = useRef(0);
  itemsLenRef.current = items.length;

  const searchActive = draft.trim().length > 0;

  /* 提示訊息自動收掉 —— cardx 沒有 toast 元件，用頂欄下方的一條橫幅 */
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => {});
    fetchFacets().then(setFacets).catch(() => {});
  }, []);

  /* 打字停 400ms 才送查詢，不然每一個字都打一次 DB */
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(draft.trim()), 400);
    return () => window.clearTimeout(t);
  }, [draft]);

  const loadFeed = useCallback(
    async (reset: boolean) => {
      if (reset) {
        setLoading(true);
        setDone(false);
      } else {
        setLoadingMore(true);
      }
      try {
        const offset = reset ? 0 : itemsLenRef.current;
        const rows = await fetchFeed({ search, type: typeKey, sort: sortKey, offset, limit: PAGE_SIZE });
        setItems((prev) => (reset ? rows : [...prev, ...rows]));
        if (rows.length < PAGE_SIZE) setDone(true);
      } catch {
        setNotice("讀取失敗，請稍後再試");
        if (reset) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, typeKey, sortKey]
  );

  useEffect(() => {
    loadFeed(true);
  }, [loadFeed]);

  const loadMine = useCallback(async () => {
    if (!user) {
      setMine([]);
      setSellable([]);
      return;
    }
    setPanelLoading(true);
    try {
      const [ls, sa] = await Promise.all([fetchMyListings(user.id), fetchSellable(user.id)]);
      setMine(ls);
      setSellable(sa);
    } catch {
      setNotice("讀取我的上架失敗");
    } finally {
      setPanelLoading(false);
    }
  }, [user]);

  const loadDeals = useCallback(async () => {
    if (!user) {
      setDeals([]);
      return;
    }
    setPanelLoading(true);
    try {
      setDeals(await fetchMyDeals());
    } catch {
      setNotice("讀取交易紀錄失敗");
    } finally {
      setPanelLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (tab === "mine") loadMine();
  }, [tab, loadMine]);
  useEffect(() => {
    if (tab === "deals") loadDeals();
  }, [tab, loadDeals]);

  /* 捲到底接下一頁 */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || tab !== "feed" || done || loading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingMore) loadFeed(false);
      },
      { rootMargin: "400px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, done, loading, loadingMore, loadFeed]);

  /* 欄數照容器寬度算（跟 cardx 其他列表同一套） */
  useEffect(() => {
    const gap = 16;
    const minCardWidth = 220;
    const maxCardWidth = 280;
    function computeColumns() {
      const el = listRef.current;
      if (!el) return;
      if (window.innerWidth <= 1023) {
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
  }, [tab]);

  const typeOptions = useMemo(() => {
    const base = [{ key: "", label: "全部類別" }];
    for (const t of facets?.types ?? []) base.push({ key: t.key, label: `${TYPE_LABEL[t.key] || t.key}（${t.count}）` });
    return base;
  }, [facets]);

  /** 倉庫裡賞等過得了白名單的那些（DB 端一樣會擋，這裡只是不列出按了會失敗的東西） */
  const eligible = useMemo(
    () => (settings ? sellable.filter((s) => levelAllowed(s.prizeLevel, settings.allowedLevels)) : []),
    [sellable, settings]
  );

  const picked = useMemo(() => eligible.find((s) => s.drawRecordId === pick) ?? null, [eligible, pick]);
  const priceNum = Math.round(Number(priceInput) || 0);
  const receive = settings ? Math.max(0, priceNum - Math.floor((priceNum * settings.feePercent) / 100)) : priceNum;

  const openSell = () => {
    if (!requireLogin("登入後就可以把倉庫裡的東西掛上來賣")) return;
    setPick(null);
    setPriceInput("");
    setSellOpen(true);
    loadMine();
  };

  const doCreate = async () => {
    if (!picked) {
      setNotice("先選一件要上架的東西");
      return;
    }
    if (!priceNum || priceNum <= 0) {
      setNotice("填一個售價");
      return;
    }
    if (settings && (priceNum < settings.minPrice || priceNum > settings.maxPrice)) {
      setNotice(`售價要在 ${gnum(settings.minPrice)} ~ ${gnum(settings.maxPrice)} G 之間`);
      return;
    }
    setBusy(true);
    const res = await createListing(picked.drawRecordId, priceNum);
    setBusy(false);
    if (!res.success) {
      setNotice(res.message || "上架失敗");
      return;
    }
    setSellOpen(false);
    setNotice("已經掛上去了");
    setTab("mine");
    loadMine();
    loadFeed(true);
  };

  const doCancel = async (row: MyListing) => {
    setBusy(true);
    const res = await cancelListing(row.id);
    setBusy(false);
    if (!res.success) {
      setNotice(res.message || "下架失敗");
      return;
    }
    setNotice("已下架，東西回到你的倉庫");
    refreshProfile?.();
    loadMine();
    loadFeed(true);
  };

  const visible = items;

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
                  交易所
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
                  className="button-3d button-3d_red button-3d_sm"
                  data-v-c8c96dbe=""
                  type="button"
                  onClick={openSell}
                  style={{ borderRadius: 8, whiteSpace: "nowrap", flex: "0 0 auto" }}
                >
                  <span className="button-3d__outer" data-v-c8c96dbe="">
                    <span className="button-3d__inner" data-v-c8c96dbe="">
                      <span className="button-3d__text" data-v-c8c96dbe="">
                        我要上架
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
                    aria-label="搜尋交易所"
                    placeholder="品項或商品名稱"
                    style={{
                      width: "100%",
                      height: 38,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
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
                        background: "#f3f4f6",
                        color: "#374151",
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
                  ariaLabel="排序"
                  icon={<FilterIcon />}
                  borderless
                />
                <PillSelect
                  value={typeKey}
                  onChange={(next) => setTypeKey(next)}
                  options={typeOptions}
                  ariaLabel="類別"
                  icon={<VendorIcon />}
                  borderless
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" style={tabButtonStyle(tab === "feed")} onClick={() => setTab("feed")}>
                逛街
              </button>
              <button type="button" style={tabButtonStyle(tab === "mine")} onClick={() => setTab("mine")}>
                我的上架
              </button>
              <button type="button" style={tabButtonStyle(tab === "deals")} onClick={() => setTab("deals")}>
                交易紀錄
              </button>
              {settings ? (
                <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                  賣出時平台收 {settings.feePercent}% 手續費，買家付標價
                </div>
              ) : null}
            </div>

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

            {tab === "feed" ? (
              <section className={homeStyles.section} aria-label="交易所列表">
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
                  ) : visible.length === 0 ? (
                    <Empty
                      text={search ? "找不到符合的品項" : "目前沒有人上架"}
                      hint={search ? "換個關鍵字，或看看其他類別" : "抽到用不到的品項，可以掛上來換 G 幣"}
                    />
                  ) : (
                    visible.map((item) => (
                      <div
                        className={homeStyles.item4}
                        key={item.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/market/${item.id}`)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          router.push(`/market/${item.id}`);
                        }}
                        style={{ width: "100%", maxWidth: "none", flex: "unset", cursor: "pointer" }}
                      >
                        <div
                          className={homeStyles.rectangle2}
                          style={{
                            backgroundImage: `url(${item.prizeImage || FALLBACK})`,
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            backgroundColor: "#f7f7f7",
                            width: "100%",
                            height: "auto",
                            aspectRatio: "1 / 1",
                            position: "relative",
                          }}
                        >
                          {item.prizeLevel ? <span style={levelPillStyle}>{item.prizeLevel}</span> : null}
                        </div>
                        <div className={homeStyles.frame1}>
                          <p className={homeStyles.a2022PaniniPrizm353B}>{item.prizeName}</p>
                          <div className={homeStyles.frame2}>
                            <p className={homeStyles.heading62225} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <img src={GCOIN} alt="" width={16} height={16} style={{ width: 16, height: 16, objectFit: "contain" }} />
                              {gnum(item.price)}
                            </p>
                            <div className={homeStyles.overlayBorder}>
                              <p className={homeStyles.fMv2730}>{item.sellerName}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
                {loadingMore ? (
                  <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, fontWeight: 900, color: "#9ca3af" }}>載入中</div>
                ) : done && visible.length > 0 ? (
                  <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, fontWeight: 900, color: "#9ca3af" }}>到底了</div>
                ) : null}
              </section>
            ) : null}

            {tab === "mine" ? (
              <section className={homeStyles.section} aria-label="我的上架">
                {!user ? (
                  <Empty text="登入後才看得到自己的上架" hint="登入完就會回到這一頁" />
                ) : panelLoading ? (
                  <div
                    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, width: "100%" }}
                  >
                    {Array.from({ length: 4 }).map((_, i) => (
                      <SkeletonCard key={`mk_${i}`} />
                    ))}
                  </div>
                ) : mine.length === 0 ? (
                  <Empty text="你還沒有掛任何東西" hint="按右上角「我要上架」把倉庫裡的品項掛上來" />
                ) : (
                  <div style={{ display: "grid", gap: 10, width: "100%" }}>
                    {mine.map((row) => (
                      <div
                        key={row.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "64px minmax(0, 1fr) auto auto",
                          alignItems: "center",
                          gap: 14,
                          borderRadius: 14,
                          border: "1px solid #e5e7eb",
                          background: "#ffffff",
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 10,
                            background: `#f7f7f7 url(${row.prizeImage || FALLBACK}) center / contain no-repeat`,
                          }}
                        />
                        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.prizeName}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.prizeLevel ? `${row.prizeLevel} · ` : ""}
                            {row.productName || "—"} · {ago(row.createdAt)}上架
                          </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 950, color: "#111827", whiteSpace: "nowrap" }}>{gnum(row.price)} G</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 900,
                              padding: "3px 10px",
                              borderRadius: 999,
                              whiteSpace: "nowrap",
                              color: row.status === "sold" ? "#047857" : "#1d4ed8",
                              background: row.status === "sold" ? "rgba(16,185,129,0.14)" : "rgba(34,131,246,0.14)",
                            }}
                          >
                            {row.status === "sold" ? "已賣出" : "上架中"}
                          </span>
                          {row.status === "active" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => doCancel(row)}
                              style={{
                                height: 32,
                                padding: "0 12px",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                background: "#f3f4f6",
                                color: "#111827",
                                fontSize: 12,
                                fontWeight: 950,
                                cursor: busy ? "not-allowed" : "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              下架
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {tab === "deals" ? (
              <section className={homeStyles.section} aria-label="交易紀錄">
                {!user ? (
                  <Empty text="登入後才看得到交易紀錄" />
                ) : panelLoading ? (
                  <div style={{ display: "grid", gap: 10, width: "100%" }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <SkeletonCard key={`dk_${i}`} />
                    ))}
                  </div>
                ) : deals.length === 0 ? (
                  <Empty text="還沒有成交紀錄" hint="買到或賣出之後，這裡會列出每一筆" />
                ) : (
                  <div style={{ display: "grid", gap: 10, width: "100%" }}>
                    {deals.map((d) => (
                      <div
                        key={`${d.side}_${d.id}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "56px minmax(0, 1fr) auto",
                          alignItems: "center",
                          gap: 14,
                          borderRadius: 14,
                          border: "1px solid #e5e7eb",
                          background: "#ffffff",
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 10,
                            background: `#f7f7f7 url(${d.prizeImage || FALLBACK}) center / contain no-repeat`,
                          }}
                        />
                        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.prizeName}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.side === "buy" ? `向 ${d.counterparty} 買` : `賣給 ${d.counterparty}`} · {ago(d.createdAt)}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 16, fontWeight: 950, color: d.side === "buy" ? "#dc2626" : "#047857", whiteSpace: "nowrap" }}>
                            {d.side === "buy" ? "-" : "+"}
                            {gnum(d.side === "buy" ? d.price : d.sellerReceive)} G
                          </div>
                          {d.side === "sell" && d.fee > 0 ? (
                            <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, color: "#9ca3af", whiteSpace: "nowrap" }}>
                              成交 {gnum(d.price)} G，手續費 {gnum(d.fee)} G
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {sellOpen ? (
        <div
          role="presentation"
          onClick={() => setSellOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="上架品項"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(760px, calc(100vw - 32px))",
              maxHeight: "min(84vh, 760px)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              color: "#111827",
            }}
          >
            <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 15, fontWeight: 950 }}>把倉庫裡的東西掛上來</div>
              <button
                type="button"
                aria-label="關閉"
                onClick={() => setSellOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#374151", display: "grid", placeItems: "center", padding: 0, cursor: "pointer" }}
              >
                <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                  ×
                </span>
              </button>
            </div>

            <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 14 }}>
              {panelLoading ? (
                <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, fontWeight: 900, color: "#9ca3af" }}>讀取倉庫中</div>
              ) : eligible.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>倉庫裡沒有可以上架的品項</div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                    只有還沒申請配送、賞等在開放名單內的品項才掛得上來
                    {settings ? `（目前開放：${settings.allowedLevels.join("、")}）` : ""}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                    {eligible.map((s) => {
                      const on = pick === s.drawRecordId;
                      return (
                        <button
                          key={s.drawRecordId}
                          type="button"
                          onClick={() => setPick(s.drawRecordId)}
                          style={{
                            textAlign: "left",
                            padding: 8,
                            borderRadius: 12,
                            border: on ? "2px solid #111827" : "1px solid #e5e7eb",
                            background: on ? "#f9fafb" : "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              aspectRatio: "1 / 1",
                              borderRadius: 8,
                              background: `#f7f7f7 url(${s.prizeImage || FALLBACK}) center / contain no-repeat`,
                            }}
                          />
                          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.prizeName}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.prizeLevel || "—"}
                            {s.ticketNumber ? ` · ${s.ticketNumber} 號籤` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <label htmlFor="market-price" style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                      開價（G 幣）
                    </label>
                    <input
                      id="market-price"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      style={{
                        width: "min(240px, 100%)",
                        height: 40,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        color: "#111827",
                        padding: "0 14px",
                        fontSize: 14,
                        fontWeight: 900,
                        outline: "none",
                      }}
                    />
                    {settings ? (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                        可填 {gnum(settings.minPrice)} ~ {gnum(settings.maxPrice)} G。成交時平台收 {settings.feePercent}% 手續費，
                        你實際拿到 <b style={{ color: "#dc2626" }}>{gnum(receive)} G</b>。
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: "14px 18px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setSellOpen(false)}
                style={{ height: 40, padding: "0 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#111827", fontSize: 13, fontWeight: 900, cursor: "pointer" }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy || !picked}
                onClick={doCreate}
                style={{
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid #2283f6",
                  background: "#2283f6",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: busy || !picked ? "not-allowed" : "pointer",
                  opacity: busy || !picked ? 0.55 : 1,
                }}
              >
                {busy ? "處理中…" : "確認上架"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
