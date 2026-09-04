"use client";

/*
 * 抽獎紀錄詳情（桌機版）
 *
 * 原本這頁叫「卡包開抽」，讀的是 `openings` —— 那張表在我們的資料庫不存在，
 * 所以它一直只讀得到 localStorage，還附了兩顆會直接改訂單狀態的按鈕
 * （模擬送達／確認收貨），那是前台不該做的事，已經移除。
 *
 * 對應到的真實資料是 `draw_records`：一次抽獎＝一筆，含籤號、賞等、抽中的品項、
 * 花掉的 G 幣，以及公平性驗證用的雜湊。獎品在倉庫裡的去向（還在倉庫／已申請寄送／
 * 已上架／已回收）也一起顯示。
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
import { WarehouseItemDetailModal, type WarehouseItem } from "@/components/warehouse/WarehouseItemDetailModal";

type DrawRecord = {
  id: string;
  productId: string | null;
  productType: string;
  productName: string;
  productImage: string | null;
  prizeName: string;
  prizeGrade: string;
  prizeImage: string | null;
  ticketNo: string;
  createdAt: number;
  status: string;
  tokensSpent: number;
  txidHash: string | null;
  orderId: string | null;
  recycleValue: number;
};

const STATUS_TEXT: Record<string, { label: string; tone: "muted" | "success" | "danger" | "info" }> = {
  in_warehouse: { label: "在倉庫裡", tone: "success" },
  pending_delivery: { label: "已申請寄送", tone: "info" },
  shipped: { label: "已寄出", tone: "info" },
  delivered: { label: "已送達", tone: "success" },
  listing: { label: "上架中", tone: "info" },
  sold: { label: "已售出", tone: "muted" },
  dismantled: { label: "已回收", tone: "muted" },
};

function statusOf(status: string) {
  return STATUS_TEXT[status] ?? { label: "處理中", tone: "muted" as const };
}

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

export default function DrawRecordDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [record, setRecord] = useState<DrawRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) {
      setRecord(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("draw_records")
      .select(`
        id, product_id, ticket_number, created_at, status, prize_level, prize_name,
        tokens_spent, txid_hash, order_id,
        product_prizes ( level, name, image_url, recycle_value ),
        products ( id, name, image_url, type )
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      setRecord(null);
      setLoading(false);
      return;
    }

    const row = data as unknown as Record<string, unknown>;
    const prize = row.product_prizes as { level?: string; name?: string; image_url?: string; recycle_value?: number } | null | undefined;
    const product = row.products as { id?: number | string; name?: string; image_url?: string; type?: string } | null | undefined;
    const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();

    setRecord({
      id: String(row.id),
      productId: product?.id != null ? String(product.id) : row.product_id != null ? String(row.product_id) : null,
      productType: String(product?.type ?? ""),
      productName: String(product?.name ?? "未知商品"),
      productImage: product?.image_url ? String(product.image_url) : null,
      prizeName: String(prize?.name ?? row.prize_name ?? "未知獎品"),
      prizeGrade: String(prize?.level ?? row.prize_level ?? ""),
      prizeImage: prize?.image_url ? String(prize.image_url) : null,
      ticketNo: row.ticket_number != null ? String(row.ticket_number) : "",
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      status: String(row.status ?? ""),
      tokensSpent: Number(row.tokens_spent ?? 0),
      txidHash: row.txid_hash ? String(row.txid_hash) : null,
      orderId: row.order_id != null ? String(row.order_id) : null,
      recycleValue: Number(prize?.recycle_value ?? 0),
    });
    setLoading(false);
  }, [id, supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const modalItem: WarehouseItem | null = useMemo(() => {
    if (!record) return null;
    return {
      id: record.id,
      name: record.prizeName,
      series: record.productName,
      grade: record.prizeGrade,
      status: record.status,
      image: record.prizeImage ?? "",
      date: new Date(record.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
      ticketNo: record.ticketNo,
      recycleValue: record.recycleValue,
    };
  }, [record]);

  /* 商品頁的路徑照類型分（跟 ProductCard 同一套）：盒玩／轉蛋／抽卡各有自己的頁 */
  const productHref = useMemo(() => {
    if (!record?.productId) return null;
    const t = record.productType;
    if (t === "blindbox") return `/blindbox/${record.productId}`;
    if (t === "gacha") return `/gacha/${record.productId}`;
    if (t === "card") return `/card/${record.productId}`;
    return `/item/${record.productId}`;
  }, [record]);

  const st = record ? statusOf(record.status) : null;

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
                    onClick={() => router.push("/account?tab=draws")}
                    aria-label="返回抽獎紀錄"
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
                    抽獎紀錄
                  </div>
                </div>
                {st ? <Pill tone={st.tone}>{st.label}</Pill> : null}
              </div>

              {authLoading || loading ? (
                <SectionLoading />
              ) : !user ? (
                <div style={{ marginTop: 12 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>登入後才看得到這筆紀錄</div>
                    <Button3D color="blue" href="/login" style={{ height: 40, borderRadius: 12 }}>
                      前往登入
                    </Button3D>
                  </SurfaceCard>
                </div>
              ) : !record ? (
                <div style={{ marginTop: 12 }}>
                  <SurfaceCard>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>找不到這筆抽獎紀錄</div>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                      可能不是你的紀錄，或是連結貼錯了。
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <SecondaryButton href="/account?tab=draws" style={{ height: 36, borderRadius: 12 }}>
                        回抽獎紀錄
                      </SecondaryButton>
                    </div>
                  </SurfaceCard>
                </div>
              ) : (
                <div className={homeStyles.accountMidGrid}>
                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <SurfaceCard style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                        <img
                          alt=""
                          src={record.prizeImage ?? "/cardx/placeholder.svg"}
                          style={{ width: 140, height: 140, borderRadius: 18, objectFit: "contain", background: "#f3f4f6", flex: "0 0 auto" }}
                        />
                        <div style={{ minWidth: 0, display: "grid", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <GradeBadge grade={record.prizeGrade} />
                            {record.ticketNo ? <Pill tone="muted">籤號 {record.ticketNo}</Pill> : null}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 950, color: "#111827" }}>{record.prizeName}</div>
                          <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>{record.productName}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                            <SecondaryButton onClick={() => setDetailOpen(true)} style={{ height: 34, borderRadius: 12 }}>
                              獎項詳情
                            </SecondaryButton>
                            {productHref ? (
                              <SecondaryButton href={productHref} style={{ height: 34, borderRadius: 12 }}>
                                再抽一次
                              </SecondaryButton>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </SurfaceCard>

                    {record.status === "in_warehouse" ? (
                      <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>想拿到實體嗎？</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                          這件還在你的倉庫裡，挑好之後付運費就可以寄出。
                        </div>
                        <Button3D color="blue" href={`/checkout?items=${encodeURIComponent(record.id)}`} style={{ height: 38, borderRadius: 12 }}>
                          申請寄送
                        </Button3D>
                      </SurfaceCard>
                    ) : null}

                    {record.orderId ? (
                      <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>這件已經在配送流程裡</div>
                        <SecondaryButton href={`/orders/${record.orderId}`} style={{ height: 36, borderRadius: 12 }}>
                          看配送進度
                        </SecondaryButton>
                      </SurfaceCard>
                    ) : null}
                  </div>

                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>抽獎資訊</div>
                      <KeyValueRow label="抽獎時間" value={new Date(record.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} />
                      {record.ticketNo ? <KeyValueRow label="籤號" value={record.ticketNo} /> : null}
                      <KeyValueRow label="花費" value={record.tokensSpent > 0 ? `${record.tokensSpent} G` : "—"} />
                      <KeyValueRow label="目前狀態" value={statusOf(record.status).label} />
                    </SurfaceCard>

                    {record.txidHash ? (
                      <SurfaceCard style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>公平性驗證碼</div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#374151",
                            wordBreak: "break-all",
                            background: "#f3f4f6",
                            borderRadius: 12,
                            padding: 10,
                          }}
                        >
                          {record.txidHash}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>
                          這串碼在你按下抽獎的那一刻就產生了，之後誰都改不了。
                        </div>
                        <SecondaryButton href="/events/fairness" style={{ height: 34, borderRadius: 12 }}>
                          怎麼驗證
                        </SecondaryButton>
                      </SurfaceCard>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <WarehouseItemDetailModal item={modalItem} isOpen={detailOpen} onClose={() => setDetailOpen(false)} />
    </AppShell>
  );
}
