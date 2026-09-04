// @ts-nocheck — cardx 原型照搬（老闆 2026-09-04），型別不補
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { supabaseBrowser } from "@/cardx/lib/supabase/browser";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard, TextField } from "@/cardx/components/ui/Kit";

function UiIcon({ href, size = 18, opacity = 0.92 }: { href: string; size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ opacity }}>
      <use href={href} />
    </svg>
  );
}

type Address = {
  id: string;
  name: string;
  phone: string;
  addressLine: string;
  isDefault: boolean;
  updatedAt: number;
};

const ADDRESSES_KEY = "cardx.addresses.v1";

function readAddresses(): Address[] {
  try {
    const raw = window.localStorage.getItem(ADDRESSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const id = typeof x.id === "string" ? x.id : "";
        const name = typeof x.name === "string" ? x.name : "";
        const phone = typeof x.phone === "string" ? x.phone : "";
        const addressLine = typeof x.addressLine === "string" ? x.addressLine : "";
        const isDefault = !!x.isDefault;
        const updatedAt = typeof x.updatedAt === "number" ? x.updatedAt : Date.now();
        return { id, name, phone, addressLine, isDefault, updatedAt };
      })
      .filter((x) => x.id && x.name && x.phone && x.addressLine);
  } catch {
    return [];
  }
}

function writeAddresses(items: Address[]) {
  try {
    window.localStorage.setItem(ADDRESSES_KEY, JSON.stringify(items));
  } catch {}
}

function newId() {
  const rand = Math.random().toString(16).slice(2, 8);
  return `addr_${Date.now().toString(36)}_${rand}`;
}

export default function AddressesPage() {
  return (
    <Suspense fallback={null}>
      <AddressesPageInner />
    </Suspense>
  );
}

function AddressesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<Address[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) {
      window.setTimeout(() => setItems(readAddresses()), 0);
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
          setItems(readAddresses());
          return;
        }
        const { data: rows, error } = await sb
          .from("addresses")
          .select("id, recipient_name, phone, line1, is_default, updated_at")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        const mapped: Address[] =
          rows?.map((r) => {
            const ts = r.updated_at ? new Date(r.updated_at).getTime() : Date.now();
            return {
              id: String(r.id),
              name: String(r.recipient_name ?? ""),
              phone: String(r.phone ?? ""),
              addressLine: String(r.line1 ?? ""),
              isDefault: !!r.is_default,
              updatedAt: Number.isFinite(ts) ? ts : Date.now(),
            };
          }) ?? [];
        setItems(mapped.filter((x) => x.id && x.name && x.phone && x.addressLine));
      } catch {
        setUserId(null);
        setItems(readAddresses());
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

  const hasDefault = useMemo(() => items.some((a) => a.isDefault), [items]);
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
  const activeTab = useMemo(() => tabs.find((t) => t.key === "overview") ?? tabs[0]!, [tabs]);

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

  function setDefault(id: string) {
    if (!userId) {
      setItems((prev) => {
        const nextItems = prev.map((a) => ({ ...a, isDefault: a.id === id, updatedAt: Date.now() }));
        writeAddresses(nextItems);
        return nextItems;
      });
      return;
    }
    const supabase = supabaseBrowser();
    if (!supabase) return;
    const sb = supabase;
    void (async () => {
      await sb.from("addresses").update({ is_default: false }).eq("user_id", userId);
      await sb.from("addresses").update({ is_default: true }).eq("user_id", userId).eq("id", id);
      const { data: rows } = await sb
        .from("addresses")
        .select("id, recipient_name, phone, line1, is_default, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      const mapped: Address[] =
        rows?.map((r) => {
          const ts = r.updated_at ? new Date(r.updated_at).getTime() : Date.now();
          return {
            id: String(r.id),
            name: String(r.recipient_name ?? ""),
            phone: String(r.phone ?? ""),
            addressLine: String(r.line1 ?? ""),
            isDefault: !!r.is_default,
            updatedAt: Number.isFinite(ts) ? ts : Date.now(),
          };
        }) ?? [];
      setItems(mapped.filter((x) => x.id && x.name && x.phone && x.addressLine));
    })();
  }

  function remove(id: string) {
    if (!userId) {
      setItems((prev) => {
        const left = prev.filter((a) => a.id !== id);
        if (left.length && !left.some((a) => a.isDefault)) left[0] = { ...left[0]!, isDefault: true, updatedAt: Date.now() };
        writeAddresses(left);
        return left;
      });
      return;
    }
    const supabase = supabaseBrowser();
    if (!supabase) return;
    const sb = supabase;
    void (async () => {
      await sb.from("addresses").delete().eq("user_id", userId).eq("id", id);
      const { data: rows } = await sb
        .from("addresses")
        .select("id, recipient_name, phone, line1, is_default, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      const list =
        rows?.map((r) => {
          const ts = r.updated_at ? new Date(r.updated_at).getTime() : Date.now();
          return {
            id: String(r.id),
            name: String(r.recipient_name ?? ""),
            phone: String(r.phone ?? ""),
            addressLine: String(r.line1 ?? ""),
            isDefault: !!r.is_default,
            updatedAt: Number.isFinite(ts) ? ts : Date.now(),
          };
        }) ?? [];
      const cleaned = list.filter((x) => x.id && x.name && x.phone && x.addressLine);
      if (cleaned.length && !cleaned.some((a) => a.isDefault)) {
        const head = cleaned[0]!;
        await sb.from("addresses").update({ is_default: true }).eq("user_id", userId).eq("id", head.id);
        head.isDefault = true;
      }
      setItems(cleaned);
    })();
  }

  function add() {
    const nm = name.trim();
    const ph = phone.trim();
    const ad = addressLine.trim();
    if (!nm || !ph || !ad) return;
    if (!userId) {
      setItems((prev) => {
        const created: Address = { id: newId(), name: nm, phone: ph, addressLine: ad, isDefault: prev.length === 0, updatedAt: Date.now() };
        const nextItems = [created, ...prev.map((x) => ({ ...x, isDefault: created.isDefault ? false : x.isDefault }))];
        writeAddresses(nextItems);
        if (next && nextItems.length && nextItems.some((x) => x.isDefault)) router.push(next);
        return nextItems;
      });
    } else {
      const supabase = supabaseBrowser();
      if (!supabase) return;
      const sb = supabase;
      void (async () => {
        const shouldDefault = items.length === 0;
        const { data: inserted, error } = await sb
          .from("addresses")
          .insert({
            user_id: userId,
            recipient_name: nm,
            phone: ph,
            line1: ad,
            is_default: shouldDefault,
          })
          .select("id, recipient_name, phone, line1, is_default, updated_at")
          .single();
        if (error) {
          setErrorMsg(error.message);
          return;
        }
        if (shouldDefault) {
          await sb.from("addresses").update({ is_default: false }).eq("user_id", userId).neq("id", inserted.id);
        }
        const { data: rows } = await sb
          .from("addresses")
          .select("id, recipient_name, phone, line1, is_default, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        const mapped: Address[] =
          rows?.map((r) => {
            const ts = r.updated_at ? new Date(r.updated_at).getTime() : Date.now();
            return {
              id: String(r.id),
              name: String(r.recipient_name ?? ""),
              phone: String(r.phone ?? ""),
              addressLine: String(r.line1 ?? ""),
              isDefault: !!r.is_default,
              updatedAt: Number.isFinite(ts) ? ts : Date.now(),
            };
          }) ?? [];
        const cleaned = mapped.filter((x) => x.id && x.name && x.phone && x.addressLine);
        setItems(cleaned);
        if (next && cleaned.length && cleaned.some((x) => x.isDefault)) router.push(next);
      })();
    }
    setName("");
    setPhone("");
    setAddressLine("");
  }

  function goNextIfReady() {
    if (!next) return;
    if (!items.length) return;
    router.push(next);
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader
              title="帳戶"
              right={
                next ? (
                  <Button3D color="blue" onClick={goNextIfReady} disabled={!items.length} style={{ height: 36, borderRadius: 12, opacity: items.length ? 1 : 0.6 }}>
                    返回結帳
                  </Button3D>
                ) : null
              }
            />

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

              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {errorMsg ? (
                <SurfaceCard style={{ borderRadius: 14, background: "rgba(255,77,79,0.10)", padding: "10px 12px" }}>
                  <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 900 }}>{errorMsg}</div>
                </SurfaceCard>
              ) : null}
              <SurfaceCard style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>新增地址</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: hasDefault ? "#6b7280" : "#dc2626" }}>
                    {hasDefault ? "已設定預設地址" : "請設定預設地址"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <TextField label="收件人" value={name} onChange={setName} placeholder="姓名" />
                  <TextField label="手機" value={phone} onChange={setPhone} placeholder="09xx-xxx-xxx" inputMode="tel" />
                  <TextField label="地址" value={addressLine} onChange={setAddressLine} placeholder="縣市 / 區 / 路段 / 門牌" />
                  <Button3D
                    color="blue"
                    onClick={add}
                    disabled={!name.trim() || !phone.trim() || !addressLine.trim()}
                    style={{ height: 42, borderRadius: 12, opacity: name.trim() && phone.trim() && addressLine.trim() ? 1 : 0.6 }}
                  >
                    新增地址
                  </Button3D>
                </div>
              </SurfaceCard>

              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>我的地址</div>
                {items.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {items.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          borderRadius: 16,
                          border: 0,
                          background: "#f3f4f6",
                          padding: 12,
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.name}
                              </div>
                              {a.isDefault ? (
                                <Pill tone="info">預設</Pill>
                              ) : null}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{a.phone}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {!a.isDefault ? (
                              <SecondaryButton onClick={() => setDefault(a.id)} style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px", background: "#f3f4f6", color: "#111827" }}>
                                設為預設
                              </SecondaryButton>
                            ) : null}
                            <SecondaryButton onClick={() => remove(a.id)} style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px", background: "rgba(255,77,79,0.16)", color: "#dc2626" }}>
                              刪除
                            </SecondaryButton>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>{a.addressLine}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>尚未新增地址</div>
                )}
              </SurfaceCard>

              <SecondaryButton onClick={() => router.back()}>返回</SecondaryButton>
            </div>
          </div>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
