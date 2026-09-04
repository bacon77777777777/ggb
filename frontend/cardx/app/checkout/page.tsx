// @ts-nocheck — cardx 原型照搬（老闆 2026-09-04），型別不補
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import { mockMarketListings } from "@/cardx/lib/mock/home";
import { makePackDetail } from "@/cardx/lib/packs";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { supabaseBrowser } from "@/cardx/lib/supabase/browser";
import { Button3D, KeyValueRow, PageHeader, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";

type KycStatus = "not_started" | "reviewing" | "approved" | "rejected";
type KycRecord = { status: KycStatus };
type Address = { id: string; name: string; phone: string; addressLine: string; isDefault: boolean };

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

const KYC_KEY = "cardx.kyc.v1";
const ADDRESSES_KEY = "cardx.addresses.v1";
const ORDERS_KEY = "cardx.orders.v1";
const OPENINGS_KEY = "cardx.openings.v1";

const MARKET_FEE_RATE = 0.03;
const PACK_FEE_RATE = 0.1;
const DEFAULT_SHIPPING_FEE = 60;

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

function makeId(prefix: string) {
  const rand = Math.random().toString(16).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function twd(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Math.round(n));
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutPageInner />
    </Suspense>
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function CheckoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kind = (searchParams.get("kind") ?? "market") as "market" | "pack";
  const rawId = searchParams.get("id") ?? "";

  const [kyc, setKyc] = useState<KycRecord>({ status: "not_started" });
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [processing, setProcessing] = useState(false);
  const [payPhase, setPayPhase] = useState<"idle" | "processing">("idle");
  const [userId, setUserId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) {
      window.setTimeout(() => {
        setUserId(null);
        setKyc(readJson<KycRecord>(KYC_KEY, { status: "not_started" }));
        setAddresses(readJson<Address[]>(ADDRESSES_KEY, []));
      }, 0);
      return;
    }
    const sb = supabase;
    let alive = true;

    async function sync() {
      try {
        setErrorMsg(null);
        const { data } = await sb.auth.getSession();
        const uid = data.session?.user?.id ?? null;
        if (!alive) return;
        setUserId(uid);
        if (!uid) {
          setKyc(readJson<KycRecord>(KYC_KEY, { status: "not_started" }));
          setAddresses(readJson<Address[]>(ADDRESSES_KEY, []));
          return;
        }

        const { data: kycRow, error: kycErr } = await sb
          .from("kyc_applications")
          .select("status, payload")
          .eq("user_id", uid)
          .maybeSingle();
        if (kycErr) throw kycErr;
        if (!kycRow) {
          setKyc({ status: "not_started" });
        } else {
          const status: KycStatus =
            kycRow.status === "approved" || kycRow.status === "reviewing" || kycRow.status === "rejected" ? (kycRow.status as KycStatus) : "not_started";
          setKyc({ status });
        }

        const { data: rows, error } = await sb
          .from("addresses")
          .select("id, recipient_name, phone, line1, is_default, updated_at")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        const mapped: Address[] =
          rows?.map((r) => ({
            id: String(r.id),
            name: String(r.recipient_name ?? ""),
            phone: String(r.phone ?? ""),
            addressLine: String(r.line1 ?? ""),
            isDefault: !!r.is_default,
          })) ?? [];
        setAddresses(mapped.filter((x) => x.id && x.name && x.phone && x.addressLine));
      } catch (e) {
        setUserId(null);
        setKyc(readJson<KycRecord>(KYC_KEY, { status: "not_started" }));
        setAddresses(readJson<Address[]>(ADDRESSES_KEY, []));
        setErrorMsg(e instanceof Error ? e.message : "載入失敗");
      }
    }

    window.setTimeout(() => void sync(), 0);
    const { data } = sb.auth.onAuthStateChange(() => {
      void sync();
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function syncLocal() {
      setKyc(readJson<KycRecord>(KYC_KEY, { status: "not_started" }));
      setAddresses(readJson<Address[]>(ADDRESSES_KEY, []));
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== KYC_KEY && e.key !== ADDRESSES_KEY) return;
      syncLocal();
    }
    window.addEventListener("focus", syncLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", syncLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const defaultAddress = useMemo(() => {
    const list = addresses;
    if (!list.length) return null;
    return list.find((a) => a.isDefault) ?? list[0]!;
  }, [addresses]);

  const item = useMemo(() => {
    if (!rawId) return null;
    if (kind === "market") {
      const id = normalizeMarketId(rawId);
      return mockMarketListings.find((x) => x.id === id) ?? null;
    }
    const pack = makePackDetail(rawId);
    return { id: pack.id, title: pack.title, imageUrl: pack.imageUrl, price: pack.priceMoney };
  }, [kind, rawId]);

  const amountSubtotal = item ? item.price.amount : 0;
  const platformFee = Math.ceil(amountSubtotal * (kind === "market" ? MARKET_FEE_RATE : PACK_FEE_RATE));
  const shippingFee = DEFAULT_SHIPPING_FEE;
  const totalAmount = amountSubtotal + platformFee + shippingFee;

  const nextUrl = useMemo(() => {
    if (!rawId) return "/checkout";
    return `/checkout?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(rawId)}`;
  }, [kind, rawId]);

  const needsKyc = kyc.status !== "approved";
  const needsAddress = !defaultAddress;

  if (!rawId) {
    return (
      <AppShell sidebarItems={defaultSidebarItems}>
        <div className={homeStyles.main2}>
          <div className={homeStyles.main}>
            <div className={homeStyles.sectionLobby}>
              <div style={{ marginTop: 14, borderRadius: 18, background: "#ffffff", boxShadow: "0 0 0 1px #e5e7eb, 0 10px 40px -10px rgba(0,0,0,0.08)", padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#111827" }}>結帳</div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>缺少商品 id</div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell sidebarItems={defaultSidebarItems}>
        <div className={homeStyles.main2}>
          <div className={homeStyles.main}>
            <div className={homeStyles.sectionLobby}>
              <div style={{ marginTop: 14, borderRadius: 18, background: "#ffffff", boxShadow: "0 0 0 1px #e5e7eb, 0 10px 40px -10px rgba(0,0,0,0.08)", padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#111827" }}>結帳</div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>找不到商品</div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const resolvedItem = item;

  async function payNow() {
    if (needsKyc) {
      router.push(`/account/kyc?next=${encodeURIComponent(nextUrl)}`);
      return;
    }
    if (!defaultAddress) {
      router.push(`/account/addresses?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    setProcessing(true);
    setPayPhase("processing");
    setErrorMsg(null);
    window.setTimeout(() => {
      void (async () => {
        if (kind === "market") {
        const order: Order = {
          id: makeId("ord"),
          kind: "market",
          refId: normalizeMarketId(rawId),
          title: resolvedItem.title,
          imageUrl: resolvedItem.imageUrl,
          amountSubtotal,
          shippingFee,
          platformFee,
          totalAmount,
          currency: "TWD",
          status: "paid",
          createdAt: Date.now(),
          addressSnapshot: { name: defaultAddress.name, phone: defaultAddress.phone, addressLine: defaultAddress.addressLine },
          shipment: { carrier: "newebpay-logistics", trackingNo: `NL${Math.random().toString().slice(2, 12)}`, status: "created" },
        };
        if (userId) {
          const supabase = supabaseBrowser();
          const addrId = isUuid(defaultAddress.id) ? defaultAddress.id : null;
          if (supabase) {
            const { data: inserted, error } = await supabase
              .from("orders")
              .insert({
                user_id: userId,
                kind: "market",
                ref_id: order.refId,
                amount_subtotal: amountSubtotal,
                shipping_fee: shippingFee,
                platform_fee: platformFee,
                amount_total: totalAmount,
                status: order.status,
                address_id: addrId,
                shipping: order.shipment ?? {},
              })
              .select("id")
              .single();
            if (!error && inserted?.id) {
              setProcessing(false);
              setPayPhase("idle");
              router.push(`/orders/${inserted.id}`);
              return;
            }
            if (error) setErrorMsg(error.message);
          }
        }
        const existing = readJson<Order[]>(ORDERS_KEY, []);
        const nextOrders = [order, ...existing];
        writeJson(ORDERS_KEY, nextOrders);
        setProcessing(false);
        setPayPhase("idle");
        router.push(`/orders/${order.id}`);
        return;
      }

      const prizePool = [
        { name: "寶可夢 隨機獎項（特別版）", rarity: "SR", imageUrl: "/cardx/placeholder.svg" },
        { name: "遊戲王 隨機獎項（稀有）", rarity: "UR", imageUrl: "/cardx/placeholder.svg" },
        { name: "海賊王 隨機獎項（一般）", rarity: "R", imageUrl: "/cardx/placeholder.svg" },
      ];
      const prize = prizePool[Math.floor(Math.random() * prizePool.length)]!;
      const opening: Opening = {
        id: makeId("op"),
        kind: "pack",
        packId: rawId,
        title: resolvedItem.title,
        imageUrl: resolvedItem.imageUrl,
        amountSubtotal,
        shippingFee,
        platformFee,
        totalAmount,
        currency: "TWD",
        status: "opened",
        createdAt: Date.now(),
        addressSnapshot: { name: defaultAddress.name, phone: defaultAddress.phone, addressLine: defaultAddress.addressLine },
        prize,
        shipment: { carrier: "newebpay-logistics", trackingNo: `NL${Math.random().toString().slice(2, 12)}`, status: "created" },
      };
      if (userId) {
        const supabase = supabaseBrowser();
        const addrId = isUuid(defaultAddress.id) ? defaultAddress.id : null;
        if (supabase) {
          const { data: inserted, error } = await supabase
            .from("openings")
            .insert({
              user_id: userId,
              pack_id: rawId,
              status: opening.status,
              address_id: addrId,
              items: [{ ...opening.prize }],
              shipping: opening.shipment ?? {},
            })
            .select("id")
            .single();
          if (!error && inserted?.id) {
            setProcessing(false);
            setPayPhase("idle");
            router.push(`/openings/${inserted.id}?new=1`);
            return;
          }
          if (error) setErrorMsg(error.message);
        }
      }
      const existing = readJson<Opening[]>(OPENINGS_KEY, []);
      const nextOpenings = [opening, ...existing];
      writeJson(OPENINGS_KEY, nextOpenings);
      setProcessing(false);
      setPayPhase("idle");
      router.push(`/openings/${opening.id}?new=1`);
      })();
    }, 900);
  }

  const title = kind === "market" ? "市集結帳" : "卡包結帳";

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title={title} right={<SecondaryButton href="/orders">我的訂單</SecondaryButton>} subtitle={kind === "market" ? "市集直購" : "卡包開抽"} />

            {errorMsg ? (
              <div style={{ marginTop: 12 }}>
                <SurfaceCard style={{ borderRadius: 14, background: "rgba(255,77,79,0.10)", padding: "10px 12px" }}>
                  <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 900 }}>{errorMsg}</div>
                </SurfaceCard>
              </div>
            ) : null}

            {needsKyc ? (
              <div style={{ marginTop: 12 }}>
                <SurfaceCard style={{ borderRadius: 14, background: "rgba(34,131,246,0.12)", padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 950 }}>交易前需要完成實名驗證</div>
                      <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12, fontWeight: 800 }}>
                        目前狀態：{kyc.status === "reviewing" ? "審核中" : kyc.status === "rejected" ? "未通過" : "未提交"}
                      </div>
                    </div>
                    <SecondaryButton
                      onClick={() => router.push(`/account/kyc?next=${encodeURIComponent(nextUrl)}`)}
                      style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px", background: "#ffffff", color: "#111827" }}
                    >
                      前往驗證
                    </SecondaryButton>
                  </div>
                </SurfaceCard>
              </div>
            ) : null}

            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>商品</div>
                  <Pill tone="muted">{kind === "market" ? "直購" : "抽獎"}</Pill>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <img src={resolvedItem.imageUrl} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", background: "#f3f4f6" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {resolvedItem.title}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>TWD</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", whiteSpace: "nowrap" }}>{twd(amountSubtotal)}</div>
                </div>
              </SurfaceCard>

              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>收件資訊</div>
                  <SecondaryButton
                    onClick={() => {
                      router.push(`/account/addresses?next=${encodeURIComponent(nextUrl)}`);
                    }}
                    style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px", background: "#f3f4f6", color: "#111827" }}
                  >
                    {defaultAddress ? "更換" : "新增"}
                  </SecondaryButton>
                </div>
                {defaultAddress ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                      {defaultAddress.name} · {defaultAddress.phone}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>{defaultAddress.addressLine}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626" }}>請先新增地址</div>
                )}
              </SurfaceCard>

              <SurfaceCard style={{ display: "grid", gap: 8 }}>
                <KeyValueRow label="商品小計" value={twd(amountSubtotal)} />
                <KeyValueRow label="運費（買家出）" value={twd(shippingFee)} />
                <KeyValueRow label="平台服務費" value={twd(platformFee)} />
                <div style={{ height: 1, background: "#e5e7eb", marginTop: 4, marginBottom: 4 }} />
                <KeyValueRow label={<span style={{ fontWeight: 950, color: "#374151" }}>應付總額</span>} value={<span style={{ fontSize: 16 }}>{twd(totalAmount)}</span>} />
              </SurfaceCard>

              <div style={{ display: "grid", gap: 8 }}>
                <Button3D
                  color="red"
                  onClick={payNow}
                  disabled={processing || needsKyc || needsAddress}
                  style={{ height: 46, borderRadius: 14, opacity: processing ? 0.7 : 1 }}
                >
                  {payPhase === "processing" ? "付款處理中..." : "前往藍新付款"}
                </Button3D>
                {needsKyc ? (
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>完成實名驗證後才能付款</div>
                ) : needsAddress ? (
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>請先新增收件地址後再付款</div>
                ) : null}
              </div>

              <SecondaryButton onClick={() => router.back()}>返回</SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
