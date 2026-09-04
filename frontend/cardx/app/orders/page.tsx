"use client";

/*
 * 配送訂單列表（桌機版）
 *
 * 吉吉比只有一種訂單：把倉庫裡的獎品申請寄出。原本這頁畫的是 cardx 原型的
 * 「市集訂單 + 卡包開抽」，狀態值（shipped / refund_pending / dispute_open / canceled）
 * 我們資料庫一個都沒有，`openings` 那張表也不存在 —— 整頁其實只讀得到 localStorage。
 *
 * 現在讀真的 `orders`，狀態文案／顏色／頁籤全部走 `lib/orderStatus`，
 * 跟手機版會員頁的配送分頁講同一套話。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard, SurfaceRowLink } from "@/cardx/components/ui/Kit";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { BouncingCapsule } from "@/components/ui/BouncingCapsule";
import {
  DELIVERY_TABS,
  type DeliveryTabId,
  matchesDeliveryTab,
  normalizeOrderStatus,
  orderStatusConfig,
} from "@/lib/orderStatus";

/** 配送訂單的狀態；儲值訂單（pending / paid / failed）不在這裡 */
const DELIVERY_STATUSES = ["submitted", "processing", "picked_up", "shipping", "delivered", "cancelled", "completed"];

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: number;
  itemCount: number;
  firstItem: string;
  tracking: string | null;
  shippingFee: number;
  method: string;
};

function SectionLoading() {
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 14, padding: "56px 0" }}>
      <BouncingCapsule size={40} />
      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.2em", color: "#9ca3af" }}>載入中</span>
    </div>
  );
}

function toneOf(status: string): "muted" | "success" | "danger" | "info" {
  const s = normalizeOrderStatus(status);
  if (s === "delivered") return "success";
  if (s === "cancelled") return "danger";
  return "info";
}

export default function OrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DeliveryTabId>("all");

  const load = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        created_at,
        tracking_number,
        shipping_fee,
        logistics_type,
        draw_records ( id, prize_name, product_prizes ( name ) )
      `)
      .eq("user_id", user.id)
      .in("status", DELIVERY_STATUSES)
      .order("created_at", { ascending: false });

    if (error) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const rows: OrderRow[] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((o) => {
      const records = Array.isArray(o.draw_records) ? (o.draw_records as Array<Record<string, unknown>>) : [];
      const first = records[0];
      const prize = first?.product_prizes as { name?: string } | null | undefined;
      const createdAt = o.created_at ? new Date(String(o.created_at)).getTime() : Date.now();
      return {
        id: String(o.id),
        orderNumber: String(o.order_number ?? o.id),
        status: String(o.status ?? "submitted"),
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        itemCount: records.length,
        firstItem: String(prize?.name ?? first?.prize_name ?? ""),
        tracking: o.tracking_number ? String(o.tracking_number) : null,
        shippingFee: Number(o.shipping_fee ?? 0),
        method: String(o.logistics_type ?? "HOME") === "CVS" ? "超商取貨" : "宅配到府",
      };
    });
    setOrders(rows);
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const counts = useMemo(() => {
    const m = new Map<DeliveryTabId, number>();
    for (const t of DELIVERY_TABS) m.set(t.id, orders.filter((o) => matchesDeliveryTab(t.id, o.status)).length);
    return m;
  }, [orders]);

  const visible = useMemo(() => orders.filter((o) => matchesDeliveryTab(tab, o.status)), [orders, tab]);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader
              title="配送訂單"
              subtitle="你從倉庫申請寄出的獎品都在這裡"
              right={
                orders.length ? (
                  <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280", whiteSpace: "nowrap" }}>
                    共 {orders.length.toLocaleString()} 筆
                  </div>
                ) : null
              }
            />

            <div className={homeStyles.accountContainer}>
              {authLoading || loading ? (
                <SectionLoading />
              ) : !user ? (
                <div style={{ marginTop: 14 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>登入後才看得到你的配送訂單</div>
                    <Button3D color="blue" href="/login" style={{ height: 40, borderRadius: 12 }}>
                      前往登入
                    </Button3D>
                  </SurfaceCard>
                </div>
              ) : (
                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {DELIVERY_TABS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTab(t.id)}
                          style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}
                        >
                          <Pill tone={tab === t.id ? "info" : "muted"}>
                            {t.label} {counts.get(t.id) ?? 0}
                          </Pill>
                        </button>
                      ))}
                    </div>
                    <SecondaryButton href="/account" style={{ height: 34, borderRadius: 12 }}>
                      回會員中心
                    </SecondaryButton>
                  </div>

                  {!orders.length ? (
                    <SurfaceCard>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>還沒有配送訂單</div>
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                        抽到的獎品會先進倉庫，想拿實體的時候再從倉庫申請寄送。
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <Button3D color="blue" href="/checkout" style={{ height: 38, borderRadius: 12 }}>
                          申請寄送
                        </Button3D>
                        <SecondaryButton href="/" style={{ height: 38, borderRadius: 12 }}>
                          去逛逛
                        </SecondaryButton>
                      </div>
                    </SurfaceCard>
                  ) : !visible.length ? (
                    <SurfaceCard>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>這個狀態底下沒有訂單</div>
                    </SurfaceCard>
                  ) : (
                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gap: 10 }}>
                        {visible.map((o) => {
                          const cfg = orderStatusConfig(o.status);
                          return (
                            <SurfaceRowLink key={o.id} href={`/orders/${o.id}`}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {o.firstItem
                                    ? o.itemCount > 1
                                      ? `${o.firstItem} 等 ${o.itemCount} 件`
                                      : o.firstItem
                                    : `${o.itemCount} 件獎品`}
                                </div>
                                <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  <Pill tone={toneOf(o.status)}>{cfg.label}</Pill>
                                  <span style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{o.method}</span>
                                  <span style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>
                                    {new Date(o.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                                  </span>
                                </div>
                              </div>
                              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>單號 {o.orderNumber}</div>
                                {o.tracking ? (
                                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>物流 {o.tracking}</div>
                                ) : null}
                              </div>
                            </SurfaceRowLink>
                          );
                        })}
                      </div>
                    </SurfaceCard>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
