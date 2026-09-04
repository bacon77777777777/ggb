"use client";

/*
 * 配送訂單詳情（桌機版）
 *
 * 讀真的 `orders` 與底下的 `draw_records`。進度條與狀態文案走 `lib/orderStatus`
 * ＋ `components/warehouse/DeliverySteps`，跟手機版同一份，同一張單不會兩個說法。
 *
 * ⚠️ 前台不可以直接 update 訂單狀態 —— 訂單狀態由後台與物流回呼寫。
 * 原本這頁有「模擬賣家出貨 / 模擬送達 / 確認收貨 / 申請退款 / 發起爭議」五顆按鈕，
 * 全部是 `orders.update({ status: ... })`，而且寫的是我們沒有的狀態值。
 * 只留下真的有 RPC 撐著的那一個動作：取消配送申請（cancel_my_delivery_order）。
 * 退款與爭議沒有對應的後端流程，按鈕直接拿掉，不做「按了沒事」的假動作。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, KeyValueRow, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { BouncingCapsule } from "@/components/ui/BouncingCapsule";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { DeliverySteps } from "@/components/warehouse/DeliverySteps";
import { normalizeOrderStatus, orderStatusConfig } from "@/lib/orderStatus";

type OrderItem = { id: string; name: string; grade: string; productName: string; image: string | null };

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: number;
  shippedAt: number | null;
  tracking: string | null;
  shippingFee: number;
  logisticsType: string;
  methodLabel: string;
  storeName: string | null;
  note: string | null;
  supplierName: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  items: OrderItem[];
};

function SectionLoading() {
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 14, padding: "56px 0" }}>
      <BouncingCapsule size={40} />
      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.2em", color: "#9ca3af" }}>載入中</span>
    </div>
  );
}

function UiIcon({ href, size = 18, opacity = 0.92, flip = false }: { href: string; size?: number; opacity?: number; flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ opacity, transform: flip ? "rotate(180deg)" : undefined }}>
      <use href={href} />
    </svg>
  );
}

function toneOf(status: string): "muted" | "success" | "danger" | "info" {
  const s = normalizeOrderStatus(status);
  if (s === "delivered") return "success";
  if (s === "cancelled") return "danger";
  return "info";
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) {
      setOrder(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id, order_number, status, created_at, shipped_at, tracking_number, shipping_fee,
        logistics_type, store_name, note, recipient_name, recipient_phone, address,
        suppliers ( name ),
        draw_records (
          id, prize_name, prize_level,
          product_prizes ( level, name, image_url ),
          products ( name, suppliers ( name ) )
        )
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      setOrder(null);
      setLoading(false);
      return;
    }

    const row = data as unknown as Record<string, unknown>;
    const records = Array.isArray(row.draw_records) ? (row.draw_records as Array<Record<string, unknown>>) : [];
    const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();
    const shippedAt = row.shipped_at ? new Date(String(row.shipped_at)).getTime() : null;
    const logisticsType = String(row.logistics_type ?? "HOME");
    const supplier = row.suppliers as { name?: string } | null | undefined;

    const items: OrderItem[] = records.map((r) => {
      const prize = r.product_prizes as { level?: string; name?: string; image_url?: string } | null | undefined;
      const product = r.products as { name?: string } | null | undefined;
      return {
        id: String(r.id),
        name: String(prize?.name ?? r.prize_name ?? "獎品"),
        grade: String(prize?.level ?? r.prize_level ?? ""),
        productName: String(product?.name ?? ""),
        image: prize?.image_url ? String(prize.image_url) : null,
      };
    });

    const fallbackSupplier = Array.from(
      new Set(
        records
          .map((r) => (r.products as { suppliers?: { name?: string } } | null | undefined)?.suppliers?.name)
          .filter((n): n is string => !!n)
      )
    );

    setOrder({
      id: String(row.id),
      orderNumber: String(row.order_number ?? row.id),
      status: String(row.status ?? "submitted"),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      shippedAt: shippedAt && Number.isFinite(shippedAt) ? shippedAt : null,
      tracking: row.tracking_number ? String(row.tracking_number) : null,
      shippingFee: Number(row.shipping_fee ?? 0),
      logisticsType,
      methodLabel: logisticsType === "CVS" ? "超商取貨" : "宅配到府",
      storeName: row.store_name ? String(row.store_name) : null,
      note: row.note ? String(row.note) : null,
      supplierName: supplier?.name ?? (fallbackSupplier.length ? fallbackSupplier.join("、") : "—"),
      recipientName: String(row.recipient_name ?? ""),
      recipientPhone: String(row.recipient_phone ?? ""),
      address: String(row.address ?? ""),
      items,
    });
    setLoading(false);
  }, [id, supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  /** 只有「已申請、還沒開物流單」的訂單能取消；能不能真的取消由 DB 說了算 */
  const canCancel = useMemo(
    () => !!order && normalizeOrderStatus(order.status) === "submitted" && !order.tracking,
    [order]
  );

  async function cancelOrder() {
    if (!order) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc("cancel_my_delivery_order", { p_order_id: Number(order.id) });
      if (error) throw error;
      const refunded = Number((data as { refunded?: number } | null)?.refunded ?? 0);
      setMsg({ tone: "ok", text: refunded > 0 ? `已取消，退回 ${refunded} G` : "已取消，獎品已放回你的倉庫" });
      setConfirmCancel(false);
      await load();
    } catch (e) {
      const text = String((e as { message?: string })?.message ?? "");
      if (text.includes("ALREADY_PROCESSING")) setMsg({ tone: "err", text: "這筆訂單已經在出貨流程中，請聯繫客服協助" });
      else if (text.includes("ORDER_NOT_FOUND")) setMsg({ tone: "err", text: "找不到這筆訂單" });
      else setMsg({ tone: "err", text: "取消失敗，請稍後再試" });
    } finally {
      setBusy(false);
    }
  }

  const cfg = order ? orderStatusConfig(order.status) : null;
  const cancelled = order ? normalizeOrderStatus(order.status) === "cancelled" : false;

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <div className={homeStyles.accountContainer}>
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => router.push("/orders")}
                    aria-label="返回配送訂單"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      border: 0,
                      background: "#f3f4f6",
                      color: "#111827",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      flex: "0 0 auto",
                    }}
                  >
                    <UiIcon href="#icon-chevron-right" size={18} opacity={0.85} flip />
                  </button>
                  <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {order ? `訂單編號 ${order.orderNumber}` : "配送訂單"}
                  </div>
                </div>
                {cfg ? <Pill tone={toneOf(order!.status)}>{cfg.label}</Pill> : null}
              </div>

              {authLoading || loading ? (
                <SectionLoading />
              ) : !user ? (
                <div style={{ marginTop: 12 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>登入後才看得到這筆訂單</div>
                    <Button3D color="blue" href="/login" style={{ height: 40, borderRadius: 12 }}>
                      前往登入
                    </Button3D>
                  </SurfaceCard>
                </div>
              ) : !order ? (
                <div style={{ marginTop: 12 }}>
                  <SurfaceCard>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>找不到這筆訂單</div>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                      可能不是你的訂單，或是連結貼錯了。
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <SecondaryButton href="/orders" style={{ height: 36, borderRadius: 12 }}>
                        回配送訂單
                      </SecondaryButton>
                    </div>
                  </SurfaceCard>
                </div>
              ) : (
                <div className={homeStyles.accountMidGrid}>
                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    {msg ? (
                      <SurfaceCard
                        style={{
                          borderRadius: 14,
                          padding: "10px 12px",
                          background: msg.tone === "ok" ? "rgba(16,185,129,0.10)" : "rgba(220,38,38,0.08)",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 900, color: msg.tone === "ok" ? "#047857" : "#dc2626" }}>{msg.text}</div>
                      </SurfaceCard>
                    ) : null}

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>配送進度</div>
                      {cancelled ? (
                        <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>
                          這筆申請已經取消，獎品已經放回你的倉庫，隨時可以重新申請寄送。
                        </div>
                      ) : (
                        <DeliverySteps status={order.status} />
                      )}
                      <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                        <KeyValueRow label="申請時間" value={new Date(order.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} />
                        {order.shippedAt ? (
                          <KeyValueRow label="出貨時間" value={new Date(order.shippedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} />
                        ) : null}
                        <KeyValueRow label="物流單號" value={order.tracking ?? "尚未開單"} />
                      </div>
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>這批獎品</div>
                        <Pill tone="muted">{order.items.length} 件</Pill>
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {order.items.map((it) => (
                          <div
                            key={it.id}
                            style={{ borderRadius: 14, background: "#f3f4f6", padding: 10, display: "flex", alignItems: "center", gap: 10 }}
                          >
                            <img
                              alt=""
                              src={it.image ?? "/cardx/placeholder.svg"}
                              style={{ width: 46, height: 46, borderRadius: 12, objectFit: "contain", background: "#ffffff", flex: "0 0 auto" }}
                            />
                            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <GradeBadge grade={it.grade} size="sm" />
                                <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {it.name}
                                </div>
                              </div>
                              {it.productName ? (
                                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {it.productName}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SurfaceCard>

                    {canCancel ? (
                      <SurfaceCard style={{ display: "grid", gap: 10 }}>
                        {confirmCancel ? (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 850, color: "#374151", lineHeight: "20px" }}>
                              取消之後，這 {order.items.length} 件獎品會放回你的倉庫，
                              {order.shippingFee > 0 ? `申請時扣掉的 ${order.shippingFee} G 會退回。` : "申請時扣掉的代幣會退回。"}
                              之後隨時可以重新申請寄送。
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <SecondaryButton
                                onClick={() => void cancelOrder()}
                                disabled={busy}
                                style={{ height: 36, borderRadius: 12, background: "rgba(220,38,38,0.12)", color: "#dc2626" }}
                              >
                                {busy ? "取消中…" : "確定取消"}
                              </SecondaryButton>
                              <SecondaryButton onClick={() => setConfirmCancel(false)} disabled={busy} style={{ height: 36, borderRadius: 12 }}>
                                先不要
                              </SecondaryButton>
                            </div>
                          </>
                        ) : (
                          <SecondaryButton
                            onClick={() => setConfirmCancel(true)}
                            style={{ height: 36, borderRadius: 12, background: "rgba(220,38,38,0.12)", color: "#dc2626" }}
                          >
                            取消配送申請
                          </SecondaryButton>
                        )}
                      </SurfaceCard>
                    ) : null}
                  </div>

                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>寄送方式</div>
                      <KeyValueRow label="配送方式" value={order.methodLabel} />
                      {order.storeName ? <KeyValueRow label="取貨門市" value={order.storeName} /> : null}
                      <KeyValueRow label="運費" value={order.shippingFee > 0 ? `${order.shippingFee} G` : "免運"} />
                      <KeyValueRow label="出貨廠商" value={order.supplierName} />
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>收件資訊</div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                        {order.recipientName} · {order.recipientPhone}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>{order.address}</div>
                      {order.note ? (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>備註：{order.note}</div>
                      ) : null}
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
