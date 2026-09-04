"use client";

/*
 * 申請寄送（桌機版）
 *
 * 吉吉比沒有「購物車結帳」這件事：抽到的獎品先進倉庫，玩家想拿實體的時候
 * 再挑幾件申請寄出，付的是運費（G 幣）。原本這頁畫的是 cardx 原型的市集直購／
 * 卡包開抽結帳，會往 `orders` / `openings` 直接 insert，並先擋一道我們沒有的實名認證。
 * 現在整頁改成配送申請，走跟手機版同一支 `create_delivery_order`。
 *
 * 幾條規則是伺服器在管的，畫面照著擋只是為了給看得懂的訊息：
 *   ・一張單只能寄同一家廠商的貨
 *   ・大型獎品只能宅配
 *   ・運費由 `calc_delivery_fee` 算，前台顯示多少就付多少（對不上會被擋下）
 *
 * 儲值是另一條路（/topup），不在這裡。
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, KeyValueRow, PageHeader, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { BouncingCapsule } from "@/components/ui/BouncingCapsule";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { newStoreMapRequestId, openStoreMap } from "@/lib/logistics/openStoreMap";

type LogisticsType = "HOME" | "CVS";
type CvsBrand = "UNIMART" | "FAMI" | "HILIFE" | "OKMART";

const CVS_OPTIONS: Array<{ key: CvsBrand; label: string }> = [
  { key: "UNIMART", label: "7-11 交貨便" },
  { key: "FAMI", label: "全家店到店" },
  { key: "HILIFE", label: "萊爾富店到店" },
  { key: "OKMART", label: "OK 超商店到店" },
];

type WarehouseItem = {
  id: string;
  name: string;
  grade: string;
  image: string | null;
  productName: string;
  supplierId: number | null;
  supplierName: string;
  /** 一番賞／自製賞裡總量 3 件以下的算大型獎品，只能宅配 */
  isLarge: boolean;
};

type AddressOption = { id: string; name: string; phone: string; address: string; isDefault: boolean };
type ShippingCoupon = { id: string; title: string; discountValue: number };

function SectionLoading() {
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 14, padding: "56px 0" }}>
      <BouncingCapsule size={40} />
      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.2em", color: "#9ca3af" }}>載入中</span>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutPageInner />
    </Suspense>
  );
}

function CheckoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, refreshProfile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [addresses, setAddresses] = useState<AddressOption[]>([]);
  const [coupons, setCoupons] = useState<ShippingCoupon[]>([]);

  const [selected, setSelected] = useState<string[]>([]);
  const [logisticsType, setLogisticsType] = useState<LogisticsType>("HOME");
  const [cvsBrand, setCvsBrand] = useState<CvsBrand>("UNIMART");
  const [store, setStore] = useState<{ id: string; name: string; address: string } | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [couponId, setCouponId] = useState<string | null>(null);

  const [fee, setFee] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [pendingStoreToken, setPendingStoreToken] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── 載入倉庫、地址、運費券 ───────────────────────────── */
  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [warehouse, addr, cps] = await Promise.all([
      supabase
        .from("draw_records")
        .select(`
          id, prize_name, prize_level,
          product_prizes ( level, name, image_url, total ),
          products ( name, type, supplier_id, suppliers ( name ) )
        `)
        .eq("user_id", user.id)
        .eq("status", "in_warehouse")
        .order("created_at", { ascending: false }),
      supabase
        .from("user_addresses")
        .select("id, recipient_name, recipient_phone, address, is_default")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("user_coupons")
        .select("id, expiry_date, coupons ( title, discount_value, scope, is_active )")
        .eq("user_id", user.id)
        .eq("status", "unused"),
    ]);

    const list: WarehouseItem[] = ((warehouse.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
      const prize = r.product_prizes as { level?: string; name?: string; image_url?: string; total?: number } | null | undefined;
      const product = r.products as
        | { name?: string; type?: string; supplier_id?: number; suppliers?: { name?: string } }
        | null
        | undefined;
      const type = String(product?.type ?? "");
      return {
        id: String(r.id),
        name: String(prize?.name ?? r.prize_name ?? "獎品"),
        grade: String(prize?.level ?? r.prize_level ?? ""),
        image: prize?.image_url ? String(prize.image_url) : null,
        productName: String(product?.name ?? ""),
        supplierId: product?.supplier_id ?? null,
        supplierName: String(product?.suppliers?.name ?? "未知廠商"),
        isLarge: (type === "ichiban" || type === "custom") && Number(prize?.total ?? 999) <= 3,
      };
    });
    setItems(list);

    const addrList: AddressOption[] = ((addr.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.recipient_name ?? ""),
      phone: String(r.recipient_phone ?? ""),
      address: String(r.address ?? ""),
      isDefault: !!r.is_default,
    }));
    setAddresses(addrList);
    setAddressId((prev) => prev ?? addrList.find((a) => a.isDefault)?.id ?? addrList[0]?.id ?? null);

    const now = new Date();
    const couponList: ShippingCoupon[] = ((cps.data ?? []) as unknown as Array<Record<string, unknown>>)
      .filter((r) => {
        const c = r.coupons as { scope?: string; is_active?: boolean } | null | undefined;
        const exp = r.expiry_date ? new Date(String(r.expiry_date)) : null;
        return c?.scope === "shipping" && c?.is_active && (!exp || exp >= now);
      })
      .map((r) => {
        const c = r.coupons as { title?: string; discount_value?: number };
        return { id: String(r.id), title: String(c.title ?? "運費折抵券"), discountValue: Number(c.discount_value ?? 0) };
      });
    setCoupons(couponList);
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  /** 網址帶 ?items=1,2,3 時預選（從別的頁面帶過來的那批） */
  const itemsParam = searchParams.get("items") ?? "";
  useEffect(() => {
    if (!itemsParam || !items.length) return;
    const wanted = new Set(itemsParam.split(",").map((s) => s.trim()).filter(Boolean));
    const hit = items.filter((i) => wanted.has(i.id)).map((i) => i.id);
    if (hit.length) setSelected(hit);
  }, [itemsParam, items]);

  /* ── 選取規則：一張單只能一家廠商 ─────────────────────── */
  const selectedItems = useMemo(() => items.filter((i) => selected.includes(i.id)), [items, selected]);
  const lockedSupplier = useMemo(() => (selectedItems.length ? selectedItems[0]!.supplierId : null), [selectedItems]);
  const lockedSupplierName = useMemo(() => (selectedItems.length ? selectedItems[0]!.supplierName : ""), [selectedItems]);
  const hasLarge = useMemo(() => selectedItems.some((i) => i.isLarge), [selectedItems]);

  useEffect(() => {
    if (hasLarge && logisticsType !== "HOME") setLogisticsType("HOME");
  }, [hasLarge, logisticsType]);

  function toggle(id: string) {
    setMsg(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const item = items.find((i) => i.id === id);
      if (!item) return prev;
      if (prev.length) {
        const first = items.find((i) => i.id === prev[0]);
        if (first && first.supplierId !== item.supplierId) {
          setMsg({ tone: "err", text: `一次只能寄同一家廠商的獎品，目前這批是「${first.supplierName}」，請分批申請` });
          return prev;
        }
      }
      return [...prev, id];
    });
  }

  /* ── 運費：一律問伺服器，避免顯示的跟實收的不一樣 ───────── */
  useEffect(() => {
    let dead = false;
    if (!selected.length) {
      setFee(null);
      return;
    }
    void supabase
      .rpc("calc_delivery_fee", {
        p_logistics_type: logisticsType,
        p_logistics_subtype: logisticsType === "CVS" ? cvsBrand : null,
        p_item_count: selected.length,
        p_has_large: hasLarge,
      })
      .then(({ data, error }) => {
        if (dead) return;
        setFee(error ? null : Number(data ?? 0));
      });
    return () => {
      dead = true;
    };
  }, [supabase, selected.length, logisticsType, cvsBrand, hasLarge]);

  const coupon = useMemo(() => coupons.find((c) => c.id === couponId) ?? null, [coupons, couponId]);
  const discount = useMemo(() => (coupon && fee != null ? Math.min(coupon.discountValue, fee) : 0), [coupon, fee]);
  const payable = fee == null ? null : fee - discount;

  const address = useMemo(
    () => addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null,
    [addresses, addressId]
  );

  /* ── 超商選店：新分頁選完回傳（postMessage），iOS 走輪詢 ── */
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string })?.type !== "cvs_store_selected") return;
      const d = e.data as { storeId?: string; storeName?: string; storeAddress?: string; logisticsSubType?: string };
      if (!d.storeId) return;
      setStore({ id: d.storeId, name: d.storeName ?? "", address: d.storeAddress ?? "" });
      if (d.logisticsSubType) setCvsBrand(d.logisticsSubType.replace(/C2C$/i, "") as CvsBrand);
      setPendingStoreToken(null);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!pendingStoreToken) return;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      if (attempts > 45) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setPendingStoreToken(null);
        return;
      }
      try {
        const res = await fetch(`/api/logistics/cvs-pending?token=${encodeURIComponent(pendingStoreToken)}`);
        const data = await res.json();
        if (data.found && data.storeId) {
          setStore({ id: data.storeId, name: data.storeName ?? "", address: data.storeAddress ?? "" });
          if (data.logisticsSubType) setCvsBrand(String(data.logisticsSubType).replace(/C2C$/i, "") as CvsBrand);
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPendingStoreToken(null);
        }
      } catch {
        /* 選店期間的網路錯誤是常態，繼續輪詢 */
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [pendingStoreToken]);

  function pickStore(brand: CvsBrand) {
    const rid = newStoreMapRequestId();
    setCvsBrand(brand);
    setPendingStoreToken(rid);
    void openStoreMap({ logisticsSubType: brand, requestId: rid });
  }

  /* ── 送出 ────────────────────────────────────────────── */
  async function submit() {
    if (!user || !selected.length || fee == null || payable == null) return;
    if (logisticsType === "CVS" && !store) {
      setMsg({ tone: "err", text: "請先選擇取貨門市" });
      return;
    }
    if (!address) {
      setMsg({ tone: "err", text: "請先新增收件地址" });
      return;
    }
    const name = address.name.trim();
    const phone = address.phone.trim();
    const addr = address.address.trim();
    if (name.length < 2 || name.length > 10) {
      setMsg({ tone: "err", text: "收件人姓名請填 2～10 個字" });
      return;
    }
    if (!/^09\d{8}$/.test(phone)) {
      setMsg({ tone: "err", text: "聯絡電話請填 09 開頭的 10 碼手機號碼" });
      return;
    }
    if (logisticsType === "HOME" && (addr.length < 8 || addr.length > 60 || !/[縣市]/.test(addr))) {
      setMsg({ tone: "err", text: "收件地址請填完整（含縣市），8～60 個字" });
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc("create_delivery_order", {
        p_user_id: user.id,
        p_recipient_name: name,
        p_recipient_phone: phone,
        p_address: logisticsType === "HOME" ? addr : store?.address ?? "",
        p_logistics_type: logisticsType,
        p_logistics_subtype: logisticsType === "CVS" ? cvsBrand : null,
        p_store_id: logisticsType === "CVS" ? store?.id ?? null : null,
        p_store_name: logisticsType === "CVS" ? store?.name ?? null : null,
        p_draw_record_ids: selected.map((id) => Number(id)),
        p_delivery_fee_points: payable,
        p_note: note.trim() || null,
        p_coupon_id: couponId,
      });
      if (error) throw error;
      const result = data as { success?: boolean; message?: string; order_id?: number } | null;
      if (!result?.success) throw new Error(result?.message ?? "申請失敗");

      await refreshProfile();
      router.push(result.order_id ? `/orders/${result.order_id}` : "/orders");
    } catch (e) {
      const text = String((e as { message?: string })?.message ?? "");
      if (text.includes("INSUFFICIENT_POINTS")) setMsg({ tone: "err", text: "G 幣不足，付不了運費" });
      else if (text.includes("MULTIPLE_SUPPLIERS")) setMsg({ tone: "err", text: "一次只能寄同一家廠商的獎品，請分批申請" });
      else if (text.includes("LARGE_ITEM_REQUIRES_HOME_DELIVERY")) setMsg({ tone: "err", text: "這批有大型獎品，只能用宅配" });
      else if (text.includes("NO_DELIVERABLE_ITEMS")) setMsg({ tone: "err", text: "選到的獎品已經不在倉庫了，請重新整理再挑一次" });
      else if (text.includes("PREORDER_NOT_AVAILABLE")) setMsg({ tone: "err", text: "這批裡有還沒到貨的預購品，等到貨後才能申請寄送" });
      else if (text.includes("INVALID_COUPON")) setMsg({ tone: "err", text: "這張運費券沒辦法用了，請換一張或先不要用" });
      else if (text.includes("FEE_MISMATCH")) {
        // 伺服器的訊息本來就帶著正確答案，讀出來更新畫面，玩家再按一次就成功
        const expected = Number(text.match(/expected\s+(-?\d+)/)?.[1]);
        if (Number.isFinite(expected)) {
          setFee(expected + discount);
          setMsg({ tone: "err", text: "運費剛剛更新了，金額已經幫你換成最新的，請再按一次送出" });
        } else {
          setMsg({ tone: "err", text: "運費對不上，請重新整理再試一次" });
        }
      } else setMsg({ tone: "err", text: "申請失敗，請稍後再試" });
    } finally {
      setSubmitting(false);
    }
  }

  const balance = Number(user?.tokens ?? 0);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader
              title="申請寄送"
              subtitle="從倉庫挑出想拿到手的獎品，付運費就幫你寄出"
              right={<SecondaryButton href="/orders">配送訂單</SecondaryButton>}
            />

            <div className={homeStyles.accountContainer}>
              {authLoading || loading ? (
                <SectionLoading />
              ) : !user ? (
                <div style={{ marginTop: 14 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>登入後才能申請寄送</div>
                    <Button3D color="blue" href="/login" style={{ height: 40, borderRadius: 12 }}>
                      前往登入
                    </Button3D>
                  </SurfaceCard>
                </div>
              ) : !items.length ? (
                <div style={{ marginTop: 14 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>倉庫裡還沒有可以寄的獎品</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                      抽到的獎品會先放進倉庫，之後隨時可以挑幾件一起寄出。
                    </div>
                    <Button3D color="blue" href="/" style={{ height: 40, borderRadius: 12 }}>
                      去逛逛
                    </Button3D>
                  </SurfaceCard>
                </div>
              ) : (
                <div className={homeStyles.accountMidGrid}>
                  {/* 左：挑獎品 */}
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
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>選擇要寄出的獎品</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {lockedSupplierName ? <Pill tone="info">{lockedSupplierName}</Pill> : null}
                          <Pill tone="muted">已選 {selected.length} 件</Pill>
                          {selected.length ? (
                            <SecondaryButton
                              onClick={() => setSelected([])}
                              style={{ height: 30, borderRadius: 10, fontSize: 12, padding: "0 10px" }}
                            >
                              清空
                            </SecondaryButton>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                        一張單只能寄同一家廠商的獎品，不同家請分批申請。
                      </div>

                      <div style={{ display: "grid", gap: 8, maxHeight: 520, overflowY: "auto" }}>
                        {items.map((it) => {
                          const on = selected.includes(it.id);
                          const blocked = !on && lockedSupplier !== null && it.supplierId !== lockedSupplier;
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => toggle(it.id)}
                              style={{
                                textAlign: "left",
                                border: 0,
                                cursor: blocked ? "not-allowed" : "pointer",
                                borderRadius: 14,
                                padding: 10,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                background: on ? "rgb(var(--primary) / 0.10)" : "#f3f4f6",
                                boxShadow: on ? "0 0 0 2px rgb(var(--primary) / 0.45) inset" : "none",
                                opacity: blocked ? 0.45 : 1,
                              }}
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
                                  {it.isLarge ? <Pill tone="danger">大型</Pill> : null}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {it.productName} · {it.supplierName}
                                </div>
                              </div>
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 999,
                                  flex: "0 0 auto",
                                  background: on ? "rgb(var(--primary))" : "#ffffff",
                                  boxShadow: on ? "none" : "0 0 0 1px #d1d5db inset",
                                }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </SurfaceCard>
                  </div>

                  {/* 右：寄送方式與結算 */}
                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>配送方式</div>
                      {hasLarge ? (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626" }}>這批有大型獎品，只能用宅配。</div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setLogisticsType("HOME")}
                        style={{
                          border: 0,
                          cursor: "pointer",
                          textAlign: "left",
                          borderRadius: 14,
                          padding: 10,
                          background: logisticsType === "HOME" ? "rgb(var(--primary) / 0.10)" : "#f3f4f6",
                          boxShadow: logisticsType === "HOME" ? "0 0 0 2px rgb(var(--primary) / 0.45) inset" : "none",
                          fontSize: 13,
                          fontWeight: 900,
                          color: "#111827",
                        }}
                      >
                        宅配到府
                      </button>
                      {CVS_OPTIONS.map((o) => {
                        const on = logisticsType === "CVS" && cvsBrand === o.key;
                        return (
                          <button
                            key={o.key}
                            type="button"
                            disabled={hasLarge}
                            onClick={() => {
                              setLogisticsType("CVS");
                              if (!store || cvsBrand !== o.key) pickStore(o.key);
                              else setCvsBrand(o.key);
                            }}
                            style={{
                              border: 0,
                              cursor: hasLarge ? "not-allowed" : "pointer",
                              textAlign: "left",
                              borderRadius: 14,
                              padding: 10,
                              background: on ? "rgb(var(--primary) / 0.10)" : "#f3f4f6",
                              boxShadow: on ? "0 0 0 2px rgb(var(--primary) / 0.45) inset" : "none",
                              fontSize: 13,
                              fontWeight: 900,
                              color: "#111827",
                              opacity: hasLarge ? 0.45 : 1,
                            }}
                          >
                            {o.label}
                            {on && store ? (
                              <span style={{ display: "block", marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                                {store.name}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                      {logisticsType === "CVS" ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: store ? "#6b7280" : "#dc2626" }}>
                            {store ? store.address || "已選擇門市" : pendingStoreToken ? "門市地圖開在新分頁，選好就會自動帶回來" : "還沒選取貨門市"}
                          </div>
                          <SecondaryButton onClick={() => pickStore(cvsBrand)} style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}>
                            {store ? "換一間" : "選門市"}
                          </SecondaryButton>
                        </div>
                      ) : null}
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>收件資訊</div>
                        <SecondaryButton
                          href={`/account/addresses?next=${encodeURIComponent("/checkout")}`}
                          style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px" }}
                        >
                          {addresses.length ? "管理地址" : "新增地址"}
                        </SecondaryButton>
                      </div>
                      {addresses.length ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          {addresses.map((a) => {
                            const on = (address?.id ?? null) === a.id;
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => setAddressId(a.id)}
                                style={{
                                  border: 0,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  borderRadius: 14,
                                  padding: 10,
                                  background: on ? "rgb(var(--primary) / 0.10)" : "#f3f4f6",
                                  boxShadow: on ? "0 0 0 2px rgb(var(--primary) / 0.45) inset" : "none",
                                }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                                  {a.name} · {a.phone}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "#374151" }}>{a.address}</div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626" }}>請先新增一筆收件地址</div>
                      )}
                    </SurfaceCard>

                    <SurfaceCard style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>備註（選填）</div>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 100))}
                        placeholder="想跟出貨人員說的話，例如包裝需求"
                        rows={3}
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: 0,
                          background: "#f3f4f6",
                          color: "#111827",
                          padding: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          outline: "none",
                          resize: "vertical",
                        }}
                      />
                    </SurfaceCard>

                    {coupons.length ? (
                      <SurfaceCard style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>運費折抵券</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setCouponId(null)}
                            style={{
                              border: 0,
                              cursor: "pointer",
                              textAlign: "left",
                              borderRadius: 12,
                              padding: 10,
                              background: couponId === null ? "rgb(var(--primary) / 0.10)" : "#f3f4f6",
                              fontSize: 12,
                              fontWeight: 900,
                              color: "#111827",
                            }}
                          >
                            這次不用券
                          </button>
                          {coupons.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCouponId(c.id)}
                              style={{
                                border: 0,
                                cursor: "pointer",
                                textAlign: "left",
                                borderRadius: 12,
                                padding: 10,
                                background: couponId === c.id ? "rgb(var(--primary) / 0.10)" : "#f3f4f6",
                                fontSize: 12,
                                fontWeight: 900,
                                color: "#111827",
                              }}
                            >
                              {c.title}
                              <span style={{ marginLeft: 8, fontWeight: 800, color: "#6b7280" }}>最多折 {c.discountValue} G</span>
                            </button>
                          ))}
                        </div>
                      </SurfaceCard>
                    ) : null}

                    <SurfaceCard style={{ display: "grid", gap: 8 }}>
                      <KeyValueRow label="寄出件數" value={`${selected.length} 件`} />
                      <KeyValueRow label="運費" value={fee == null ? "選好獎品後計算" : fee > 0 ? `${fee} G` : "免運"} />
                      {discount > 0 ? <KeyValueRow label="運費折抵" value={`-${discount} G`} /> : null}
                      <div style={{ height: 1, background: "#e5e7eb", marginTop: 4, marginBottom: 4 }} />
                      <KeyValueRow
                        label={<span style={{ fontWeight: 950, color: "#374151" }}>實付</span>}
                        value={<span style={{ fontSize: 16 }}>{payable == null ? "—" : payable > 0 ? `${payable} G` : "免運"}</span>}
                      />
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>目前餘額 {balance.toLocaleString()} G</div>

                      <Button3D
                        color="red"
                        onClick={() => void submit()}
                        disabled={submitting || !selected.length || payable == null || !address || (logisticsType === "CVS" && !store)}
                        style={{
                          height: 46,
                          borderRadius: 14,
                          marginTop: 4,
                          opacity: submitting || !selected.length || payable == null || !address || (logisticsType === "CVS" && !store) ? 0.6 : 1,
                        }}
                      >
                        {submitting ? "送出中…" : "送出配送申請"}
                      </Button3D>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af", lineHeight: "18px" }}>
                        送出後獎品會保留給你出貨，還沒開物流單之前都可以取消。
                      </div>
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
