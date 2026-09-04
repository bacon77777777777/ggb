"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { supabaseBrowser } from "@/cardx/lib/supabase/browser";
import { makePackDetail } from "@/cardx/lib/packs";
import { Button3D, KeyValueRow, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";

type Opening = {
  id: string;
  kind: "pack";
  packId: string;
  title: string;
  imageUrl: string;
  amountSubtotal: number;
  shippingFee: number;
  platformFee: number;
  totalAmount: number;
  currency: "TWD";
  status: "payment_pending" | "paid" | "opened" | "packing" | "shipped" | "delivered" | "completed" | "canceled";
  createdAt: number;
  addressSnapshot: { name: string; phone: string; addressLine: string };
  prize: { name: string; imageUrl: string; rarity: string };
  shipment?: { carrier: string; trackingNo: string; status: "created" | "shipped" | "delivered" };
};

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

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const PACK_FEE_RATE = 0.1;
const DEFAULT_SHIPPING_FEE = 60;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function twd(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Math.round(n));
}

function statusLabel(status: Opening["status"]) {
  if (status === "opened") return "已開抽";
  if (status === "packing") return "備貨中";
  if (status === "shipped") return "已出貨";
  if (status === "delivered") return "已送達";
  if (status === "completed") return "已完成";
  if (status === "canceled") return "已取消";
  if (status === "payment_pending") return "待出貨";
  return "處理中";
}

function statusTone(status: Opening["status"]): "muted" | "success" | "danger" | "info" {
  if (status === "completed") return "success";
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

export default function OpeningDetailPage() {
  return (
    <Suspense fallback={null}>
      <OpeningDetailInner />
    </Suspense>
  );
}

function OpeningDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const [revealing, setRevealing] = useState(isNew);

  useEffect(() => {
    if (!isNew) return;
    const t = window.setTimeout(() => setRevealing(false), 1900);
    return () => window.clearTimeout(t);
  }, [isNew]);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);

  const [opening, setOpening] = useState<Opening | null>(null);

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
  const activeTab = useMemo(() => tabs.find((t) => t.key === "openings") ?? tabs[0]!, [tabs]);

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
      const list = readJson<Opening[]>(OPENINGS_KEY, []);
      const hit = list.find((x) => x.id === id) ?? null;
      setOpening(hit);
    }

    async function sync() {
      if (!alive) return;
      if (!id) {
        setOpening(null);
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
          .from("openings")
          .select("id, pack_id, status, created_at, items, shipping, address_id")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!row) {
          setOpening(null);
          return;
        }

        const packId = String(row.pack_id ?? "");
        const pack = packId ? makePackDetail(packId) : null;
        const amountSubtotal = pack?.price ?? 0;
        const platformFee = Math.ceil(amountSubtotal * PACK_FEE_RATE);
        const shippingFee = DEFAULT_SHIPPING_FEE;
        const totalAmount = amountSubtotal + platformFee + shippingFee;

        const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();
        const shipping = row.shipping && typeof row.shipping === "object" ? (row.shipping as Record<string, unknown>) : {};
        const items = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : [];
        const prize =
          items.length > 0
            ? { name: String(items[0]?.name ?? ""), imageUrl: String(items[0]?.imageUrl ?? ""), rarity: String(items[0]?.rarity ?? "") }
            : { name: "", imageUrl: "", rarity: "" };

        let addressSnapshot: Opening["addressSnapshot"] = { name: "", phone: "", addressLine: "" };
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

        const mapped: Opening = {
          id: String(row.id),
          kind: "pack",
          packId,
          title: pack?.title ?? `卡包 ${packId || String(row.id)}`,
          imageUrl: pack?.imageUrl ?? "/cardx/placeholder.svg",
          amountSubtotal,
          shippingFee,
          platformFee,
          totalAmount,
          currency: "TWD",
          status: String(row.status ?? "opened") as Opening["status"],
          createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
          addressSnapshot,
          prize,
          shipment:
            typeof shipping.trackingNo === "string" || typeof shipping.tracking_no === "string"
              ? {
                  carrier: String((shipping.carrier as string) ?? "newebpay-logistics"),
                  trackingNo: String((shipping.trackingNo as string) ?? (shipping.tracking_no as string) ?? ""),
                  status: String((shipping.status as string) ?? "created") as "created" | "shipped" | "delivered",
                }
              : undefined,
        };
        setOpening(mapped);
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

  const canConfirm = useMemo(() => opening?.status === "delivered", [opening?.status]);

  function markDelivered() {
    if (!opening) return;
    const supabase = supabaseBrowser();
    if (supabase && isUuid(opening.id)) {
      void (async () => {
        const nextShipment = opening.shipment ? { ...opening.shipment, status: "delivered" as const } : opening.shipment;
        const patch = nextShipment ? { carrier: nextShipment.carrier, trackingNo: nextShipment.trackingNo, status: nextShipment.status } : {};
        const { error } = await supabase.from("openings").update({ status: "delivered", shipping: patch }).eq("id", opening.id);
        if (error) return;
        setOpening((prev) => (prev ? { ...prev, status: "delivered", shipment: nextShipment } : prev));
      })();
      return;
    }
    const list = readJson<Opening[]>(OPENINGS_KEY, []);
    const idx = list.findIndex((x) => x.id === opening.id);
    if (idx < 0) return;
    const next: Opening = { ...opening, status: "delivered", shipment: opening.shipment ? { ...opening.shipment, status: "delivered" } : opening.shipment };
    const nextList = [...list];
    nextList[idx] = next;
    writeJson(OPENINGS_KEY, nextList);
    setOpening(next);
  }

  function confirmCompleted() {
    if (!opening) return;
    const supabase = supabaseBrowser();
    if (supabase && isUuid(opening.id)) {
      void (async () => {
        const { error } = await supabase.from("openings").update({ status: "completed" }).eq("id", opening.id);
        if (error) return;
        setOpening((prev) => (prev ? { ...prev, status: "completed" } : prev));
      })();
      return;
    }
    const list = readJson<Opening[]>(OPENINGS_KEY, []);
    const idx = list.findIndex((x) => x.id === opening.id);
    if (idx < 0) return;
    const next: Opening = { ...opening, status: "completed" };
    const nextList = [...list];
    nextList[idx] = next;
    writeJson(OPENINGS_KEY, nextList);
    setOpening(next);
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

              <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => router.push("/account?tab=openings")}
                    aria-label="返回"
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
                    <UiIcon href="#icon-chevron-left" size={18} opacity={0.85} />
                  </button>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 950,
                      color: "#111827",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {id}
                  </div>
                </div>
                {opening ? <Pill tone={statusTone(opening.status)}>{statusLabel(opening.status)}</Pill> : null}
              </div>

              {!opening ? (
                <div style={{ marginTop: 12 }}>
                  <SurfaceCard>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>找不到卡包紀錄</div>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>紀錄可能已被清除</div>
                  </SurfaceCard>
                </div>
              ) : revealing ? (
                <div style={{ marginTop: 12, display: "grid", justifyItems: "center", gap: 16, padding: "40px 0 56px" }}>
                  <style>
                    {`
                      @keyframes cardxRevealFlip {
                        0% { transform: rotateY(0deg); }
                        100% { transform: rotateY(180deg); }
                      }
                      @keyframes cardxRevealFade {
                        from { opacity: 0; transform: translateY(6px); }
                        to { opacity: 1; transform: translateY(0); }
                      }
                    `}
                  </style>
                  <div style={{ perspective: 900 }}>
                    <div
                      style={{
                        position: "relative",
                        width: 180,
                        height: 252,
                        transformStyle: "preserve-3d",
                        animation: "cardxRevealFlip 1s ease-in-out 0.25s forwards",
                      }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: 16,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "linear-gradient(160deg, rgba(120,126,138,0.9), rgba(70,76,88,0.95))",
                          display: "grid",
                          placeItems: "center",
                          backfaceVisibility: "hidden",
                          color: "#e5e7eb",
                          fontSize: 16,
                          fontWeight: 950,
                          letterSpacing: "2px",
                        }}
                      >
                        CardX
                      </div>
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: 16,
                          border: "1px solid #e5e7eb",
                          background: "#ffffff",
                          overflow: "hidden",
                          transform: "rotateY(180deg)",
                          backfaceVisibility: "hidden",
                          display: "grid",
                          gridTemplateRows: "1fr auto",
                        }}
                      >
                        <img
                          alt=""
                          src={opening.prize.imageUrl || "/cardx/placeholder.svg"}
                          style={{ width: "100%", height: "100%", objectFit: "cover", background: "#f3f4f6" }}
                        />
                        <div style={{ padding: "8px 10px", display: "grid", gap: 4, background: "rgba(0,0,0,0.35)" }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 950,
                              color: "#ffffff",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {opening.prize.name}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,215,120,0.92)" }}>{opening.prize.rarity}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: "#374151",
                      animation: "cardxRevealFade 0.5s ease 1.1s both",
                    }}
                  >
                    恭喜抽中！
                  </div>
                </div>
              ) : (
                <div className={homeStyles.accountMidGrid}>
                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <SurfaceCard style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <img
                          alt=""
                          src={opening.imageUrl}
                          style={{ width: 54, height: 54, borderRadius: 16, objectFit: "cover", background: "#f3f4f6", flex: "0 0 auto" }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {opening.title}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                            {new Date(opening.createdAt).toLocaleString("zh-TW")}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <SecondaryButton href={opening.packId ? `/packs/${opening.packId}` : "/packs"} style={{ height: 36, borderRadius: 12 }}>
                          查看卡包
                        </SecondaryButton>
                        <SecondaryButton
                          href={opening.packId ? `/packs/${opening.packId}` : "/packs"}
                          style={{ height: 36, borderRadius: 12, background: "rgba(43,124,255,0.22)", color: "#111827" }}
                        >
                          再抽一次
                        </SecondaryButton>
                      </div>
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ borderRadius: 16, background: "#f3f4f6", padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          <img
                            alt=""
                            src={opening.prize.imageUrl}
                            style={{ width: 46, height: 46, borderRadius: 14, objectFit: "cover", background: "#f3f4f6", flex: "0 0 auto" }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {opening.prize.name}
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <Pill tone="muted">{opening.prize.rarity}</Pill>
                            </div>
                          </div>
                        </div>
                      </div>
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      {opening.shipment ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                            {opening.shipment.carrier} · {opening.shipment.trackingNo}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>狀態：{opening.shipment.status}</div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>尚未建立物流資訊</div>
                      )}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <SecondaryButton
                          onClick={markDelivered}
                          disabled={opening.status !== "shipped"}
                          style={{ height: 36, borderRadius: 12, background: "#f3f4f6", color: "#111827" }}
                        >
                          模擬送達
                        </SecondaryButton>
                        <Button3D
                          color="blue"
                          onClick={confirmCompleted}
                          disabled={!canConfirm}
                          style={{ height: 36, borderRadius: 12, opacity: canConfirm ? 1 : 0.6 }}
                        >
                          確認收貨
                        </Button3D>
                      </div>
                    </SurfaceCard>
                  </div>

                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <KeyValueRow label="開抽小計" value={twd(opening.amountSubtotal)} />
                      <KeyValueRow label="運費" value={twd(opening.shippingFee)} />
                      <KeyValueRow label="平台服務費" value={twd(opening.platformFee)} />
                      <div style={{ height: 1, background: "#e5e7eb", marginTop: 2, marginBottom: 2 }} />
                      <KeyValueRow label={<span style={{ fontWeight: 950, color: "#374151" }}>總額</span>} value={<span style={{ fontSize: 16 }}>{twd(opening.totalAmount)}</span>} />
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                        {opening.addressSnapshot.name} · {opening.addressSnapshot.phone}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>{opening.addressSnapshot.addressLine}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>卡包開抽後將依地址寄送獎品。</div>
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
