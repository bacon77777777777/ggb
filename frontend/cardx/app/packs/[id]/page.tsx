"use client";

/**
 * 桌機（768 以上）商品頁——cardx 卡包詳情的版型接真資料（老闆 2026-09-04 晚上）：
 * 左邊正方形是舞台（一番賞／自製賞放商品圖，轉蛋／盒玩／抽卡放機台上半部）；
 * 「大賞資訊」改成商品資訊、公平性驗證保留、「賞項一覽」改成品項總覽放品項圖、「相似商品」就是猜你喜歡。
 * 資料走跟手機商品頁同一支 fetchProductDetail（同一個 query key，ProductCard 按下去預取的那份直接用）。
 * ⚠️ 「立即開抽」還沒接抽獎流程（那套在手機頁裡跟演出綁在一起），現在點了沒反應。
 */
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import styles from "@/cardx/app/market/[id]/MarketDetail.module.css";
import { HomeProductCard } from "@/cardx/components/home/HomeClient";
import { ProductStageVisual } from "@/cardx/components/product/ProductStageVisual";
import { createClient } from "@/lib/supabase/client";
import { fetchProductDetail, productKey, type ProductDetail } from "@/lib/queries/product";
import type { HomeProduct } from "@/lib/queries/home";
import { fetchRecommendations } from "@/lib/recommendations";
import { swrLoad } from "@/lib/swr";
import { isLastOneLevel } from "@/lib/grade";
import { asset } from "@/lib/asset";
import { useAuth } from "@/contexts/AuthContext";
import { ProductLoadingScreen } from "@/components/ui/ProductLoadingScreen";
import type { PrizeInfo } from "@/components/ui/PrizeDetailSheet";

const PrizeDetailSheet = dynamic(() => import("@/components/ui/PrizeDetailSheet"), { ssr: false });

const RECENTS_KEY = "cardx.recent.detailVisits";
/** 開賣前排籤、有封存對照表的玩法——這幾種才顯示公平性驗證與各賞剩餘張數（跟手機頁同一條規則） */
const FAIR_ENGINE_TYPES = ["ichiban", "card", "custom"];
const TYPE_LABEL: Record<string, string> = { ichiban: "一番賞", blindbox: "盒玩", gacha: "轉蛋", card: "抽卡", custom: "自製賞" };
/** 注意事項（跟手機商品頁同一份文字） */
const RULES: Record<string, string[]> = {
  ichiban: ["一番賞為固定賞項隨機出獎，依抽到的賞別為主，無法指定特定賞別。", "抽出後即確認結果，不可退款或更換款式。", "實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。", "如遇商品缺貨，將以 G幣 原額退還，敬請見諒。", "商品圖片僅供參考，實物以實際配送為準。", "本平台保留對所有活動及商品之最終解釋權。"],
  card: ["抽卡商品均為隨機出卡，抽到什麼出什麼。", "抽出後即確認結果，不可退款或更換款式。", "卡片由廠商備貨配送，配送時間約 3–7 個工作日。", "如遇商品缺貨，將以 G幣 原額退還，敬請見諒。", "商品圖片僅供參考，實物以實際配送為準。", "本平台保留對所有活動及商品之最終解釋權。"],
  blindbox: ["盒玩商品均為隨機出獎，抽到什麼出什麼。", "抽出後即確認結果，不可退款或更換款式。", "實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。", "如遇商品缺貨，將以 G幣 原額退還，敬請見諒。", "商品圖片僅供參考，實物以實際配送為準。", "本平台保留對所有活動及商品之最終解釋權。"],
  gacha: ["轉蛋商品均為隨機出獎，抽到什麼出什麼。", "轉出後即確認結果，不可退款或更換款式。", "實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。", "如遇商品缺貨，將以 G幣 原額退還，敬請見諒。", "商品圖片僅供參考，實物以實際配送為準。", "本平台保留對所有活動及商品之最終解釋權。"],
  custom: ["自製賞商品均為隨機出獎，抽到什麼出什麼。", "抽出後即確認結果，不可退款或更換款式。", "實體獎品由廠商備貨配送，配送時間約 3–7 個工作日。", "如遇商品缺貨，將以 G幣 原額退還，敬請見諒。", "商品圖片僅供參考，實物以實際配送為準。", "本平台保留對所有活動及商品之最終解釋權。"],
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pushRecentVisit(entry: { kind: "packs"; id: string; ts: number; title: string; imageUrl: string; price: number; remaining: string }) {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [entry, ...list.filter((x) => x && typeof x === "object" && !(x.kind === entry.kind && x.id === entry.id))].slice(0, 200);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {}
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 18H8V7h11v16z" />
    </svg>
  );
}

const copyButtonStyle = (enabled: boolean): React.CSSProperties => ({
  width: 32,
  height: 32,
  borderRadius: 10,
  border: enabled ? "1px solid rgba(77,163,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
  background: enabled ? "rgba(77,163,255,0.12)" : "rgba(255,255,255,0.04)",
  color: enabled ? "rgba(77,163,255,0.95)" : "rgba(255,255,255,0.40)",
  display: "grid",
  placeItems: "center",
  padding: 0,
  cursor: enabled ? "pointer" : "not-allowed",
  flex: "0 0 auto",
});

export default function PackDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = Number(params?.id);
  const qc = useQueryClient();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [moduleSettings, setModuleSettings] = useState<Record<string, string>>({});
  const [moduleLoaded, setModuleLoaded] = useState(false);
  const [recommendations, setRecommendations] = useState<HomeProduct[]>([]);
  const [follows, setFollows] = useState<Set<number>>(new Set());
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  const layoutRef = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef<HTMLDivElement | null>(null);
  const fairnessInfoCloseRef = useRef<HTMLButtonElement | null>(null);
  const [dockShiftY, setDockShiftY] = useState(0);
  const [panelTop, setPanelTop] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [fairnessInfoOpen, setFairnessInfoOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pushSignal, setPushSignal] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);

  /* ── 商品＋賞項（跟手機頁同一支、同一個 query key） ── */
  useEffect(() => {
    if (!Number.isFinite(productId)) { setNotFound(true); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await swrLoad(qc, productKey(productId), () => fetchProductDetail(supabase, productId), (d) => {
          if (!cancelled) setDetail(d);
        });
        if (cancelled) return;
        fetchRecommendations(supabase, data.product, 6).then((rows) => { if (!cancelled) setRecommendations(rows as HomeProduct[]); });
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // 全站模組預設（後台「模組設定」）：商品自己沒設主題時吃這個
    supabase.from("module_settings").select("product_type, machine_theme").then(({ data }) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const row of (data || []) as { product_type: string; machine_theme: string }[]) map[row.product_type] = row.machine_theme;
      setModuleSettings(map);
      setModuleLoaded(true);
    });
    return () => { cancelled = true; };
  }, [productId, qc, supabase]);

  /* ── 即時：剩餘數變了就更新配率表 ── */
  useEffect(() => {
    if (!Number.isFinite(productId)) return;
    const ch = supabase
      .channel(`cardx-product-${productId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products", filter: `id=eq.${productId}` }, (payload) => {
        setDetail((d) => (d ? { ...d, product: { ...d.product, ...(payload.new as ProductDetail["product"]) } } : d));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "product_prizes", filter: `product_id=eq.${productId}` }, (payload) => {
        const row = payload.new as ProductDetail["prizes"][number];
        setDetail((d) => (d ? { ...d, prizes: d.prizes.map((p) => (p.id === row.id ? { ...p, ...row } : p)) } : d));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [productId, supabase]);

  /* ── 收藏（愛心）：直接寫 product_follows，訪客先去登入（跟首頁同一套） ── */
  useEffect(() => {
    if (!user?.id) { setFollows(new Set()); return; }
    let cancelled = false;
    supabase.from("product_follows").select("product_id").eq("user_id", user.id).limit(500).then(({ data }) => {
      if (cancelled) return;
      setFollows(new Set(((data || []) as { product_id: number }[]).map((r) => Number(r.product_id))));
    });
    return () => { cancelled = true; };
  }, [user?.id, supabase]);

  const toggleFollow = useCallback(async (pid: number) => {
    if (!user?.id) { router.push("/login"); return; }
    const has = follows.has(pid);
    setFollows((prev) => { const next = new Set(prev); if (has) next.delete(pid); else next.add(pid); return next; });
    try {
      if (has) await supabase.from("product_follows").delete().eq("user_id", user.id).eq("product_id", pid);
      else await supabase.from("product_follows").insert({ user_id: user.id, product_id: pid });
    } catch {}
  }, [user?.id, follows, supabase, router]);

  /* ── 衍生值（跟手機頁同一套算法） ── */
  const product = detail?.product ?? null;
  const prizes = useMemo(() => detail?.prizes ?? [], [detail]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (product ?? {}) as any;
  const regularPrizes = useMemo(() => prizes.filter((x) => !isLastOneLevel(x.level)), [prizes]);
  const lastOne = useMemo(() => prizes.find((x) => isLastOneLevel(x.level)) ?? null, [prizes]);
  const totalRemaining = product
    ? typeof product.remaining === "number" ? product.remaining : regularPrizes.reduce((a, x) => a + (x.remaining || 0), 0)
    : 0;
  const totalItems = product
    ? typeof product.total_count === "number" ? product.total_count : regularPrizes.reduce((a, x) => a + (x.total || 0), 0)
    : 0;
  const isSoldOut = !!product && (totalRemaining <= 0 || product.status === "ended");
  const cardsPerPack = Math.max(1, Number(p.cards_per_pack) || 1);
  const unit = cardsPerPack >= 2 ? "包" : "抽";
  const showCounts = !!product && FAIR_ENGINE_TYPES.includes(product.type);
  const typeLabel = product ? TYPE_LABEL[product.type] || product.type : "";
  const theme: string | null = product
    ? p.machine_theme || moduleSettings[product.type] || (product.type === "gacha" ? "gacha_classic" : null)
    : null;
  // 主題沒定之前不要掛機台——先掛的會是錯的那一台
  const themeResolved = !!p.machine_theme || moduleLoaded;
  const isSealed = !!p.sealed_at;
  const txidHash: string = p.txid_hash || "";
  const followed = !!product && follows.has(Number(product.id));

  useEffect(() => {
    if (!product) return;
    pushRecentVisit({
      kind: "packs",
      id: String(product.id),
      ts: Date.now(),
      title: product.name,
      imageUrl: product.image_url || "",
      price: product.price,
      remaining: `${totalRemaining}/${totalItems}`,
    });
  }, [product, totalRemaining, totalItems]);

  const viewingPrize: PrizeInfo | null = useMemo(() => {
    if (viewingIndex == null) return null;
    const x = prizes[viewingIndex];
    if (!x) return null;
    // 一格一格抄——之前漏抄 display_mode 讓 3D 展示靜靜壞掉（手機頁的教訓）
    return { name: x.name, image_url: x.image_url, display_mode: (x as { display_mode?: string | null }).display_mode ?? null, level: x.level, total: x.total, remaining: x.remaining };
  }, [viewingIndex, prizes]);
  const stepPrize = (dir: 1 | -1) => setViewingIndex((i) => (i == null || prizes.length === 0 ? i : (i + dir + prizes.length) % prizes.length));

  /* ── 右側面板停靠（cardx 原本的邏輯，沒動） ── */
  useEffect(() => {
    let raf = 0;
    function readHeaderHeightPx() {
      const shell = document.querySelector<HTMLElement>('[class*="shell"]');
      if (!shell) return 64;
      const raw = window.getComputedStyle(shell).getPropertyValue("--header-height").trim();
      const n = Number(raw.replace("px", ""));
      return Number.isFinite(n) && n > 0 ? n : 64;
    }
    function update() {
      const wrap = layoutRef.current;
      const stop = stopRef.current;
      if (!wrap || !stop) { setDockShiftY(0); setPanelTop(null); setIsMobile(false); return; }
      const mobile = window.innerWidth <= 1023;
      setIsMobile((prev) => (prev === mobile ? prev : mobile));
      if (mobile) { setDockShiftY(0); setPanelTop(null); return; }
      const headerH = readHeaderHeightPx();
      const measuredTop = Math.max(headerH + 20, Math.round(wrap.getBoundingClientRect().top));
      setPanelTop((prev) => (prev === measuredTop ? prev : measuredTop));
      const gap = 16;
      const bottomGap = 20;
      const panelH = window.innerHeight - measuredTop - bottomGap;
      const scrollY = window.scrollY;
      const stopY = stop.getBoundingClientRect().top + scrollY;
      const threshold = scrollY + measuredTop + panelH + gap;
      const overlap = Math.max(0, threshold - stopY);
      setDockShiftY((prev) => (prev === overlap ? prev : overlap));
    }
    function onScroll() {
      if (raf) return;
      raf = window.requestAnimationFrame(() => { raf = 0; update(); });
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [loading]);

  useEffect(() => {
    if (!fairnessInfoOpen && !rulesOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") { setFairnessInfoOpen(false); setRulesOpen(false); } };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => fairnessInfoCloseRef.current?.focus());
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = prevOverflow; };
  }, [fairnessInfoOpen, rulesOpen]);

  if (loading && !detail) return <ProductLoadingScreen />;

  if (notFound || !product) {
    return (
      <AppShell sidebarItems={defaultSidebarItems} hideBottomNavOnMobile>
        <div className={styles.page} style={{ display: "grid", placeItems: "center", minHeight: "50vh", gap: 12, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>找不到這件商品</div>
          <Link href="/" className={styles.secondaryButton} style={{ padding: "10px 18px" }}>回首頁</Link>
        </div>
      </AppShell>
    );
  }

  /* 舞台底部（老闆 2026-09-04）：左邊 G 金額／抽，右邊 推一下｜立即開抽｜試試看。聊聊與收藏移到麵包屑右邊 */
  const hasMachine = product.type === "gacha";
  const crumbIconStyle = (active: boolean): React.CSSProperties => ({
    width: 36, height: 36, borderRadius: 999, padding: 0, display: "grid", placeItems: "center", cursor: "pointer", flex: "0 0 auto",
    border: active ? "1px solid rgba(255,77,79,0.55)" : "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(255,77,79,0.18)" : "rgba(255,255,255,0.06)",
    color: active ? "#ff4d4f" : "rgba(255,255,255,0.85)",
  });
  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: product.name, url }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(url); setShareCopied(true); window.setTimeout(() => setShareCopied(false), 1500); } catch {}
  };
  const btn3d = (color: "red" | "blue" | "purple", label: string, opts: { onClick?: () => void; disabled?: boolean; grow?: boolean } = {}) => (
    <button
      className={`button-3d button-3d_${color} button-3d_sm ${styles.buyButton3d}`}
      data-v-c8c96dbe=""
      type="button"
      aria-label={label}
      disabled={opts.disabled}
      onClick={opts.onClick}
      style={{ width: opts.grow ? undefined : "auto", flex: opts.grow ? "1 1 auto" : "0 0 auto", minWidth: 0, ...(opts.disabled ? { opacity: 0.55, cursor: "not-allowed" } : {}) }}
    >
      <span className="button-3d__outer" data-v-c8c96dbe="">
        <span className="button-3d__inner" data-v-c8c96dbe="">
          <span className="button-3d__text" data-v-c8c96dbe="">{label}</span>
        </span>
      </span>
    </button>
  );
  const actionButtons = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "0 0 auto", paddingRight: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset("/images/gcoin.webp")} alt="G" style={{ width: 22, height: 22, display: "inline-block" }} />
        <span style={{ fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{product.price.toLocaleString()}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>/ {unit}</span>
      </div>
      {/* 三顆同一套 3D 樣式：推一下藍、立即開抽紅（同儲值）、試試看紫（老闆 2026-09-04）。48 高靠 stretch 撐出來，這列不能 center */}
      <div style={{ flex: "1 1 auto", display: "flex", alignItems: "stretch", justifyContent: "flex-end", gap: 8, minWidth: 0, height: 48 }}>
        {hasMachine ? btn3d("blue", "推一下", { onClick: () => setPushSignal((n) => n + 1) }) : null}
        {btn3d("red", isSoldOut ? "已完抽" : "立即開抽", { disabled: isSoldOut, grow: true })}
        {btn3d("purple", "試試看")}
      </div>
    </div>
  );

  const rateRowStyle = (last: boolean): React.CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "56px 1px 1fr 1fr 84px",
    gap: 12,
    alignItems: "center",
    padding: "10px 12px",
    minWidth: 0,
    borderBottom: last ? undefined : "1px solid rgba(255,255,255,0.08)",
  });

  const panelInner = (
    <div className={styles.infoCol} style={isMobile ? undefined : { height: "100%" }}>
      <h1 className={styles.title}>{product.name}</h1>
      <div className={styles.ownerRow}>
        <span>供應商</span>
        <span className={styles.ownerName}>{detail?.supplierName || "—"}</span>
      </div>

      <div className={styles.priceCard} aria-label="配率表">
        <div style={{ display: "grid", gap: 10 }}>
          <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>配率表</div>
          <div style={{ display: "grid" }}>
            {regularPrizes.map((r, idx) => {
              const total = Math.max(1, r.total || 0);
              const pct = showCounts ? ((r.remaining || 0) / total) * 100 : Number(r.probability) || 0;
              const last = idx === regularPrizes.length - 1 && !lastOne;
              return (
                <div key={r.id} style={rateRowStyle(last)}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.level}</div>
                  <div />
                  <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.92)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
                    <div style={{ width: `${clamp(pct, 0, 100)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, rgba(34,131,246,0.85), rgba(36,163,255,0.85))" }} />
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.88)", whiteSpace: "nowrap" }}>
                    {showCounts ? `${r.remaining ?? 0}/${r.total ?? 0}` : `${(Number(r.probability) || 0).toFixed(1)}%`}
                  </div>
                </div>
              );
            })}
            {lastOne ? (
              <div style={rateRowStyle(true)}>
                <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(255,215,120,0.95)", whiteSpace: "nowrap" }}>最後賞</div>
                <div />
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.92)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastOne.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>抽到最後一張籤就是你的</div>
                <div style={{ textAlign: "right", fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.88)" }}>{(lastOne.remaining ?? 0) > 0 ? "未送出" : "已送出"}</div>
              </div>
            ) : null}
          </div>

          <div style={{ ...rateRowStyle(true), borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.72)", whiteSpace: "nowrap" }}>總計</div>
            <div />
            <div />
            <div />
            <div style={{ textAlign: "right", fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.88)" }}>{totalRemaining}/{totalItems}</div>
          </div>
        </div>

        <div className={styles.priceNow} aria-label={unit === "包" ? "每包" : "單抽"} style={{ gap: 4 }}>
          <div className={styles.priceCardLabel}>{unit === "包" ? "每包" : "單抽"}</div>
          <div className={styles.priceCardValue} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset("/images/gcoin.webp")} alt="G" style={{ width: 26, height: 26, display: "inline-block" }} />
            <span>{product.price.toLocaleString()}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>/ {unit}</span>
          </div>
        </div>

      </div>
    </div>
  );

  const infoCards = [
    { label: "類別", value: typeLabel },
    { label: "廠商", value: detail?.supplierName || "—" },
    { label: "代理商", value: product.distributor || "—" },
    { label: "條碼", value: p.barcode || "—" },
  ];

  const prizeCardStyle = (gold: boolean): React.CSSProperties => ({
    borderRadius: 16,
    border: gold ? "1px solid rgba(255, 215, 120, 0.85)" : "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    overflow: "hidden",
    minWidth: 0,
    cursor: "pointer",
    boxShadow: gold
      ? "inset 0 0 0 2px rgba(255, 244, 200, 0.98), inset 0 0 0 5px rgba(215, 162, 71, 0.92), 0 0 0 1px rgba(0,0,0,0.22), 0 18px 40px rgba(0,0,0,0.35)"
      : undefined,
  });

  return (
    <AppShell sidebarItems={defaultSidebarItems} hideBottomNavOnMobile>
      <div className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="breadcrumb" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Link href={`/?tab=${encodeURIComponent(product.type)}`} className={styles.breadcrumbBack} scroll={false} aria-label={`返回${typeLabel}`}>
            <span className={styles.breadcrumbBackIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className={styles.breadcrumbBackText}>
              <span>首頁</span>
              <span className={styles.breadcrumbSep} aria-hidden="true"> / </span>
              <span>{typeLabel}</span>
              <span className={styles.breadcrumbSep} aria-hidden="true"> / </span>
              <span className={styles.breadcrumbStrong}>{product.name}</span>
            </span>
          </Link>
          {/* 麵包屑右邊：規則／分享／收藏（老闆 2026-09-04） */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "0 0 auto", position: "relative" }}>
            <button type="button" aria-label="規則" title="規則" onClick={() => setRulesOpen(true)} style={crumbIconStyle(false)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><use href="#icon-docs" /></svg>
            </button>
            <button type="button" aria-label="分享" title="分享" onClick={() => void handleShare()} style={crumbIconStyle(false)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" /></svg>
            </button>
            <button type="button" aria-label={followed ? "取消收藏" : "收藏"} title="收藏" aria-pressed={followed} onClick={() => void toggleFollow(Number(product.id))} style={crumbIconStyle(followed)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><use href="#icon-like" /></svg>
            </button>
            {shareCopied ? (
              <div role="status" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", padding: "6px 10px", borderRadius: 8, background: "rgba(17,25,35,0.96)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", zIndex: 20 }}>已複製連結</div>
            ) : null}
          </div>
        </nav>

        <div
          aria-label="商品詳情版型"
          ref={layoutRef}
          style={{
            position: "relative",
            paddingRight: isMobile ? 0 : "max(0px, calc((100vw - var(--sidebar-width) - (var(--app-gutter) * 2) - 16px) / 2 + 16px))",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
            {isMobile ? (
              <section className={styles.hero} aria-label="商品舞台與面板">
                <div className={styles.mediaCol}>
                  {themeResolved ? <ProductStageVisual key={`${product.id}-${theme}`} product={product} theme={theme} isSoldOut={isSoldOut} controls={actionButtons} pushSignal={pushSignal} /> : <div style={{ aspectRatio: "1 / 1", borderRadius: 16, background: "#1c2532" }} />}
                </div>
                {panelInner}
              </section>
            ) : (
              <div className={styles.mediaCol} aria-label="商品舞台">
                {themeResolved ? <ProductStageVisual key={`${product.id}-${theme}`} product={product} theme={theme} isSoldOut={isSoldOut} controls={actionButtons} pushSignal={pushSignal} /> : <div style={{ aspectRatio: "1 / 1", borderRadius: 16, background: "#1c2532" }} />}
              </div>
            )}

            <div style={{ display: "grid", gap: 16 }}>
              <section className={styles.section} aria-label="商品資訊">
                <div className={styles.sectionHeader}>商品資訊</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  {infoCards.map((row) => (
                    <div key={row.label} className={styles.itemDetailCard}>
                      <div className={styles.itemDetailLabel}>{row.label}</div>
                      <div className={styles.itemDetailValue}>{row.value}</div>
                    </div>
                  ))}
                </div>
                {detail?.categories?.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {detail.categories.map((c) => (
                      <Link
                        key={c.id}
                        href={`/?menu=${encodeURIComponent(String(c.id))}`}
                        style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}
                      >
                        {c.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {product.description ? (
                  <div className={styles.itemDetailCard} style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: "20px", color: "rgba(255,255,255,0.82)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {product.description}
                    </div>
                  </div>
                ) : null}
              </section>

              {showCounts ? (
                <section className={styles.section} aria-label="公平性驗證">
                  <div className={styles.sectionHeaderRow} style={{ justifyContent: "flex-start", gap: 4, alignItems: "center" }}>
                    <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>公平性驗證</div>
                    <button
                      type="button"
                      aria-label="公平性驗證說明"
                      onClick={() => setFairnessInfoOpen(true)}
                      style={{ width: 24, height: 24, borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.72)", display: "grid", placeItems: "center", padding: 0, cursor: "pointer", flex: "0 0 auto" }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" style={{ display: "block" }}>
                        <path fill="currentColor" d="M11 17h2v-6h-2v6zm1-8.75c.69 0 1.25-.56 1.25-1.25S12.69 5.75 12 5.75 10.75 6.31 10.75 7 11.31 8.25 12 8.25zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                      </svg>
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                    <div className={styles.itemDetailCard}>
                      <div className={styles.itemDetailLabel}>完整對照表</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        {isSoldOut ? (
                          <Link href={`/fairness/${product.id}`} className={styles.itemDetailValue} style={{ flex: "1 1 auto", color: "rgba(77,163,255,0.95)", textDecoration: "underline" }}>
                            看完整對照表
                          </Link>
                        ) : (
                          <span className={styles.itemDetailValue} style={{ flex: "1 1 auto" }}>完抽後公布</span>
                        )}
                      </div>
                    </div>

                    <div className={styles.itemDetailCard}>
                      <div className={styles.itemDetailLabel}>開賣時公布的驗證碼</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span className={styles.itemDetailValue} style={{ flex: "1 1 auto" }}>
                          {isSealed ? txidHash || "尚未生成，請稍後再試" : "這一檔沒有封存對照表"}
                        </span>
                        <button
                          type="button"
                          aria-label="複製驗證碼"
                          disabled={!txidHash}
                          onClick={() => void navigator.clipboard.writeText(txidHash)}
                          style={copyButtonStyle(!!txidHash)}
                        >
                          <CopyIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className={styles.section} aria-label="品項總覽">
                <div className={styles.sectionHeader}>品項總覽</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
                  {lastOne ? (
                    <div role="button" tabIndex={0} style={prizeCardStyle(true)} onClick={() => setViewingIndex(prizes.indexOf(lastOne))}>
                      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "rgba(0,0,0,0.18)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={lastOne.image_url || asset("/images/item_defaulet.webp")} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                      </div>
                      <div style={{ padding: 12, display: "grid", gap: 6, background: "linear-gradient(180deg, rgba(255, 246, 220, 0.98), rgba(220, 175, 90, 0.96))" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,0.68)" }}>最後賞</div>
                        <div style={{ fontSize: 13, fontWeight: 950, color: "rgba(0,0,0,0.92)", lineHeight: "16px" }}>{lastOne.name}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.7)" }}>抽到最後一張籤就是你的</div>
                      </div>
                    </div>
                  ) : null}
                  {regularPrizes.map((x) => {
                    const gone = showCounts && (x.remaining ?? 0) <= 0;
                    return (
                      <div key={x.id} role="button" tabIndex={0} style={{ ...prizeCardStyle(false), opacity: gone ? 0.5 : 1 }} onClick={() => setViewingIndex(prizes.indexOf(x))}>
                        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "rgba(0,0,0,0.18)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={x.image_url || asset("/images/item_defaulet.webp")} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                        </div>
                        <div style={{ padding: 12, display: "grid", gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.62)" }}>{x.level}</div>
                          <div style={{ fontSize: 13, fontWeight: 950, color: "rgba(255,255,255,0.94)", lineHeight: "16px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{x.name}</div>
                          {showCounts ? (
                            <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>剩餘 {x.remaining ?? 0} / {x.total ?? 0}</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          {!isMobile ? (
            <aside
              aria-label="右側操作面板"
              style={{
                position: "fixed",
                top: panelTop == null ? "calc(var(--header-height) + 20px)" : `${panelTop}px`,
                right: "var(--app-gutter)",
                width: "calc((100vw - var(--sidebar-width) - (var(--app-gutter) * 2) - 16px) / 2)",
                height: panelTop == null ? "calc(100dvh - var(--header-height) - 40px)" : `calc(100dvh - ${panelTop}px - 20px)`,
                zIndex: 30,
                transform: dockShiftY > 0 ? `translateY(${-dockShiftY}px)` : undefined,
                overflowY: "auto",
              }}
            >
              {panelInner}
            </aside>
          ) : null}
        </div>

        <div className={styles.mobileActionBar} aria-label="行動操作">
          <div className={styles.mobileActionGrid}>{actionButtons}</div>
        </div>

        {fairnessInfoOpen ? (
          <div role="presentation" onClick={() => setFairnessInfoOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="公平性驗證說明"
              onClick={(e) => e.stopPropagation()}
              style={{ width: "min(560px, calc(100vw - 32px))", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(17, 25, 35, 0.96)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", padding: 16, color: "rgba(255,255,255,0.92)" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>公平性驗證</div>
                <button
                  ref={fairnessInfoCloseRef}
                  type="button"
                  aria-label="關閉"
                  onClick={() => setFairnessInfoOpen(false)}
                  style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.82)", display: "grid", placeItems: "center", padding: 0, cursor: "pointer", flex: "0 0 auto" }}
                >
                  <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>×</span>
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, lineHeight: "18px", color: "rgba(255,255,255,0.82)" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div>這一檔開賣前就把每一張籤是什麼賞排好、封存起來，並公布一組驗證碼。之後任何人都改不了籤表。</div>
                  <div>完抽（{totalItems} 抽）之後公開完整對照表，你可以拿它重新算一次驗證碼，跟商品頁上的比對；一致就代表抽到的結果和大賞位置沒有被事後動過。</div>
                  <div>
                    <Link href="/events/fairness" style={{ color: "rgba(77,163,255,0.95)", textDecoration: "underline" }}>看抽獎公平性說明</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {rulesOpen ? (
          <div role="presentation" onClick={() => setRulesOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
            <div role="dialog" aria-modal="true" aria-label="規則" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, calc(100vw - 32px))", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(17, 25, 35, 0.96)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", padding: 16, color: "rgba(255,255,255,0.92)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>注意事項</div>
                <button type="button" aria-label="關閉" onClick={() => setRulesOpen(false)} style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.82)", display: "grid", placeItems: "center", padding: 0, cursor: "pointer", flex: "0 0 auto" }}>
                  <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>×</span>
                </button>
              </div>
              <ol style={{ marginTop: 12, paddingLeft: 20, display: "grid", gap: 8, fontSize: 13, fontWeight: 700, lineHeight: "18px", color: "rgba(255,255,255,0.82)", listStyle: "decimal" }}>
                {(RULES[product.type] || RULES.custom).map((line, i) => <li key={i}>{line}</li>)}
              </ol>
            </div>
          </div>
        ) : null}

        <div ref={stopRef} aria-hidden="true" style={{ height: 1 }} />
        {recommendations.length > 0 ? (
          <div className={homeStyles.main2}>
            <div className={homeStyles.main}>
              <div className={homeStyles.sectionLobby}>
                <section className={homeStyles.section} aria-label="猜你喜歡">
                  <div className={homeStyles.header}>
                    <div className={homeStyles.link8}>
                      <div className={homeStyles.sVg}>
                        <img alt="" src="/cardx/figma/164_20652/moi1a0ws-qtbj5bg.svg" className={homeStyles.iconCherries} />
                      </div>
                      <p className={homeStyles.heading2Slots}>猜你喜歡</p>
                    </div>
                    <Link className={homeStyles.text10} href={`/?tab=${encodeURIComponent(product.type)}`}>查看全部</Link>
                  </div>
                  <div className={homeStyles.frame12} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, width: "100%", overflow: "visible" }}>
                    {recommendations.map((item) => (
                      <HomeProductCard key={item.id} product={item} followed={follows.has(Number(item.id))} onToggleFollow={() => void toggleFollow(Number(item.id))} />
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}

        <PrizeDetailSheet
          prize={viewingPrize}
          onClose={() => setViewingIndex(null)}
          sealed={showCounts}
          showcase3d={product.type === "card"}
          showcaseBackImage={p.card_back_image_url ?? null}
          onPrev={() => stepPrize(-1)}
          onNext={() => stepPrize(1)}
        />
      </div>
    </AppShell>
  );
}
