// @ts-nocheck — cardx 原型照搬（老闆 2026-09-04），型別不補
"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { supabaseBrowser } from "@/cardx/lib/supabase/browser";
import { mockMarketListings, mockPacks } from "@/cardx/lib/mock/home";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard, SurfaceRowLink } from "@/cardx/components/ui/Kit";

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
  totalAmount: number;
  currency: "TWD";
  status: OrderStatus;
  createdAt: number;
  shipment?: { carrier: string; trackingNo: string; status: "created" | "shipped" | "delivered" };
};

type Opening = {
  id: string;
  kind: "pack";
  packId: string;
  title: string;
  imageUrl: string;
  totalAmount: number;
  currency: "TWD";
  status: "payment_pending" | "paid" | "opened" | "packing" | "shipped" | "delivered" | "completed" | "canceled";
  createdAt: number;
  prize?: { name: string; imageUrl: string; rarity: string };
  shipment?: { carrier: string; trackingNo: string; status: "created" | "shipped" | "delivered" };
};

const ORDERS_KEY = "cardx.orders.v1";
const OPENINGS_KEY = "cardx.openings.v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function twd(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Math.round(n));
}

const PACK_FEE_RATE = 0.1;
const DEFAULT_SHIPPING_FEE = 60;

function normalizeMarketId(id: string) {
  if (!id.startsWith("listing_")) return id;
  const parts = id.split("_");
  if (parts.length >= 2) return `${parts[0]}_${parts[1]}`;
  return id;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function statusLabel(status: string) {
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
  if (status === "opened") return "已開抽";
  if (status === "payment_pending") return "待付款";
  return "處理中";
}

function statusTone(status: string): "muted" | "success" | "danger" | "info" {
  if (status === "completed") return "success";
  if (status === "refunded" || status === "refund_pending" || status === "dispute_open") return "danger";
  if (status === "canceled") return "muted";
  return "info";
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [view, setView] = useState<"all" | "market" | "pack">("all");

  useEffect(() => {
    const supabase = supabaseBrowser();
    const sb = supabase ?? null;
    let alive = true;

    function syncLocal() {
      setOrders(readJson<Order[]>(ORDERS_KEY, []));
      setOpenings(readJson<Opening[]>(OPENINGS_KEY, []));
    }

    async function sync() {
      if (!alive) return;
      if (!sb) {
        syncLocal();
        return;
      }
      try {
        const { data } = await sb.auth.getSession();
        const uid = data.session?.user?.id ?? null;
        if (!alive) return;
        if (!uid) {
          syncLocal();
          return;
        }

        const [ordersRes, openingsRes] = await Promise.all([
          sb
            .from("orders")
            .select("id, ref_id, amount_total, status, created_at, shipping")
            .order("created_at", { ascending: false }),
          sb
            .from("openings")
            .select("id, pack_id, status, created_at, items, shipping")
            .order("created_at", { ascending: false }),
        ]);
        if (ordersRes.error) throw ordersRes.error;
        if (openingsRes.error) throw openingsRes.error;

        const remoteOrders: Order[] =
          ordersRes.data?.map((r) => {
            const refId = normalizeMarketId(String(r.ref_id ?? ""));
            const listing = mockMarketListings.find((x) => x.id === refId) ?? null;
            const shipping = r.shipping && typeof r.shipping === "object" ? (r.shipping as Record<string, unknown>) : {};
            const createdAt = r.created_at ? new Date(String(r.created_at)).getTime() : Date.now();
            return {
              id: String(r.id),
              kind: "market",
              refId,
              title: listing?.title ?? `訂單 ${refId || String(r.id)}`,
              imageUrl: "/cardx/placeholder.svg",
              totalAmount: Number(r.amount_total ?? 0),
              currency: "TWD",
              status: String(r.status ?? "paid") as OrderStatus,
              createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
              shipment:
                typeof shipping.trackingNo === "string" || typeof shipping.tracking_no === "string"
                  ? {
                      carrier: String((shipping.carrier as string) ?? "newebpay-logistics"),
                      trackingNo: String((shipping.trackingNo as string) ?? (shipping.tracking_no as string) ?? ""),
                      status: String((shipping.status as string) ?? "created") as "created" | "shipped" | "delivered",
                    }
                  : undefined,
            };
          }) ?? [];

        const remoteOpenings: Opening[] =
          openingsRes.data?.map((r) => {
            const packId = String(r.pack_id ?? "");
            const pack = mockPacks.find((x) => x.id === packId) ?? null;
            const amountSubtotal = pack?.price.amount ?? 0;
            const platformFee = Math.ceil(amountSubtotal * PACK_FEE_RATE);
            const totalAmount = amountSubtotal + platformFee + DEFAULT_SHIPPING_FEE;
            const items = Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : [];
            const prize = items.length
              ? { name: String(items[0]?.name ?? ""), imageUrl: String(items[0]?.imageUrl ?? ""), rarity: String(items[0]?.rarity ?? "") }
              : undefined;
            const shipping = r.shipping && typeof r.shipping === "object" ? (r.shipping as Record<string, unknown>) : {};
            const createdAt = r.created_at ? new Date(String(r.created_at)).getTime() : Date.now();
            return {
              id: String(r.id),
              kind: "pack",
              packId,
              title: pack?.title ?? `卡包 ${packId || String(r.id)}`,
              imageUrl: "/cardx/placeholder.svg",
              totalAmount,
              currency: "TWD",
              status: String(r.status ?? "opened") as Opening["status"],
              createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
              prize: prize?.name ? prize : undefined,
              shipment:
                typeof shipping.trackingNo === "string" || typeof shipping.tracking_no === "string"
                  ? {
                      carrier: String((shipping.carrier as string) ?? "newebpay-logistics"),
                      trackingNo: String((shipping.trackingNo as string) ?? (shipping.tracking_no as string) ?? ""),
                      status: String((shipping.status as string) ?? "created") as "created" | "shipped" | "delivered",
                    }
                  : undefined,
            };
          }) ?? [];

        const localOrders = readJson<Order[]>(ORDERS_KEY, []);
        const localOpenings = readJson<Opening[]>(OPENINGS_KEY, []);

        const mergedOrders = [...remoteOrders, ...localOrders.filter((x) => !isUuid(x.id))].sort((a, b) => b.createdAt - a.createdAt);
        const mergedOpenings = [...remoteOpenings, ...localOpenings.filter((x) => !isUuid(x.id))].sort((a, b) => b.createdAt - a.createdAt);

        setOrders(mergedOrders);
        setOpenings(mergedOpenings);
      } catch {
        syncLocal();
      }
    }

    window.setTimeout(() => void sync(), 0);
    function onStorage(e: StorageEvent) {
      if (e.key !== ORDERS_KEY && e.key !== OPENINGS_KEY) return;
      void sync();
    }
    function onFocus() {
      void sync();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    const authSub = sb?.auth.onAuthStateChange(() => {
      void sync();
    });
    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      authSub?.data.subscription.unsubscribe();
    };
  }, []);

  const hasAny = orders.length > 0 || openings.length > 0;

  const headerRight = useMemo(() => {
    if (!hasAny) return null;
    const total = orders.length + openings.length;
    return (
      <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>
        共 {total.toLocaleString()} 筆
      </div>
    );
  }, [hasAny, openings.length, orders.length]);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="訂單" right={headerRight} />

            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setView("all")}
                    style={{
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <Pill tone={view === "all" ? "info" : "muted"}>全部</Pill>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("market")}
                    style={{
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <Pill tone={view === "market" ? "info" : "muted"}>市集訂單 {orders.length}</Pill>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("pack")}
                    style={{
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <Pill tone={view === "pack" ? "info" : "muted"}>卡包開抽 {openings.length}</Pill>
                  </button>
                </div>
                <SecondaryButton href="/account" style={{ height: 34, borderRadius: 12 }}>
                  前往帳戶
                </SecondaryButton>
              </div>

                {!hasAny ? (
                <SurfaceCard>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>尚無訂單</div>
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.62)" }}>
                    先到市集或卡包完成一次交易，就會出現在這裡
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Button3D color="blue" href="/market" style={{ height: 38, borderRadius: 12 }}>
                      前往市集
                    </Button3D>
                    <Button3D color="green" href="/packs" style={{ height: 38, borderRadius: 12 }}>
                      前往卡包
                    </Button3D>
                  </div>
                </SurfaceCard>
                ) : (
                <div style={{ display: "grid", gap: 12 }}>
                {orders.length && (view === "all" || view === "market") ? (
                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>市集訂單</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {orders.map((o) => (
                        <SurfaceRowLink key={o.id} href={`/orders/${o.id}`}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {o.title}
                            </div>
                            <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <Pill tone={statusTone(o.status)}>{statusLabel(o.status)}</Pill>
                              <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                                {new Date(o.createdAt).toLocaleString("zh-TW")}
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{twd(o.totalAmount)}</div>
                            {o.shipment?.trackingNo ? (
                              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.58)" }}>{o.shipment.trackingNo}</div>
                            ) : null}
                          </div>
                        </SurfaceRowLink>
                      ))}
                    </div>
                  </SurfaceCard>
                ) : null}

                {openings.length && (view === "all" || view === "pack") ? (
                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>卡包開抽</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {openings.map((o) => (
                        <SurfaceRowLink key={o.id} href={`/openings/${o.id}`}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {o.title}
                            </div>
                            <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <Pill tone={statusTone(o.status)}>{statusLabel(o.status)}</Pill>
                              <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                                {new Date(o.createdAt).toLocaleString("zh-TW")}
                              </span>
                            </div>
                            {o.prize?.name ? (
                              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.70)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                得獎：{o.prize.name}
                              </div>
                            ) : null}
                          </div>
                          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{twd(o.totalAmount)}</div>
                            {o.shipment?.trackingNo ? (
                              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.58)" }}>{o.shipment.trackingNo}</div>
                            ) : null}
                          </div>
                        </SurfaceRowLink>
                      ))}
                    </div>
                  </SurfaceCard>
                ) : null}
              </div>
                )}
              </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
