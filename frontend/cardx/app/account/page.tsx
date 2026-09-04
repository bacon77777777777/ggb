"use client";

/*
 * 會員中心（桌機版）
 *
 * 全部接真資料：`users`（走 AuthContext）、`user_addresses`、`user_titles`/`titles`、
 * `orders`、`draw_records`、`recharge_records`、`user_coupons`/`coupons`、
 * `product_follows`、`notifications`，以及 `/api/user/settings-status`、
 * `/api/user/referral-status` 兩支 API。
 *
 * 拿掉的東西（我們平台沒有，原型留下來的）：
 *   ・實名認證入口 —— 沒有 `kyc_applications` 這張表，門檻也不需要
 *   ・賣家管理／建卡包 —— 玩家不能在吉吉比開店，商品由廠商供貨
 *   ・交換紀錄分頁 —— 卡牌交換自己有頁（側欄的「卡牌交換」），不重複做一份假的
 *   ・雙重驗證開關 —— 原本只是寫進 localStorage 的一顆假開關
 *
 * 表格用的是手機端會員頁桌機版共用的那組元件（components/profile/desktop），
 * 不要在這裡自己刻 table。
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard, SurfaceRowLink } from "@/cardx/components/ui/Kit";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { asset } from "@/lib/asset";
import { formatMemberNo } from "@/lib/memberNo";
import { BouncingCapsule } from "@/components/ui/BouncingCapsule";
import { GradeBadge } from "@/components/ui/GradeBadge";
import ProfileDataTable, { type ProfileColumn } from "@/components/profile/desktop/ProfileDataTable";
import ProfilePagination from "@/components/profile/desktop/ProfilePagination";
import ProfileSectionHeader from "@/components/profile/desktop/ProfileSectionHeader";
import ProfileStatusBadge from "@/components/profile/desktop/ProfileStatusBadge";
import ProfileToolbar from "@/components/profile/desktop/ProfileToolbar";
import {
  DELIVERY_TABS,
  type DeliveryTabId,
  matchesDeliveryTab,
  normalizeOrderStatus,
  orderStatusConfig,
} from "@/lib/orderStatus";

/** 配送訂單的狀態；儲值訂單（pending / paid / failed）不在這裡 */
const DELIVERY_STATUSES = ["submitted", "processing", "picked_up", "shipping", "delivered", "cancelled", "completed"];

type TabKey = "overview" | "orders" | "draws" | "topup" | "coupons";

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "overview", label: "總覽", icon: "#icon-bag-dollar" },
  { key: "orders", label: "配送訂單", icon: "#icon-box" },
  { key: "draws", label: "抽獎紀錄", icon: "#icon-gift" },
  { key: "topup", label: "儲值紀錄", icon: "#icon-docs" },
  { key: "coupons", label: "我的優惠券", icon: "#icon-promotions" },
];

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  itemCount: number;
  firstItem: string;
  tracking: string | null;
  method: string;
  shippingFee: number;
};

type DrawRow = {
  id: string;
  createdAt: string;
  productName: string;
  prizeName: string;
  grade: string;
  ticketNo: string;
  tokensSpent: number;
  status: string;
};

type TopupRow = {
  id: string;
  orderNumber: string;
  createdAt: string;
  amount: number;
  tokens: number;
  status: string;
};

type CouponRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  expiry: string | null;
  scope: string;
};

const DRAW_STATUS_TEXT: Record<string, string> = {
  in_warehouse: "在倉庫裡",
  pending_delivery: "已申請寄送",
  shipped: "已寄出",
  delivered: "已送達",
  listing: "上架中",
  sold: "已售出",
  dismantled: "已回收",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}

function SectionLoading() {
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 14, padding: "56px 0" }}>
      <BouncingCapsule size={40} />
      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.2em", color: "#9ca3af" }}>載入中</span>
    </div>
  );
}

function UiIcon({ href, size = 18, opacity = 0.92 }: { href: string; size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ opacity }}>
      <use href={href} />
    </svg>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const tab = useMemo<TabKey>(() => {
    const s = (searchParams?.get("tab") ?? "").trim().toLowerCase();
    if (s === "orders" || s === "delivery") return "orders";
    if (s === "draws" || s === "draw" || s === "openings" || s === "opening" || s === "packs" || s === "pack") return "draws";
    if (s === "topup" || s === "recharge") return "topup";
    if (s === "coupons" || s === "coupon") return "coupons";
    return "overview";
  }, [searchParams]);

  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);

  /* ── 總覽 ────────────────────────────────────────────── */
  const [stats, setStats] = useState({ draws: 0, orders: 0, follows: 0, warehouse: 0, unread: 0 });
  const [titleName, setTitleName] = useState<string | null>(null);
  const [defaultAddr, setDefaultAddr] = useState<{ name: string; phone: string; address: string } | null>(null);
  const [addressCount, setAddressCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [lineBound, setLineBound] = useState<boolean | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [referral, setReferral] = useState<{ qualified: number; claimable: number; nextTarget: number } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  /* ── 分頁資料 ─────────────────────────────────────────── */
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [draws, setDraws] = useState<DrawRow[]>([]);
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const [deliveryTab, setDeliveryTab] = useState<DeliveryTabId>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [tab, deliveryTab]);

  function goTab(next: TabKey) {
    router.replace(next === "overview" ? "/account" : `/account?tab=${next}`);
  }

  useEffect(() => {
    if (!tabMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const wrap = tabMenuRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target as Node)) return;
      setTabMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [tabMenuOpen]);

  /* ── 總覽：一次把要用的數字撈齊 ───────────────────────── */
  const loadOverview = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [drawCount, orderCount, followCount, warehouseCount, unread, addr, titles, recent] = await Promise.all([
      supabase.from("draw_records").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", DELIVERY_STATUSES),
      supabase.from("product_follows").select("product_id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("draw_records").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "in_warehouse"),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
      supabase
        .from("user_addresses")
        .select("recipient_name, recipient_phone, address, is_default")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }),
      supabase.from("user_titles").select("title_id").eq("user_id", user.id).eq("is_selected", true).limit(1),
      supabase
        .from("orders")
        .select("id, order_number, status, created_at, tracking_number, shipping_fee, logistics_type, draw_records ( id, prize_name, product_prizes ( name ) )")
        .eq("user_id", user.id)
        .in("status", DELIVERY_STATUSES)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    setStats({
      draws: drawCount.count ?? 0,
      orders: orderCount.count ?? 0,
      follows: followCount.count ?? 0,
      warehouse: warehouseCount.count ?? 0,
      unread: unread.count ?? 0,
    });

    const addrRows = (addr.data ?? []) as unknown as Array<Record<string, unknown>>;
    setAddressCount(addrRows.length);
    const d = addrRows[0];
    setDefaultAddr(
      d
        ? {
            name: String(d.recipient_name ?? ""),
            phone: String(d.recipient_phone ?? ""),
            address: String(d.address ?? ""),
          }
        : null
    );

    /* 稱號分兩趟拿：user_titles 只存 title_id，名字在 titles（跟手機版一樣） */
    const selectedTitleId = ((titles.data ?? [])[0] as { title_id?: number | string } | undefined)?.title_id ?? null;
    if (selectedTitleId != null) {
      const { data: titleRow } = await supabase.from("titles").select("name").eq("id", selectedTitleId).maybeSingle();
      setTitleName((titleRow as { name?: string } | null)?.name ?? null);
    } else {
      setTitleName(null);
    }

    setRecentOrders(mapOrders(recent.data));
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadOverview();
  }, [authLoading, loadOverview]);

  /* 帳號狀態（LINE 綁定、密碼）與邀請進度 —— 兩支既有 API */
  useEffect(() => {
    if (!user) return;
    let dead = false;
    void fetch("/api/user/settings-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead || !d) return;
        setLineBound(Boolean(d?.line?.bound));
        setHasPassword(Boolean(d?.password?.set));
      })
      .catch(() => {});
    void fetch("/api/user/referral-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead || !d) return;
        setReferral({ qualified: Number(d.qualified ?? 0), claimable: Number(d.claimable ?? 0), nextTarget: Number(d.nextTarget ?? 5) });
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [user]);

  async function claimReferral() {
    setClaiming(true);
    setMsg(null);
    try {
      const res = await fetch("/api/user/referral-status", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "領取失敗");
      setMsg({ tone: "ok", text: "邀請獎勵已入帳" });
      const refreshed = await fetch("/api/user/referral-status").then((r) => (r.ok ? r.json() : null));
      if (refreshed) {
        setReferral({
          qualified: Number(refreshed.qualified ?? 0),
          claimable: Number(refreshed.claimable ?? 0),
          nextTarget: Number(refreshed.nextTarget ?? 5),
        });
      }
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message || "領取失敗，請稍後再試" });
    } finally {
      setClaiming(false);
    }
  }

  /* ── 各分頁的資料 ─────────────────────────────────────── */
  const loadTab = useCallback(async () => {
    if (!user || tab === "overview") return;
    setTabLoading(true);
    if (tab === "orders") {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, status, created_at, tracking_number, shipping_fee, logistics_type, draw_records ( id, prize_name, product_prizes ( name ) )")
        .eq("user_id", user.id)
        .in("status", DELIVERY_STATUSES)
        .order("created_at", { ascending: false });
      setOrders(mapOrders(data));
    } else if (tab === "draws") {
      const { data } = await supabase
        .from("draw_records")
        .select("id, created_at, ticket_number, prize_level, prize_name, tokens_spent, status, product_prizes ( level, name ), products ( name )")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      setDraws(
        ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
          const prize = r.product_prizes as { level?: string; name?: string } | null | undefined;
          const product = r.products as { name?: string } | null | undefined;
          return {
            id: String(r.id),
            createdAt: String(r.created_at ?? ""),
            productName: String(product?.name ?? "未知商品"),
            prizeName: String(prize?.name ?? r.prize_name ?? "未知獎品"),
            grade: String(prize?.level ?? r.prize_level ?? ""),
            ticketNo: r.ticket_number != null ? String(r.ticket_number) : "",
            tokensSpent: Number(r.tokens_spent ?? 0),
            status: String(r.status ?? ""),
          };
        })
      );
    } else if (tab === "topup") {
      const { data } = await supabase
        .from("recharge_records")
        .select("id, order_number, created_at, amount, bonus, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      setTopups(
        ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          orderNumber: String(r.order_number ?? r.id),
          createdAt: String(r.created_at ?? ""),
          amount: Number(r.amount ?? 0),
          tokens: Number(r.amount ?? 0) + Number(r.bonus ?? 0),
          status: String(r.status ?? ""),
        }))
      );
    } else if (tab === "coupons") {
      const { data } = await supabase
        .from("user_coupons")
        .select("id, status, expiry_date, coupons ( title, description, scope, discount_type, discount_value )")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setCoupons(
        ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
          const c = r.coupons as
            | { title?: string; description?: string; scope?: string; discount_type?: string; discount_value?: number }
            | null
            | undefined;
          return {
            id: String(r.id),
            title: String(c?.title ?? "優惠券"),
            description: String(c?.description ?? ""),
            status: String(r.status ?? ""),
            expiry: r.expiry_date ? String(r.expiry_date) : null,
            scope: c?.scope === "shipping" ? "運費折抵" : "抽獎折抵",
          };
        })
      );
    }
    setTabLoading(false);
  }, [supabase, tab, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadTab();
  }, [authLoading, loadTab]);

  /* ── 表格欄位 ─────────────────────────────────────────── */
  const orderColumns: Array<ProfileColumn<OrderRow>> = useMemo(
    () => [
      { key: "no", header: "訂單編號", render: (r) => <span className="font-black">{r.orderNumber}</span> },
      {
        key: "items",
        header: "內容",
        render: (r) => (
          <span className="truncate block max-w-[260px]">
            {r.firstItem ? (r.itemCount > 1 ? `${r.firstItem} 等 ${r.itemCount} 件` : r.firstItem) : `${r.itemCount} 件獎品`}
          </span>
        ),
      },
      { key: "method", header: "配送方式", render: (r) => r.method },
      { key: "fee", header: "運費", render: (r) => (r.shippingFee > 0 ? `${r.shippingFee} G` : "免運") },
      { key: "tracking", header: "物流單號", render: (r) => r.tracking ?? "尚未開單" },
      { key: "status", header: "狀態", render: (r) => <ProfileStatusBadge config={orderStatusConfig(r.status)} /> },
      { key: "date", header: "申請時間", render: (r) => <span className="text-neutral-500">{fmtTime(r.createdAt)}</span> },
    ],
    []
  );

  const drawColumns: Array<ProfileColumn<DrawRow>> = useMemo(
    () => [
      { key: "grade", header: "賞等", render: (r) => <GradeBadge grade={r.grade} size="sm" /> },
      { key: "prize", header: "獎品", render: (r) => <span className="font-black truncate block max-w-[220px]">{r.prizeName}</span> },
      { key: "product", header: "來自", render: (r) => <span className="truncate block max-w-[220px] text-neutral-500">{r.productName}</span> },
      { key: "ticket", header: "籤號", render: (r) => r.ticketNo || "—" },
      { key: "cost", header: "花費", render: (r) => (r.tokensSpent > 0 ? `${r.tokensSpent} G` : "—") },
      { key: "status", header: "去向", render: (r) => DRAW_STATUS_TEXT[r.status] ?? "處理中" },
      { key: "date", header: "抽獎時間", render: (r) => <span className="text-neutral-500">{fmtTime(r.createdAt)}</span> },
    ],
    []
  );

  const topupColumns: Array<ProfileColumn<TopupRow>> = useMemo(
    () => [
      { key: "no", header: "訂單編號", render: (r) => <span className="font-black">{r.orderNumber}</span> },
      { key: "amount", header: "付款金額", render: (r) => `NT$ ${r.amount.toLocaleString()}` },
      { key: "tokens", header: "入帳", render: (r) => `${r.tokens.toLocaleString()} G` },
      {
        key: "status",
        header: "狀態",
        render: (r) => (
          <span className="font-bold">
            {r.status === "completed" || r.status === "paid" ? "已完成" : r.status === "failed" ? "未完成" : "處理中"}
          </span>
        ),
      },
      { key: "date", header: "時間", render: (r) => <span className="text-neutral-500">{fmtTime(r.createdAt)}</span> },
    ],
    []
  );

  const couponColumns: Array<ProfileColumn<CouponRow>> = useMemo(
    () => [
      { key: "title", header: "名稱", render: (r) => <span className="font-black">{r.title}</span> },
      { key: "scope", header: "可折抵", render: (r) => r.scope },
      { key: "desc", header: "說明", render: (r) => <span className="truncate block max-w-[300px] text-neutral-500">{r.description || "—"}</span> },
      {
        key: "status",
        header: "狀態",
        render: (r) => (
          <span className="font-bold">{r.status === "unused" ? "可使用" : r.status === "used" ? "已使用" : "已過期"}</span>
        ),
      },
      { key: "expiry", header: "有效期限", render: (r) => (r.expiry ? new Date(r.expiry).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }) : "不限") },
    ],
    []
  );

  /* ── 分頁切片 ─────────────────────────────────────────── */
  const filteredOrders = useMemo(() => orders.filter((o) => matchesDeliveryTab(deliveryTab, o.status)), [orders, deliveryTab]);
  const pageSlice = <T,>(rows: T[]) => rows.slice((page - 1) * pageSize, page * pageSize);

  const memberNo = formatMemberNo(user?.invite_code ?? null);
  const balance = Number(user?.tokens ?? 0);
  const points = Number(user?.points ?? 0);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="會員中心" />

            <div className={homeStyles.accountContainer}>
              {/* 頁籤（≤768 收成下拉） */}
              <div ref={tabMenuRef} className={homeStyles.accountTabsDropdownWrap}>
                <button
                  type="button"
                  className={homeStyles.accountTabsDropdownBtn}
                  aria-label="切換會員中心頁籤"
                  aria-expanded={tabMenuOpen}
                  onClick={() => setTabMenuOpen((v) => !v)}
                >
                  <span className={homeStyles.accountTabsDropdownLeft}>
                    <span className={homeStyles.accountTabsDropdownIcon} aria-hidden="true">
                      <UiIcon href={TABS.find((t) => t.key === tab)!.icon} size={18} />
                    </span>
                    <span className={homeStyles.accountTabsDropdownText}>{TABS.find((t) => t.key === tab)!.label}</span>
                  </span>
                  <span
                    className={`${homeStyles.accountTabsDropdownChevron} ${tabMenuOpen ? homeStyles.accountTabsDropdownChevronOpen : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {tabMenuOpen ? (
                  <div className={homeStyles.accountTabsDropdownMenu} role="menu" aria-label="會員中心頁籤">
                    {TABS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`${homeStyles.accountTabsDropdownItem} ${t.key === tab ? homeStyles.accountTabsDropdownItemActive : ""}`}
                        role="menuitem"
                        onClick={() => {
                          setTabMenuOpen(false);
                          goTab(t.key);
                        }}
                      >
                        <span className={homeStyles.accountTabsDropdownIcon} aria-hidden="true">
                          <UiIcon href={t.icon} size={18} />
                        </span>
                        <span className={homeStyles.accountTabsDropdownText}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={homeStyles.accountTabsRow}>
                {TABS.map((t) => {
                  const active = t.key === tab;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => goTab(t.key)}
                      className={`${homeStyles.accountTabBtn} ${active ? homeStyles.accountTabBtnActive : ""}`}
                      style={{
                        borderRadius: 16,
                        border: 0,
                        cursor: "pointer",
                        display: "grid",
                        justifyItems: "center",
                        alignContent: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 16,
                          display: "grid",
                          placeItems: "center",
                          background: active ? "rgba(43,124,255,0.26)" : "#f3f4f6",
                          color: "#374151",
                        }}
                      >
                        <UiIcon href={t.icon} size={20} />
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.2px" }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {authLoading || loading ? (
                <SectionLoading />
              ) : !user ? (
                <div style={{ marginTop: 14 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>登入後才看得到你的會員中心</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                      抽獎紀錄、倉庫、配送訂單與優惠券都會在這裡。
                    </div>
                    <Button3D color="blue" href="/login" style={{ height: 40, borderRadius: 12 }}>
                      前往登入
                    </Button3D>
                  </SurfaceCard>
                </div>
              ) : tab === "overview" ? (
                <>
                  {msg ? (
                    <div style={{ marginTop: 14 }}>
                      <SurfaceCard
                        style={{
                          borderRadius: 14,
                          padding: "10px 12px",
                          background: msg.tone === "ok" ? "rgba(16,185,129,0.10)" : "rgba(220,38,38,0.08)",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 900, color: msg.tone === "ok" ? "#047857" : "#dc2626" }}>{msg.text}</div>
                      </SurfaceCard>
                    </div>
                  ) : null}

                  <div className={homeStyles.accountSummaryGrid}>
                    {/* 玩家卡 */}
                    <div className={homeStyles.accountCard} style={{ borderRadius: 16, display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <img
                          alt=""
                          src={user.avatar_url || asset("/images/avatar/01.webp")}
                          style={{ width: 46, height: 46, borderRadius: 999, objectFit: "cover", background: "#f3f4f6", flex: "0 0 auto" }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {user.name || "玩家"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                            會員編號 {memberNo || "—"}
                          </div>
                        </div>
                      </div>
                      {titleName ? <Pill tone="info">{titleName}</Pill> : null}
                    </div>

                    {/* 餘額 */}
                    <div className={homeStyles.accountCard} style={{ borderRadius: 16, display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>我的 G 幣</div>
                      <div style={{ fontSize: 26, fontWeight: 950, color: "#111827", lineHeight: 1.1 }}>{balance.toLocaleString()}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>積分 {points.toLocaleString()}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                        <Button3D color="blue" href="/topup" style={{ height: 34, borderRadius: 12 }}>
                          儲值
                        </Button3D>
                        <SecondaryButton onClick={() => goTab("topup")} style={{ height: 34, borderRadius: 12 }}>
                          儲值紀錄
                        </SecondaryButton>
                      </div>
                    </div>

                    {/* 收件地址 */}
                    <div className={homeStyles.accountCard} style={{ borderRadius: 16, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>預設收件地址</div>
                        <SecondaryButton href="/account/addresses" style={{ height: 30, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                          {addressCount ? "管理" : "新增"}
                        </SecondaryButton>
                      </div>
                      {defaultAddr ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
                            {defaultAddr.name} · {defaultAddr.phone}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 850, color: "#374151", lineHeight: "18px" }}>{defaultAddr.address}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626" }}>還沒設定，寄送獎品前要先填一筆</div>
                      )}
                    </div>
                  </div>

                  {/* 數字總覽 */}
                  <div className={homeStyles.accountSummaryGrid}>
                    {[
                      { label: "抽過幾次", value: stats.draws, onClick: () => goTab("draws") },
                      { label: "倉庫待處理", value: stats.warehouse, onClick: () => router.push("/checkout") },
                      { label: "配送訂單", value: stats.orders, onClick: () => goTab("orders") },
                      { label: "追蹤中的商品", value: stats.follows, onClick: () => router.push("/favorites") },
                      { label: "未讀通知", value: stats.unread, onClick: () => router.push("/announcements") },
                    ].map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={s.onClick}
                        className={homeStyles.accountCard}
                        style={{ borderRadius: 16, cursor: "pointer", textAlign: "left", display: "grid", gap: 6 }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 950, color: "#111827" }}>{s.value.toLocaleString()}</div>
                      </button>
                    ))}
                  </div>

                  <div className={homeStyles.accountMidGrid}>
                    {/* 最近的配送訂單 */}
                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <ProfileSectionHeader
                        title="最近的配送訂單"
                        description="按一下看進度與收件資訊"
                        actions={
                          <SecondaryButton onClick={() => goTab("orders")} style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                            看全部
                          </SecondaryButton>
                        }
                      />
                      {recentOrders.length ? (
                        <div style={{ display: "grid", gap: 10 }}>
                          {recentOrders.map((o) => (
                            <SurfaceRowLink key={o.id} href={`/orders/${o.id}`}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {o.firstItem ? (o.itemCount > 1 ? `${o.firstItem} 等 ${o.itemCount} 件` : o.firstItem) : `${o.itemCount} 件獎品`}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>{fmtTime(o.createdAt)}</div>
                              </div>
                              <Pill tone={normalizeOrderStatus(o.status) === "cancelled" ? "danger" : normalizeOrderStatus(o.status) === "delivered" ? "success" : "info"}>
                                {orderStatusConfig(o.status).label}
                              </Pill>
                            </SurfaceRowLink>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>還沒有配送訂單</div>
                      )}
                    </SurfaceCard>

                    {/* 帳號與邀請 */}
                    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                      <SurfaceCard style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>帳號</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>LINE</span>
                          <span style={{ fontSize: 12, fontWeight: 900, color: lineBound ? "#047857" : "#9ca3af" }}>
                            {lineBound === null ? "查詢中…" : lineBound ? "已綁定" : "尚未綁定"}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>登入密碼</span>
                          <span style={{ fontSize: 12, fontWeight: 900, color: hasPassword ? "#047857" : "#9ca3af" }}>
                            {hasPassword === null ? "查詢中…" : hasPassword ? "已設定" : "尚未設定"}
                          </span>
                        </div>
                        <SecondaryButton href="/profile?tab=settings" style={{ height: 34, borderRadius: 12 }}>
                          帳號設定
                        </SecondaryButton>
                      </SurfaceCard>

                      <SurfaceCard style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>邀請好友</div>
                        <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>
                          你的邀請碼就是會員編號 <b style={{ color: "#111827" }}>{memberNo || "—"}</b>
                        </div>
                        {referral ? (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>
                              已成功邀請 {referral.qualified} 位，再 {Math.max(0, referral.nextTarget - referral.qualified)} 位可以再領一次
                            </div>
                            {referral.claimable > 0 ? (
                              <Button3D color="green" onClick={() => void claimReferral()} disabled={claiming} style={{ height: 36, borderRadius: 12 }}>
                                {claiming ? "領取中…" : `領取 ${referral.claimable} 積分`}
                              </Button3D>
                            ) : null}
                          </>
                        ) : null}
                        <SecondaryButton href="/invite" style={{ height: 34, borderRadius: 12 }}>
                          邀請頁
                        </SecondaryButton>
                      </SurfaceCard>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <SurfaceCard style={{ display: "grid", gap: 12 }}>
                    {tab === "orders" ? (
                      <>
                        <ProfileSectionHeader title="配送訂單" description="從倉庫申請寄出的獎品" />
                        <ProfileToolbar
                          left={
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {DELIVERY_TABS.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => setDeliveryTab(t.id)}
                                  style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}
                                >
                                  <Pill tone={deliveryTab === t.id ? "info" : "muted"}>
                                    {t.label} {orders.filter((o) => matchesDeliveryTab(t.id, o.status)).length}
                                  </Pill>
                                </button>
                              ))}
                            </div>
                          }
                          right={
                            <SecondaryButton href="/checkout" style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                              申請寄送
                            </SecondaryButton>
                          }
                        />
                        {tabLoading ? (
                          <SectionLoading />
                        ) : (
                          <>
                            <ProfileDataTable
                              columns={orderColumns}
                              rows={pageSlice(filteredOrders)}
                              rowKey={(r) => r.id}
                              onRowClick={(r) => router.push(`/orders/${r.id}`)}
                              empty="還沒有配送訂單"
                            />
                            <ProfilePagination
                              page={page}
                              pageSize={pageSize}
                              total={filteredOrders.length}
                              onPageChange={setPage}
                              onPageSizeChange={(n) => {
                                setPageSize(n);
                                setPage(1);
                              }}
                            />
                          </>
                        )}
                      </>
                    ) : tab === "draws" ? (
                      <>
                        <ProfileSectionHeader title="抽獎紀錄" description="每一抽的賞等、籤號與獎品去向" />
                        {tabLoading ? (
                          <SectionLoading />
                        ) : (
                          <>
                            <ProfileDataTable
                              columns={drawColumns}
                              rows={pageSlice(draws)}
                              rowKey={(r) => r.id}
                              onRowClick={(r) => router.push(`/openings/${r.id}`)}
                              empty="還沒有抽獎紀錄"
                            />
                            <ProfilePagination
                              page={page}
                              pageSize={pageSize}
                              total={draws.length}
                              onPageChange={setPage}
                              onPageSizeChange={(n) => {
                                setPageSize(n);
                                setPage(1);
                              }}
                            />
                          </>
                        )}
                      </>
                    ) : tab === "topup" ? (
                      <>
                        <ProfileSectionHeader
                          title="儲值紀錄"
                          description="每一筆儲值的金額與入帳的 G 幣"
                          actions={
                            <SecondaryButton href="/topup" style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                              前往儲值
                            </SecondaryButton>
                          }
                        />
                        {tabLoading ? (
                          <SectionLoading />
                        ) : (
                          <>
                            <ProfileDataTable columns={topupColumns} rows={pageSlice(topups)} rowKey={(r) => r.id} empty="還沒有儲值紀錄" />
                            <ProfilePagination
                              page={page}
                              pageSize={pageSize}
                              total={topups.length}
                              onPageChange={setPage}
                              onPageSizeChange={(n) => {
                                setPageSize(n);
                                setPage(1);
                              }}
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <ProfileSectionHeader title="我的優惠券" description="抽獎折抵與運費折抵都在這裡" />
                        {tabLoading ? (
                          <SectionLoading />
                        ) : (
                          <>
                            <ProfileDataTable columns={couponColumns} rows={pageSlice(coupons)} rowKey={(r) => r.id} empty="還沒有優惠券" />
                            <ProfilePagination
                              page={page}
                              pageSize={pageSize}
                              total={coupons.length}
                              onPageChange={setPage}
                              onPageSizeChange={(n) => {
                                setPageSize(n);
                                setPage(1);
                              }}
                            />
                          </>
                        )}
                      </>
                    )}
                  </SurfaceCard>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/** orders + 底下的 draw_records 攤平成列表要用的樣子 */
function mapOrders(data: unknown): OrderRow[] {
  return ((data ?? []) as Array<Record<string, unknown>>).map((o) => {
    const records = Array.isArray(o.draw_records) ? (o.draw_records as Array<Record<string, unknown>>) : [];
    const first = records[0];
    const prize = first?.product_prizes as { name?: string } | null | undefined;
    return {
      id: String(o.id),
      orderNumber: String(o.order_number ?? o.id),
      status: String(o.status ?? "submitted"),
      createdAt: String(o.created_at ?? new Date().toISOString()),
      itemCount: records.length,
      firstItem: String(prize?.name ?? first?.prize_name ?? ""),
      tracking: o.tracking_number ? String(o.tracking_number) : null,
      method: String(o.logistics_type ?? "HOME") === "CVS" ? "超商取貨" : "宅配到府",
      shippingFee: Number(o.shipping_fee ?? 0),
    };
  });
}
