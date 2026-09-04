"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { supabaseBrowser } from "@/cardx/lib/supabase/browser";
import { mockMarketListings } from "@/cardx/lib/mock/home";
import { Button3D, KeyValueRow, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";

type OrderStatus =
  | "created"
  | "payment_pending"
  | "paid"
  | "packing"
  | "shipped"
  | "delivered"
  | "completed"
  | "canceled"
  | "refund_pending"
  | "refunded"
  | "dispute_open"
  | "dispute_resolved";

type Order = {
  id: string;
  kind: "market";
  refId: string;
  title: string;
  imageUrl: string;
  amountSubtotal: number;
  shippingFee: number;
  platformFee: number;
  totalAmount: number;
  currency: "TWD";
  status: OrderStatus;
  createdAt: number;
  addressSnapshot: { name: string; phone: string; addressLine: string };
  shipment?: { carrier: string; trackingNo: string; status: "created" | "shipped" | "delivered" };
};

const ORDERS_KEY = "cardx.orders.v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function normalizeMarketId(id: string) {
  if (!id.startsWith("listing_")) return id;
  const parts = id.split("_");
  if (parts.length >= 2) return `${parts[0]}_${parts[1]}`;
  return id;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function twd(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Math.round(n));
}

function statusLabel(status: OrderStatus) {
  if (status === "paid") return "已付款";
  if (status === "packing") return "備貨中";
  if (status === "shipped") return "已出貨";
  if (status === "delivered") return "已送達";
  if (status === "completed") return "已完成";
  if (status === "canceled") return "已取消";
  if (status === "refund_pending") return "退款處理中";
  if (status === "refunded") return "已退款";
  if (status === "dispute_open") return "爭議處理中";
  if (status === "dispute_resolved") return "爭議已結案";
  return "處理中";
}

function statusTone(status: OrderStatus): "muted" | "success" | "danger" | "info" {
  if (status === "completed") return "success";
  if (status === "refunded" || status === "refund_pending" || status === "dispute_open") return "danger";
  if (status === "canceled") return "muted";
  return "info";
}

function UiIcon({ href, size = 18, opacity = 0.92 }: { href: string; size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ opacity }}>
      <use href={href} />
    </svg>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);

  const [order, setOrder] = useState<Order | null>(null);

  const tabs = useMemo(
    () => [
      { key: "overview", label: "總覽", icon: "#icon-bag-dollar" as const, href: "/account" },
      { key: "orders", label: "我的訂單", icon: "#icon-box" as const, href: "/account?tab=orders" },
      { key: "openings", label: "卡包紀錄", icon: "#icon-gift" as const, href: "/account?tab=openings" },
      { key: "trades", label: "交換紀錄", icon: "#icon-swap" as const, href: "/account?tab=trades" },
      { key: "seller", label: "賣家管理", icon: "#icon-docs" as const, href: "/account?tab=seller" },
    ],
    []
  );
  const activeTab = useMemo(() => tabs.find((t) => t.key === "orders") ?? tabs[0]!, [tabs]);

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

  useEffect(() => {
    const supabase = supabaseBrowser();
    const sb = supabase ?? null;
    let alive = true;

    function syncLocal() {
      const list = readJson<Order[]>(ORDERS_KEY, []);
      const hit = list.find((x) => x.id === id) ?? null;
      setOrder(hit);
    }

    async function sync() {
      if (!alive) return;
      if (!id) {
        setOrder(null);
        return;
      }
      if (!sb || !isUuid(id)) {
        syncLocal();
        return;
      }
      try {
        const { data: sessionData } = await sb.auth.getSession();
        const uid = sessionData.session?.user?.id ?? null;
        if (!alive) return;
        if (!uid) {
          syncLocal();
          return;
        }
        const { data: row, error } = await sb
          .from("orders")
          .select("id, ref_id, amount_subtotal, shipping_fee, platform_fee, amount_total, status, created_at, shipping, address_id")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!row) {
          setOrder(null);
          return;
        }
        const refId = normalizeMarketId(String(row.ref_id ?? ""));
        const listing = mockMarketListings.find((x) => x.id === refId) ?? null;
        const shipping = row.shipping && typeof row.shipping === "object" ? (row.shipping as Record<string, unknown>) : {};
        const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();

        let addressSnapshot: Order["addressSnapshot"] = { name: "", phone: "", addressLine: "" };
        if (row.address_id) {
          const { data: addr } = await sb
            .from("addresses")
            .select("recipient_name, phone, line1")
            .eq("id", String(row.address_id))
            .maybeSingle();
          if (addr) {
            addressSnapshot = {
              name: String((addr as { recipient_name?: unknown }).recipient_name ?? ""),
              phone: String((addr as { phone?: unknown }).phone ?? ""),
              addressLine: String((addr as { line1?: unknown }).line1 ?? ""),
            };
          }
        }

        const mapped: Order = {
          id: String(row.id),
          kind: "market",
          refId,
          title: listing?.title ?? `訂單 ${refId || String(row.id)}`,
          imageUrl: "/cardx/placeholder.svg",
          amountSubtotal: Number(row.amount_subtotal ?? 0),
          shippingFee: Number(row.shipping_fee ?? 0),
          platformFee: Number(row.platform_fee ?? 0),
          totalAmount: Number(row.amount_total ?? 0),
          currency: "TWD",
          status: String(row.status ?? "paid") as OrderStatus,
          createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
          addressSnapshot,
          shipment:
            typeof shipping.trackingNo === "string" || typeof shipping.tracking_no === "string"
              ? {
                  carrier: String((shipping.carrier as string) ?? "newebpay-logistics"),
                  trackingNo: String((shipping.trackingNo as string) ?? (shipping.tracking_no as string) ?? ""),
                  status: String((shipping.status as string) ?? "created") as "created" | "shipped" | "delivered",
                }
              : undefined,
        };
        setOrder(mapped);
      } catch {
        syncLocal();
      }
    }

    window.setTimeout(() => void sync(), 0);
    const authSub = sb?.auth.onAuthStateChange(() => {
      void sync();
    });
    return () => {
      alive = false;
      authSub?.data.subscription.unsubscribe();
    };
  }, [id]);

  const timeline = useMemo(() => {
    if (!order) return [];
    const base = order.createdAt;
    const steps: Array<{ key: string; label: string; at?: number; active: boolean }> = [
      { key: "paid", label: "已付款", at: order.status === "paid" || order.status === "packing" || order.status === "shipped" || order.status === "delivered" || order.status === "completed" ? base + 3 * 60 * 1000 : undefined, active: order.status !== "created" && order.status !== "payment_pending" },
      { key: "packing", label: "備貨中", at: order.status === "packing" || order.status === "shipped" || order.status === "delivered" || order.status === "completed" ? base + 60 * 60 * 1000 : undefined, active: order.status === "packing" || order.status === "shipped" || order.status === "delivered" || order.status === "completed" },
      { key: "shipped", label: "已出貨", at: order.status === "shipped" || order.status === "delivered" || order.status === "completed" ? base + 4 * 60 * 60 * 1000 : undefined, active: order.status === "shipped" || order.status === "delivered" || order.status === "completed" },
      { key: "delivered", label: "已送達", at: order.status === "delivered" || order.status === "completed" ? base + 30 * 60 * 60 * 1000 : undefined, active: order.status === "delivered" || order.status === "completed" },
      { key: "completed", label: "已完成", at: order.status === "completed" ? base + 31 * 60 * 60 * 1000 : undefined, active: order.status === "completed" },
    ];
    return steps;
  }, [order]);

  function markShipped() {
    if (!order) return;
    if (order.status !== "paid" && order.status !== "packing") return;
    const supabase = supabaseBrowser();
    if (supabase && isUuid(order.id)) {
      void (async () => {
        const nextShipment = order.shipment ? { ...order.shipment, status: "shipped" as const } : order.shipment;
        const patch = nextShipment ? { carrier: nextShipment.carrier, trackingNo: nextShipment.trackingNo, status: nextShipment.status } : {};
        const { error } = await supabase.from("orders").update({ status: "shipped", shipping: patch }).eq("id", order.id);
        if (error) return;
        setOrder((prev) => (prev ? { ...prev, status: "shipped", shipment: nextShipment } : prev));
      })();
      return;
    }
    const list = readJson<Order[]>(ORDERS_KEY, []);
    const idx = list.findIndex((x) => x.id === order.id);
    if (idx < 0) return;
    const next: Order = { ...order, status: "shipped", shipment: order.shipment ? { ...order.shipment, status: "shipped" } : undefined };
    const nextList = [...list];
    nextList[idx] = next;
    writeJson(ORDERS_KEY, nextList);
    setOrder(next);
  }

  function markDelivered() {
    if (!order) return;
    const supabase = supabaseBrowser();
    if (supabase && isUuid(order.id)) {
      void (async () => {
        const nextShipment = order.shipment ? { ...order.shipment, status: "delivered" as const } : order.shipment;
        const patch = nextShipment ? { carrier: nextShipment.carrier, trackingNo: nextShipment.trackingNo, status: nextShipment.status } : {};
        const { error } = await supabase.from("orders").update({ status: "delivered", shipping: patch }).eq("id", order.id);
        if (error) return;
        setOrder((prev) => (prev ? { ...prev, status: "delivered", shipment: nextShipment } : prev));
      })();
      return;
    }
    const list = readJson<Order[]>(ORDERS_KEY, []);
    const idx = list.findIndex((x) => x.id === order.id);
    if (idx < 0) return;
    const next: Order = { ...order, status: "delivered", shipment: order.shipment ? { ...order.shipment, status: "delivered" } : undefined };
    const nextList = [...list];
    nextList[idx] = next;
    writeJson(ORDERS_KEY, nextList);
    setOrder(next);
  }

  function markCompleted() {
    if (!order) return;
    const supabase = supabaseBrowser();
    if (supabase && isUuid(order.id)) {
      void (async () => {
        const { error } = await supabase.from("orders").update({ status: "completed" }).eq("id", order.id);
        if (error) return;
        setOrder((prev) => (prev ? { ...prev, status: "completed" } : prev));
      })();
      return;
    }
    const list = readJson<Order[]>(ORDERS_KEY, []);
    const idx = list.findIndex((x) => x.id === order.id);
    if (idx < 0) return;
    const next: Order = { ...order, status: "completed" };
    const nextList = [...list];
    nextList[idx] = next;
    writeJson(ORDERS_KEY, nextList);
    setOrder(next);
  }

  function cancelOrder() {
    if (!order) return;
    if (order.status !== "created" && order.status !== "payment_pending") return;
    const supabase = supabaseBrowser();
    if (supabase && isUuid(order.id)) {
      void (async () => {
        const { error } = await supabase.from("orders").update({ status: "canceled" }).eq("id", order.id);
        if (error) return;
        setOrder((prev) => (prev ? { ...prev, status: "canceled" } : prev));
      })();
      return;
    }
    const list = readJson<Order[]>(ORDERS_KEY, []);
    const idx = list.findIndex((x) => x.id === order.id);
    if (idx < 0) return;
    const next: Order = { ...order, status: "canceled" };
    const nextList = [...list];
    nextList[idx] = next;
    writeJson(ORDERS_KEY, nextList);
    setOrder(next);
  }

  function requestRefund() {
    if (!order) return;
    if (order.status !== "paid" && order.status !== "packing" && order.status !== "shipped") return;
    const supabase = supabaseBrowser();
    if (supabase && isUuid(order.id)) {
      void (async () => {
        const { error } = await supabase.from("orders").update({ status: "refund_pending" }).eq("id", order.id);
        if (error) return;
        setOrder((prev) => (prev ? { ...prev, status: "refund_pending" } : prev));
      })();
      return;
    }
    const list = readJson<Order[]>(ORDERS_KEY, []);
    const idx = list.findIndex((x) => x.id === order.id);
    if (idx < 0) return;
    const next: Order = { ...order, status: "refund_pending" };
    const nextList = [...list];
    nextList[idx] = next;
    writeJson(ORDERS_KEY, nextList);
    setOrder(next);
  }

  function openDispute() {
    if (!order) return;
    if (order.status === "completed" || order.status === "canceled" || order.status === "refunded") return;
    const supabase = supabaseBrowser();
    if (supabase && isUuid(order.id)) {
      void (async () => {
        const { error } = await supabase.from("orders").update({ status: "dispute_open" }).eq("id", order.id);
        if (error) return;
        setOrder((prev) => (prev ? { ...prev, status: "dispute_open" } : prev));
      })();
      return;
    }
    const list = readJson<Order[]>(ORDERS_KEY, []);
    const idx = list.findIndex((x) => x.id === order.id);
    if (idx < 0) return;
    const next: Order = { ...order, status: "dispute_open" };
    const nextList = [...list];
    nextList[idx] = next;
    writeJson(ORDERS_KEY, nextList);
    setOrder(next);
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <div className={homeStyles.accountContainer}>
              <div ref={tabMenuRef} className={homeStyles.accountTabsDropdownWrap}>
                <button
                  type="button"
                  className={homeStyles.accountTabsDropdownBtn}
                  aria-label="切換帳戶頁籤"
                  aria-expanded={tabMenuOpen}
                  onClick={() => setTabMenuOpen((v) => !v)}
                >
                  <span className={homeStyles.accountTabsDropdownLeft}>
                    <span className={homeStyles.accountTabsDropdownIcon} aria-hidden="true">
                      <UiIcon href={activeTab.icon} size={18} />
                    </span>
                    <span className={homeStyles.accountTabsDropdownText}>{activeTab.label}</span>
                  </span>
                  <span
                    className={`${homeStyles.accountTabsDropdownChevron} ${tabMenuOpen ? homeStyles.accountTabsDropdownChevronOpen : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {tabMenuOpen ? (
                  <div className={homeStyles.accountTabsDropdownMenu} role="menu" aria-label="帳戶頁籤">
                    {tabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`${homeStyles.accountTabsDropdownItem} ${t.key === activeTab.key ? homeStyles.accountTabsDropdownItemActive : ""}`}
                        role="menuitem"
                        onClick={() => {
                          setTabMenuOpen(false);
                          router.push(t.href);
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
                {tabs.map((t) => {
                  const active = t.key === activeTab.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => router.push(t.href)}
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
                          background: active ? "rgba(43,124,255,0.26)" : "rgba(255,255,255,0.06)",
                          color: "rgba(255,255,255,0.82)",
                        }}
                      >
                        <UiIcon href={t.icon} size={20} />
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.2px" }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => router.push("/account?tab=orders")}
                    aria-label="返回"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      border: 0,
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.86)",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      flex: "0 0 auto",
                    }}
                  >
                    <UiIcon href="#icon-chevron-left" size={18} opacity={0.85} />
                  </button>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 950,
                      color: "rgba(255,255,255,0.92)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {id}
                  </div>
                </div>
                {order ? <Pill tone={statusTone(order.status)}>{statusLabel(order.status)}</Pill> : null}
              </div>

              {!order ? (
                <div style={{ marginTop: 12 }}>
                  <SurfaceCard>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>找不到訂單</div>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.62)" }}>訂單可能已被清除</div>
                  </SurfaceCard>
                </div>
              ) : (
                <div className={homeStyles.accountMidGrid}>
                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <SurfaceCard style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <img
                          alt=""
                          src="/cardx/placeholder.svg"
                          style={{ width: 54, height: 54, borderRadius: 16, objectFit: "cover", background: "rgba(0,0,0,0.18)", flex: "0 0 auto" }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {order.title}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                            {new Date(order.createdAt).toLocaleString("zh-TW")}
                          </div>
                        </div>
                      </div>
                      <SecondaryButton href={`/market/${order.refId}`} style={{ height: 36, borderRadius: 12 }}>
                        查看商品
                      </SecondaryButton>
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gap: 8 }}>
                        {timeline.map((t) => (
                          <div key={t.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: t.active ? "rgba(255,255,255,0.86)" : "rgba(255,255,255,0.48)" }}>
                              {t.label}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>
                              {t.at ? new Date(t.at).toLocaleString("zh-TW") : "-"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      {order.shipment ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>
                            {order.shipment.carrier} · {order.shipment.trackingNo}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.62)" }}>狀態：{order.shipment.status}</div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.58)" }}>尚未建立物流資訊</div>
                      )}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <SecondaryButton
                          onClick={markShipped}
                          disabled={order.status !== "paid" && order.status !== "packing"}
                          style={{ height: 36, borderRadius: 12, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.86)" }}
                        >
                          模擬賣家出貨
                        </SecondaryButton>
                        <SecondaryButton
                          onClick={markDelivered}
                          disabled={order.status !== "shipped"}
                          style={{ height: 36, borderRadius: 12, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.86)" }}
                        >
                          模擬送達
                        </SecondaryButton>
                        <Button3D
                          color="blue"
                          onClick={markCompleted}
                          disabled={order.status !== "delivered"}
                          style={{ height: 36, borderRadius: 12, opacity: order.status === "delivered" ? 1 : 0.6 }}
                        >
                          確認收貨
                        </Button3D>
                      </div>
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <SecondaryButton
                          onClick={cancelOrder}
                          disabled={order.status !== "created" && order.status !== "payment_pending"}
                          style={{ height: 36, borderRadius: 12 }}
                        >
                          取消訂單
                        </SecondaryButton>
                        <SecondaryButton
                          onClick={requestRefund}
                          disabled={order.status !== "paid" && order.status !== "packing" && order.status !== "shipped"}
                          style={{ height: 36, borderRadius: 12 }}
                        >
                          申請退款
                        </SecondaryButton>
                        <SecondaryButton
                          onClick={openDispute}
                          disabled={order.status === "completed" || order.status === "canceled" || order.status === "refunded"}
                          style={{ height: 36, borderRadius: 12 }}
                        >
                          發起爭議
                        </SecondaryButton>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.62)", lineHeight: "18px" }}>
                        退款或爭議送出後，平台會暫停放款並進入處理流程。
                      </div>
                    </SurfaceCard>
                  </div>

                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <KeyValueRow label="商品小計" value={twd(order.amountSubtotal)} />
                      <KeyValueRow label="運費" value={twd(order.shippingFee)} />
                      <KeyValueRow label="平台服務費" value={twd(order.platformFee)} />
                      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginTop: 2, marginBottom: 2 }} />
                      <KeyValueRow label={<span style={{ fontWeight: 950, color: "rgba(255,255,255,0.74)" }}>總額</span>} value={<span style={{ fontSize: 16 }}>{twd(order.totalAmount)}</span>} />
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>
                        {order.addressSnapshot.name} · {order.addressSnapshot.phone}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.70)" }}>{order.addressSnapshot.addressLine}</div>
                    </SurfaceCard>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
