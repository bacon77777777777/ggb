"use client";

/*
 * 我的收件地址（桌機版）
 *
 * 接的是 `user_addresses`（migration 683），跟手機版會員頁的地址簿同一張表、同一套規則：
 * 最多三筆、只有一筆預設、RLS 只看得到自己的。新增／編輯／刪除之後都要把「預設那筆」
 * 鏡像回 `users.recipient_name / recipient_phone / address` —— 出貨與後台讀的是那三欄，
 * 不同步的話玩家在這裡改了地址，貨還是寄到舊的那間。
 *
 * 原本這頁查的是 `addresses`（單數，欄位 phone / line1），那張表在我們的資料庫根本不存在，
 * 所以一直靜默退回 localStorage —— 換一台電腦地址就不見了。
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard, TextField } from "@/cardx/components/ui/Kit";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { BouncingCapsule } from "@/components/ui/BouncingCapsule";

const MAX_ADDRESSES = 3;

type Address = {
  id: string;
  name: string;
  phone: string;
  address: string;
  isDefault: boolean;
};

/* 區塊載入：跟全站等待畫面（ProductLoadingScreen）同一顆轉蛋球，只是不蓋滿整頁 */
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
  const { user, isLoading: authLoading, refreshProfile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return [] as Address[];
    }
    const { data, error } = await supabase
      .from("user_addresses")
      .select("id, recipient_name, recipient_phone, address, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) {
      setErrorMsg("讀取地址失敗，請重新整理再試一次");
      setLoading(false);
      return [] as Address[];
    }
    const list: Address[] = (data ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.recipient_name ?? ""),
      phone: String(r.recipient_phone ?? ""),
      address: String(r.address ?? ""),
      isDefault: !!r.is_default,
    }));
    setItems(list);
    setLoading(false);
    return list;
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  /** 把預設那筆鏡像回 users 的收件欄位（沒半筆就清空） */
  const syncDefault = useCallback(
    async (list: Address[]) => {
      if (!user) return;
      const d = list.find((a) => a.isDefault) ?? list[0] ?? null;
      await supabase
        .from("users")
        .update({
          recipient_name: d?.name ?? "",
          recipient_phone: d?.phone ?? "",
          address: d?.address ?? "",
        })
        .eq("id", user.id);
      await refreshProfile();
    },
    [refreshProfile, supabase, user]
  );

  const hasDefault = useMemo(() => items.some((a) => a.isDefault), [items]);
  const isFull = items.length >= MAX_ADDRESSES;

  const tabs = useMemo(
    () => [
      { key: "overview", label: "總覽", icon: "#icon-bag-dollar" as const, href: "/account" },
      { key: "orders", label: "配送訂單", icon: "#icon-box" as const, href: "/account?tab=orders" },
      { key: "draws", label: "抽獎紀錄", icon: "#icon-gift" as const, href: "/account?tab=draws" },
      { key: "topup", label: "儲值紀錄", icon: "#icon-docs" as const, href: "/account?tab=topup" },
      { key: "coupons", label: "我的優惠券", icon: "#icon-promotions" as const, href: "/account?tab=coupons" },
    ],
    []
  );
  const activeTab = tabs[0]!;

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

  function resetForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setAddressLine("");
    setMakeDefault(items.length === 0);
  }

  function startEdit(a: Address) {
    setEditingId(a.id);
    setName(a.name);
    setPhone(a.phone);
    setAddressLine(a.address);
    setMakeDefault(a.isDefault);
    setErrorMsg(null);
    setOkMsg(null);
  }

  async function save() {
    if (!user) return;
    const nm = name.trim();
    const ph = phone.trim();
    const ad = addressLine.trim();
    setOkMsg(null);
    if (nm.length < 2 || nm.length > 10) {
      setErrorMsg("收件人姓名請填 2～10 個字");
      return;
    }
    if (!/^09\d{8}$/.test(ph)) {
      setErrorMsg("聯絡電話請填 09 開頭的 10 碼手機號碼");
      return;
    }
    if (ad.length < 8 || ad.length > 60) {
      setErrorMsg("地址請填完整（含縣市、街道與門牌），8～60 個字");
      return;
    }
    if (!/[縣市]/.test(ad)) {
      setErrorMsg("地址請包含縣市（例：台北市…）");
      return;
    }
    if (!editingId && isFull) {
      setErrorMsg(`最多儲存 ${MAX_ADDRESSES} 筆地址`);
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("user_addresses")
          .update({
            recipient_name: nm,
            recipient_phone: ph,
            address: ad,
            is_default: makeDefault,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_addresses").insert({
          user_id: user.id,
          recipient_name: nm,
          recipient_phone: ph,
          address: ad,
          is_default: makeDefault || items.length === 0,
        });
        if (error) throw error;
      }
      const list = await load();
      await syncDefault(list);
      setOkMsg(editingId ? "地址已更新" : "地址已新增");
      resetForm();
      if (next && list.length) router.push(next);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      setErrorMsg(msg.includes("MAX_ADDRESSES") ? `最多儲存 ${MAX_ADDRESSES} 筆地址` : "儲存失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    setOkMsg(null);
    try {
      const { error } = await supabase
        .from("user_addresses")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      const list = await load();
      await syncDefault(list);
      setOkMsg("已設為預設地址");
    } catch {
      setErrorMsg("設定失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    setOkMsg(null);
    try {
      const { error } = await supabase.from("user_addresses").delete().eq("id", id);
      if (error) throw error;
      let list = await load();
      // 預設被刪掉時讓最舊的一筆遞補，出貨路徑永遠有預設可用
      if (list.length > 0 && !list.some((a) => a.isDefault)) {
        await supabase.from("user_addresses").update({ is_default: true }).eq("id", list[0]!.id);
        list = await load();
      }
      await syncDefault(list);
      if (editingId === id) resetForm();
      setOkMsg("地址已移除");
    } catch {
      setErrorMsg("移除失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  const formValid = name.trim() && phone.trim() && addressLine.trim();

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader
              title="收件地址"
              subtitle={`最多可以存 ${MAX_ADDRESSES} 筆，寄送獎品時預設寄到你設定的那一筆`}
              right={
                next ? (
                  <Button3D
                    color="blue"
                    onClick={() => items.length && router.push(next)}
                    disabled={!items.length}
                    style={{ height: 36, borderRadius: 12, opacity: items.length ? 1 : 0.6 }}
                  >
                    回到剛才的頁面
                  </Button3D>
                ) : null
              }
            />

            <div className={homeStyles.accountContainer}>
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
                      <UiIcon href={activeTab.icon} size={18} />
                    </span>
                    <span className={homeStyles.accountTabsDropdownText}>收件地址</span>
                  </span>
                  <span
                    className={`${homeStyles.accountTabsDropdownChevron} ${tabMenuOpen ? homeStyles.accountTabsDropdownChevronOpen : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {tabMenuOpen ? (
                  <div className={homeStyles.accountTabsDropdownMenu} role="menu" aria-label="會員中心頁籤">
                    {tabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={homeStyles.accountTabsDropdownItem}
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
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => router.push(t.href)}
                    className={homeStyles.accountTabBtn}
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
                        background: "#f3f4f6",
                        color: "#374151",
                      }}
                    >
                      <UiIcon href={t.icon} size={20} />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.2px" }}>{t.label}</span>
                  </button>
                ))}
              </div>

              {authLoading || loading ? (
                <div style={{ marginTop: 14 }}>
                  <SectionLoading />
                </div>
              ) : !user ? (
                <div style={{ marginTop: 14 }}>
                  <SurfaceCard style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>登入後才能管理收件地址</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>登入之後，你存過的地址在每一台裝置都看得到。</div>
                    <Button3D color="blue" href="/login" style={{ height: 40, borderRadius: 12 }}>
                      前往登入
                    </Button3D>
                  </SurfaceCard>
                </div>
              ) : (
                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  {errorMsg ? (
                    <SurfaceCard style={{ borderRadius: 14, background: "rgba(220,38,38,0.08)", padding: "10px 12px" }}>
                      <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 900 }}>{errorMsg}</div>
                    </SurfaceCard>
                  ) : null}
                  {okMsg ? (
                    <SurfaceCard style={{ borderRadius: 14, background: "rgba(16,185,129,0.10)", padding: "10px 12px" }}>
                      <div style={{ color: "#047857", fontSize: 12, fontWeight: 900 }}>{okMsg}</div>
                    </SurfaceCard>
                  ) : null}

                  <SurfaceCard style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
                        {editingId ? "編輯地址" : "新增地址"}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: hasDefault ? "#6b7280" : "#dc2626" }}>
                        {hasDefault ? `已存 ${items.length} / ${MAX_ADDRESSES} 筆` : "還沒設定預設地址"}
                      </div>
                    </div>

                    {!editingId && isFull ? (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                        地址已經存滿 {MAX_ADDRESSES} 筆，想換一筆的話請先移除或改寫下面其中一筆。
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        <TextField label="收件人" value={name} onChange={setName} placeholder="姓名（2～10 個字）" />
                        <TextField label="聯絡電話" value={phone} onChange={setPhone} placeholder="09xxxxxxxx" inputMode="tel" />
                        <TextField label="地址" value={addressLine} onChange={setAddressLine} placeholder="例：台北市大安區忠孝東路四段 1 號 5 樓" />
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 850, color: "#374151", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={makeDefault || items.length === 0}
                            disabled={items.length === 0}
                            onChange={(e) => setMakeDefault(e.target.checked)}
                          />
                          設為預設地址
                        </label>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <Button3D
                            color="blue"
                            onClick={() => void save()}
                            disabled={busy || !formValid}
                            style={{ height: 42, borderRadius: 12, opacity: busy || !formValid ? 0.6 : 1 }}
                          >
                            {busy ? "儲存中…" : editingId ? "儲存變更" : "新增地址"}
                          </Button3D>
                          {editingId ? (
                            <SecondaryButton onClick={resetForm} style={{ height: 42, borderRadius: 12 }}>
                              取消編輯
                            </SecondaryButton>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </SurfaceCard>

                  <SurfaceCard style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>我的地址</div>
                    {items.length ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {items.map((a) => (
                          <div key={a.id} style={{ borderRadius: 16, border: 0, background: "#f3f4f6", padding: 12, display: "grid", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {a.name}
                                  </div>
                                  {a.isDefault ? <Pill tone="info">預設</Pill> : null}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{a.phone}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                {!a.isDefault ? (
                                  <SecondaryButton
                                    onClick={() => void setDefault(a.id)}
                                    disabled={busy}
                                    style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px", background: "#ffffff", color: "#111827" }}
                                  >
                                    設為預設
                                  </SecondaryButton>
                                ) : null}
                                <SecondaryButton
                                  onClick={() => startEdit(a)}
                                  disabled={busy}
                                  style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px", background: "#ffffff", color: "#111827" }}
                                >
                                  編輯
                                </SecondaryButton>
                                <SecondaryButton
                                  onClick={() => void remove(a.id)}
                                  disabled={busy}
                                  style={{ height: 32, borderRadius: 10, fontSize: 12, padding: "0 10px", background: "rgba(220,38,38,0.12)", color: "#dc2626" }}
                                >
                                  刪除
                                </SecondaryButton>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>{a.address}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>還沒有存過地址</div>
                    )}
                  </SurfaceCard>

                  <SecondaryButton onClick={() => router.push("/account")}>回會員中心</SecondaryButton>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
