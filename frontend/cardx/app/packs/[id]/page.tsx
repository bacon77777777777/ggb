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
import { fetchProductPromotion, type ProductPromotion } from "@/lib/promotions";
import { swrLoad } from "@/lib/swr";
import { isLastOneLevel } from "@/lib/grade";
import { BookOpen, Share2, Heart } from "lucide-react";
import { asset } from "@/lib/asset";
import { useAuth } from "@/contexts/AuthContext";
import { ProductLoadingScreen } from "@/components/ui/ProductLoadingScreen";
import GradeBadge from "@/components/ui/GradeBadge";
import ViewerPill from "@/components/product/ViewerPill";
import { useGachaDraw } from "@/hooks/useGachaDraw";
import { GachaResultModal } from "@/components/shop/GachaResultModal";
import { PurchaseConfirmationModal } from "@/components/shop/PurchaseConfirmationModal";
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

/** 近期瀏覽只記「看過哪一件、什麼時候」；標題價格一律當下回 DB 查，存起來會過期。 */
function pushRecentVisit(entry: { kind: "product"; id: number; ts: number }) {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [entry, ...list.filter((x) => !(x && typeof x === "object" && Number(x.id) === entry.id))].slice(0, 200);
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
  border: enabled ? "1px solid rgb(var(--primary) / 0.35)" : "1px solid #e5e7eb",
  background: enabled ? "rgb(var(--primary) / 0.10)" : "#ffffff",
  color: enabled ? "rgb(var(--primary))" : "#9ca3af",
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
  // 跟手機商品頁同一份資訊：進行中的促銷（商品資訊列出）、玩家已抽到的品項（品項總覽標示）
  const [promo, setPromo] = useState<ProductPromotion | null>(null);
  const [collectedIds, setCollectedIds] = useState<Set<number>>(new Set());

  const fairnessInfoCloseRef = useRef<HTMLButtonElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [navH, setNavH] = useState(66);
  const [isMobile, setIsMobile] = useState(false);
  const [fairnessInfoOpen, setFairnessInfoOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
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

  /* ── 促銷（跟手機頁同一支 fetchProductPromotion） ── */
  useEffect(() => {
    if (!Number.isFinite(productId)) return;
    let cancelled = false;
    void fetchProductPromotion(supabase, productId).then((x) => { if (!cancelled) setPromo(x); });
    return () => { cancelled = true; };
  }, [productId, supabase]);

  /* ── 已收集：玩家在這件商品抽到過的品項（跟手機頁 GachaCollectionList 同一份 query） ── */
  useEffect(() => {
    if (!user?.id || !Number.isFinite(productId)) { setCollectedIds(new Set()); return; }
    let cancelled = false;
    supabase.from("draw_records").select("product_prize_id").eq("user_id", user.id).eq("product_id", productId).then(({ data }) => {
      if (cancelled) return;
      setCollectedIds(new Set(((data || []) as { product_prize_id: number | null }[])
        .map((r) => r.product_prize_id).filter((x): x is number => x !== null)));
    });
    return () => { cancelled = true; };
  }, [user?.id, productId, supabase]);

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

  /* ── 抽獎流程（購買彈窗 → /api/gacha → 演出 → 中獎彈窗），跟手機商品頁同一套 ── */
  const draw = useGachaDraw(product, prizes);

  useEffect(() => {
    if (!product) return;
    pushRecentVisit({ kind: "product", id: Number(product.id), ts: Date.now() });
  }, [product]);

  const viewingPrize: PrizeInfo | null = useMemo(() => {
    if (viewingIndex == null) return null;
    const x = prizes[viewingIndex];
    if (!x) return null;
    // 一格一格抄——之前漏抄 display_mode 讓 3D 展示靜靜壞掉（手機頁的教訓）
    return { name: x.name, image_url: x.image_url, display_mode: (x as { display_mode?: string | null }).display_mode ?? null, level: x.level, total: x.total, remaining: x.remaining };
  }, [viewingIndex, prizes]);
  const stepPrize = (dir: 1 | -1) => setViewingIndex((i) => (i == null || prizes.length === 0 ? i : (i + dir + prizes.length) % prizes.length));

  /* ── 1023 以下改成上下堆疊（舞台 → 面板 → 各區） ── */
  useEffect(() => {
    function update() {
      const mobile = window.innerWidth <= 1023;
      setIsMobile((prev) => (prev === mobile ? prev : mobile));
      // 麵包屑那一列的高度：舞台滿高要扣掉它，不然一進頁面底部那排按鈕被視窗切掉
      const n = navRef.current;
      if (n) { const h = Math.round(n.getBoundingClientRect().height) + 16; setNavH((prev) => (prev === h ? prev : h)); }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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
          <div style={{ fontSize: 16, fontWeight: 900, color: "#111827" }}>找不到這件商品</div>
          <Link href="/" className={styles.secondaryButton} style={{ padding: "10px 18px" }}>回首頁</Link>
        </div>
      </AppShell>
    );
  }

  /* 舞台底部（老闆 2026-09-04）：推一下｜G 金額／抽（紅色主鈕）｜試試看。聊聊與收藏移到麵包屑右邊 */
  const hasMachine = product.type === "gacha";
  // 麵包屑右邊三顆用 cardx 原本的方形次要按鈕（老闆 2026-09-04：「用原本方形那種」）
  const crumbIconStyle = (active: boolean): React.CSSProperties => ({
    width: 48, minWidth: 48, height: 48, padding: 0, display: "grid", placeItems: "center", flex: "0 0 auto",
    ...(active ? { color: "#ff4d4f", borderColor: "rgba(255, 77, 79, 0.55)", background: "rgba(255, 77, 79, 0.18)" } : {}),
  });
  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: product.name, url }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(url); setShareCopied(true); window.setTimeout(() => setShareCopied(false), 1500); } catch {}
  };
  const btn3d = (color: "red" | "blue" | "purple", label: React.ReactNode, opts: { onClick?: () => void; disabled?: boolean; grow?: boolean; ariaLabel?: string } = {}) => (
    <button
      className={`button-3d button-3d_${color} button-3d_sm ${styles.buyButton3d}`}
      data-v-c8c96dbe=""
      type="button"
      aria-label={opts.ariaLabel ?? (typeof label === "string" ? label : undefined)}
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
  /* 主鈕文字就是「G 金額／抽」（老闆 2026-09-04：金額搬進紅鈕、拿掉「立即開抽」字樣） */
  /* ⚠️ 這裡要 flex 不能 inline-flex：外層 .button-3d__text 的 line-height 是 20px，
     inline 級的盒子會照基線對齊、底下多留一截 descender 的空間，整組字看起來就偏上。
     金幣圖也要 block，理由相同 */
  /* 金額放大一級（20）、「／抽」用淡字（老闆 2026-09-05）；粗細與描邊仍吃 .button-3d__text 的 900 */
  const priceLabel = (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, lineHeight: 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset("/images/gcoin.webp")} alt="G" style={{ width: 22, height: 22, display: "block", flex: "0 0 auto" }} />
      <span style={{ fontSize: 20, lineHeight: 1 }}>{product.price.toLocaleString()}</span>
      <span style={{ lineHeight: 1, opacity: 0.65 }}>/ {unit}</span>
    </span>
  );
  const actionButtons = (
    <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
      {/* 「N 人正在看」貼在主鈕上緣置中，跟手機商品頁同一顆膠囊（老闆 2026-09-04） */}
      <div style={{ display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <ViewerPill productId={Number(product.id)} inline />
      </div>
      {/* 三顆同一套 3D 樣式：推一下藍、主鈕紅（同儲值）、試試看紫。48 高靠 stretch 撐出來，這列不能 center */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 8, width: "100%", minWidth: 0, height: 48 }}>
        {hasMachine ? btn3d("blue", "推一下", { onClick: draw.handlePush, disabled: draw.machineDisabled }) : null}
        {btn3d("red", isSoldOut ? "已完抽" : priceLabel, { onClick: draw.openPurchase, disabled: isSoldOut || draw.machineDisabled || draw.isProcessing, grow: true, ariaLabel: isSoldOut ? "已完抽" : `${product.price.toLocaleString()} G／${unit}，立即開抽` })}
        {btn3d("purple", "試試看", { onClick: draw.handleTrial, disabled: isSoldOut || draw.machineDisabled })}
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
    borderBottom: last ? undefined : "1px solid #e5e7eb",
  });

  const panelInner = (
    <div className={styles.infoCol}>
      <h1 className={styles.title}>{product.name}</h1>
      <div className={styles.ownerRow}>
        <span>供應商</span>
        <span className={styles.ownerName}>{detail?.supplierName || "—"}</span>
      </div>

      {/* 轉蛋不顯示配率表（老闆 2026-09-04：轉蛋用不到——只有一般版、也不公開張數）；
          盒玩跟轉蛋一致（老闆 2026-09-05） */}
      {!["gacha", "blindbox"].includes(product.type) ? (
      <div className={styles.priceCard} aria-label="配率表">
        <div style={{ display: "grid", gap: 10 }}>
          <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>配率表</div>
          <div style={{ display: "grid" }}>
            {regularPrizes.map((r, idx) => {
              const total = Math.max(1, r.total || 0);
              const pct = showCounts ? ((r.remaining || 0) / total) * 100 : Number(r.probability) || 0;
              const last = idx === regularPrizes.length - 1;
              return (
                <div key={r.id} style={rateRowStyle(last)}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.level}</div>
                  <div />
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#111827", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "#f3f4f6", overflow: "hidden" }}>
                    <div style={{ width: `${clamp(pct, 0, 100)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, rgb(var(--primary) / 0.9), rgb(var(--primary-light) / 0.9))" }} />
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 950, color: "#111827", whiteSpace: "nowrap" }}>
                    {showCounts ? `${r.remaining ?? 0}/${r.total ?? 0}` : `${(Number(r.probability) || 0).toFixed(1)}%`}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ ...rateRowStyle(true), borderTop: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#374151", whiteSpace: "nowrap" }}>總計</div>
            <div />
            <div />
            <div />
            <div style={{ textAlign: "right", fontSize: 14, fontWeight: 950, color: "#111827" }}>{totalRemaining}/{totalItems}</div>
          </div>
        </div>

      </div>
      ) : null}

      {/* 最後賞獨立一張卡（老闆 2026-09-05：放在配率表裡淡黃字看不清，而且它沒有總計）——
          照手機商品頁那張：黃色漸層、圖、黃標、品名、一句說明；右邊補送出狀態。點了開品項明細 */}
      {lastOne && !["gacha", "blindbox"].includes(product.type) ? (() => {
        const sent = (lastOne.remaining ?? 0) <= 0;
        return (
          <div
            role="button"
            tabIndex={0}
            aria-label={`最後賞：${lastOne.name}`}
            onClick={() => setViewingIndex(prizes.indexOf(lastOne))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewingIndex(prizes.indexOf(lastOne)); } }}
            style={{
              position: "relative", overflow: "hidden", cursor: "pointer",
              borderRadius: 16, padding: 16,
              background: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)",
              border: "1px solid rgba(254, 240, 138, 0.8)",
              boxShadow: "0 10px 30px -12px rgba(250, 204, 21, 0.45)",
              display: "flex", alignItems: "center", gap: 16, minWidth: 0,
            }}
          >
            <div aria-hidden="true" style={{ position: "absolute", top: 0, right: 0, width: 220, height: 220, borderRadius: "50%", background: "rgba(250, 204, 21, 0.22)", filter: "blur(48px)", transform: "translate(50%, -50%)", pointerEvents: "none" }} />
            <div style={{ position: "relative", width: 72, height: 72, flex: "0 0 auto", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.6)", border: "1px solid rgba(254, 240, 138, 0.8)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lastOne.image_url || asset("/images/item_defaulet.webp")} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0 }}>
              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, background: "#facc15", color: "#111827", fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", boxShadow: "0 4px 12px rgba(250, 204, 21, 0.3)", marginBottom: 6 }}>最後賞</span>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#111827", lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastOne.name}</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: "rgba(133, 77, 14, 0.8)" }}>購買最後一張籤即可獲得此獎項</div>
            </div>
            <div style={{ position: "relative", flex: "0 0 auto", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", background: sent ? "rgba(17, 24, 39, 0.08)" : "#ffffff", color: sent ? "#6b7280" : "#b45309", border: sent ? "1px solid transparent" : "1px solid rgba(240, 180, 41, 0.6)" }}>
              {sent ? "已送出" : "未送出"}
            </div>
          </div>
        );
      })() : null}
    </div>
  );

  const infoCards = [
    { label: "類別", value: typeLabel },
    { label: "廠商", value: detail?.supplierName || "—" },
    { label: "代理商", value: product.distributor || "—" },
    { label: "條碼", value: p.barcode || "—" },
  ];

  /* 品項總覽小卡（老闆 2026-09-04）：圖上下左右滿編、不留 padding；
     圖下面才是內距 16 的文字區：賞等標籤＋品名，再一行剩餘／收集狀態。
     賞等用全站同一顆 GradeBadge；轉蛋與盒玩只有「一般版」這種沒意義的賞等，不顯示 */
  const showGrade = !["gacha", "blindbox"].includes(product.type);
  /* 最後賞的金邊要包住整張卡含圖（老闆 2026-09-05）：原本用內縮陰影畫，
     圖是 absolute 貼在上面、內縮陰影畫在內容底下，上半段的邊就被圖蓋掉。改成真邊框 */
  const prizeTileStyle = (gold: boolean): React.CSSProperties => ({
    borderRadius: 8,
    background: "#ffffff",
    boxShadow: gold ? "0 0 0 1px rgba(240, 180, 41, 0.25)" : "0 1px 2px rgba(0,0,0,0.04)",
    border: gold ? "1.5px solid #f0b429" : "1px solid #e5e7eb",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    minWidth: 0,
    cursor: "pointer",
  });
  const prizeTile = (x: (typeof prizes)[number], gold: boolean, extra?: React.CSSProperties) => {
    const gone = showCounts && !gold && (x.remaining ?? 0) <= 0;
    const collected = collectedIds.has(Number(x.id));
    /* 底部那行：封存制（一番賞／抽卡／自製賞）看剩餘張數；
       轉蛋／盒玩不公開張數也不公開單品機率，跟手機頁一樣只標已收集／未收集 */
    /* 未登入時沒有「收集狀態」可講，整行不畫 —— 印一個破折號看起來像資料壞掉 */
    const figure = gold ? "最後賞" : showCounts ? `${x.remaining ?? 0} / ${x.total ?? 0}` : user ? (collected ? "已收集" : "未收集") : null;
    const figureColor = gold
      ? "#b45309"
      : !showCounts && user && collected ? "#059669"
      : !showCounts && user ? "#9ca3af"
      : "#111827";
    return (
      <div key={x.id} role="button" tabIndex={0} style={{ ...prizeTileStyle(gold), opacity: gone ? 0.5 : 1, ...extra }} onClick={() => setViewingIndex(prizes.indexOf(x))}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={x.image_url || asset("/images/item_defaulet.webp")} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div style={{ padding: 16, display: "grid", gridTemplateRows: figure ? "1fr auto" : "1fr", gap: figure ? 14 : 0, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
            {showGrade ? <GradeBadge grade={gold ? "最後賞" : x.level} size="sm" className="mt-[2px]" /> : null}
            <span style={{ fontSize: 15, fontWeight: 500, color: "#111827", lineHeight: "20px", minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{x.name}</span>
          </div>
          {figure ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              {!gold && showCounts ? <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>剩餘</span> : null}
              <span style={{ fontSize: 20, fontWeight: 900, color: figureColor, lineHeight: 1, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{figure}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  // 桌機舞台滿高（老闆 2026-09-04）：sticky 區高度 = 視窗 − 導覽列 − 上下各 20，機台在裡面 fit 高度
  const stageBoxHeight = `calc(100dvh - var(--header-height) - 40px - ${navH}px)`;
  const renderStage = (fill: boolean) => themeResolved ? (
    <ProductStageVisual
      key={`${product.id}-${theme}`}
      product={product}
      theme={theme}
      isSoldOut={isSoldOut}
      controls={actionButtons}
      fillHeight={fill}
      machineState={draw.machineState}
      shakeRepeats={draw.shakeRepeats}
      pushSoundMode={draw.pushSoundMode}
      hasHighTierPending={draw.hasHighTierPending}
      disableButtons={draw.machineDisabled}
      onHoleClick={draw.handleHoleClick}
    />
  ) : (
    <div style={fill ? { height: "100%", borderRadius: 16, background: "#f3f4f6" } : { aspectRatio: "1 / 1", borderRadius: 16, background: "#f3f4f6" }} />
  );

  const sections = (
    <>
            <section className={styles.section} aria-label="品項總覽" style={{ marginTop: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                {regularPrizes.map((x) => prizeTile(x, false))}
                {/* 最後賞排最後（老闆 2026-09-05） */}
                {lastOne ? prizeTile(lastOne, true) : null}
              </div>
            </section>

      <section className={styles.section} aria-label="商品資訊">
              <div className={styles.sectionHeader}>商品資訊</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                {/* 促銷：有進行中的方案才出現（跟手機頁一樣紅色標出，例：開學買五送一） */}
                {promo ? (
                  <div className={styles.itemDetailCard} style={{ gridColumn: "1 / -1", borderColor: "rgba(255, 77, 79, 0.35)", background: "rgba(255, 77, 79, 0.10)" }}>
                    <div className={styles.itemDetailLabel}>促銷</div>
                    <div className={styles.itemDetailValue} style={{ color: "#ff8a8c" }}>{promo.name || promo.badgeText}</div>
                  </div>
                ) : null}
                {infoCards.map((row) => (
                  <div key={row.label} className={styles.itemDetailCard}>
                    <div className={styles.itemDetailLabel}>{row.label}</div>
                    <div className={styles.itemDetailValue}>{row.value}</div>
                  </div>
                ))}
              </div>
              {/* 注意事項：手機頁列在商品資訊底下，這裡照抄同一份（麵包屑的規則鈕開的是同一段文字） */}
              <div style={{ marginTop: 16 }}>
                <div className={styles.sectionHeader}>注意事項</div>
                <ol style={{ paddingLeft: 18, display: "grid", gap: 4, listStyle: "decimal" }}>
                  {(RULES[product.type] || RULES.custom).map((line, i) => (
                    <li key={i} style={{ fontSize: 14, fontWeight: 700, lineHeight: "24px", color: "#6b7280" }}>{line}</li>
                  ))}
                </ol>
              </div>
            </section>

            {showCounts ? (
              <section className={styles.section} aria-label="公平性驗證">
                <div className={styles.sectionHeaderRow} style={{ justifyContent: "flex-start", gap: 4, alignItems: "center" }}>
                  <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>公平性驗證</div>
                  <button
                    type="button"
                    aria-label="公平性驗證說明"
                    onClick={() => setFairnessInfoOpen(true)}
                    style={{ width: 24, height: 24, borderRadius: 999, border: "1px solid #e5e7eb", background: "#ffffff", color: "#374151", display: "grid", placeItems: "center", padding: 0, cursor: "pointer", flex: "0 0 auto" }}
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
                        <Link href={`/fairness/${product.id}`} className={styles.itemDetailValue} style={{ flex: "1 1 auto", color: "rgb(var(--primary))", textDecoration: "underline" }}>
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

          </>
  );

  return (
    <AppShell sidebarItems={defaultSidebarItems} hideBottomNavOnMobile>
      <div className={styles.page}>
        <nav ref={navRef} className={styles.breadcrumbs} aria-label="breadcrumb" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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
          {/* 麵包屑右邊：規則／分享／收藏（老闆 2026-09-04）。
              圖標跟手機端 Navbar 商品頁那三顆同款（老闆 2026-09-05：lucide BookOpen／Share2／Heart，20px、線寬 2）；
              規則在桌機維持彈窗，不是像手機那樣進規則頁 */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "0 0 auto", position: "relative" }}>
            <button type="button" className={styles.secondaryButton} aria-label="規則" title="規則" onClick={() => setRulesOpen(true)} style={crumbIconStyle(false)}>
              <BookOpen size={20} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className={styles.secondaryButton} aria-label="分享" title="分享" onClick={() => void handleShare()} style={crumbIconStyle(false)}>
              <Share2 size={20} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className={styles.secondaryButton} aria-label={followed ? "取消收藏" : "收藏"} title="收藏" aria-pressed={followed} onClick={() => void toggleFollow(Number(product.id))} style={crumbIconStyle(followed)}>
              <Heart size={20} strokeWidth={2} fill={followed ? "currentColor" : "none"} aria-hidden="true" />
            </button>
            {shareCopied ? (
              <div role="status" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", padding: "6px 10px", borderRadius: 8, background: "#ffffff", border: "1px solid #e5e7eb", boxShadow: "0 10px 40px -10px rgba(0,0,0,0.12)", fontSize: 12, fontWeight: 800, color: "#111827", whiteSpace: "nowrap", zIndex: 20 }}>已複製連結</div>
            ) : null}
          </div>
        </nav>

        {/* 版面（老闆 2026-09-04）：左邊舞台固定（sticky），右邊一欄捲動：標題／配率表 → 商品資訊 → 公平性驗證 → 品項總覽 */}
        {isMobile ? (
          <section className={styles.hero} aria-label="商品舞台與面板">
            <div className={styles.mediaCol}>{renderStage(false)}</div>
            {panelInner}
            <div style={{ display: "grid", gap: 16 }}>{sections}</div>
          </section>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
            <div className={styles.mediaCol} aria-label="商品舞台" style={{ position: "sticky", top: "calc(var(--header-height) + 20px)", height: stageBoxHeight }}>
              {renderStage(true)}
            </div>
            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              {panelInner}
              {sections}
            </div>
          </div>
        )}

        {/* 底部固定操作列已移除：舞台自己有操作列，平板（768～1023）舞台在上、面板在下也一樣用舞台那排；
            768 以下是手機版商品頁，不會畫到這裡（老闆 2026-09-05 平板改版） */}
        {fairnessInfoOpen ? (
          <div role="presentation" onClick={() => setFairnessInfoOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="公平性驗證說明"
              onClick={(e) => e.stopPropagation()}
              style={{ width: "min(560px, calc(100vw - 32px))", borderRadius: 16, border: "1px solid #e5e7eb", background: "#ffffff", boxShadow: "0 20px 70px -15px rgba(0,0,0,0.15)", padding: 16, color: "#111827" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>公平性驗證</div>
                <button
                  ref={fairnessInfoCloseRef}
                  type="button"
                  aria-label="關閉"
                  onClick={() => setFairnessInfoOpen(false)}
                  style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", color: "#374151", display: "grid", placeItems: "center", padding: 0, cursor: "pointer", flex: "0 0 auto" }}
                >
                  <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>×</span>
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, lineHeight: "18px", color: "#374151" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div>這一檔開賣前就把每一張籤是什麼賞排好、封存起來，並公布一組驗證碼。之後任何人都改不了籤表。</div>
                  <div>完抽（{totalItems} 抽）之後公開完整對照表，你可以拿它重新算一次驗證碼，跟商品頁上的比對；一致就代表抽到的結果和大賞位置沒有被事後動過。</div>
                  <div>
                    <Link href="/events/fairness" style={{ color: "rgb(var(--primary))", textDecoration: "underline" }}>看抽獎公平性說明</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {rulesOpen ? (
          <div role="presentation" onClick={() => setRulesOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
            <div role="dialog" aria-modal="true" aria-label="規則" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, calc(100vw - 32px))", borderRadius: 16, border: "1px solid #e5e7eb", background: "#ffffff", boxShadow: "0 20px 70px -15px rgba(0,0,0,0.15)", padding: 16, color: "#111827" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>注意事項</div>
                <button type="button" aria-label="關閉" onClick={() => setRulesOpen(false)} style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", color: "#374151", display: "grid", placeItems: "center", padding: 0, cursor: "pointer", flex: "0 0 auto" }}>
                  <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>×</span>
                </button>
              </div>
              <ol style={{ marginTop: 12, paddingLeft: 20, display: "grid", gap: 8, fontSize: 13, fontWeight: 700, lineHeight: "18px", color: "#374151", listStyle: "decimal" }}>
                {(RULES[product.type] || RULES.custom).map((line, i) => <li key={i}>{line}</li>)}
              </ol>
            </div>
          </div>
        ) : null}

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

        <GachaResultModal isOpen={draw.showResultModal} onClose={draw.closeResult} results={draw.wonPrizes} hideTicketNumber />
        <PurchaseConfirmationModal
          isOpen={draw.isPurchaseModalOpen}
          onClose={draw.closePurchase}
          onConfirm={draw.confirmPurchase}
          product={product}
          userTokens={user?.tokens || 0}
          userPoints={user?.points || 0}
          isProcessing={draw.isProcessing}
          onTopUp={() => router.push("/topup")}
        />

        <PrizeDetailSheet
          split
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
