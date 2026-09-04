// @ts-nocheck — cardx 原型照搬（老闆 2026-09-04），型別不補
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { supabaseBrowser } from "@/cardx/lib/supabase/browser";
import { Button3D, PageHeader, SecondaryButton, SurfaceCard, TextField } from "@/cardx/components/ui/Kit";

type KycStatus = "not_started" | "reviewing" | "approved" | "rejected";
type KycRecord = {
  status: KycStatus;
  submittedAt?: number;
  reviewedAt?: number;
  name?: string;
  birthday?: string;
  firstName?: string;
  lastName?: string;
  birthDay?: string;
  birthMonth?: string;
  birthYear?: string;
  country?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  pep?: boolean;
  rejectReason?: string;
};

const KYC_KEY = "cardx.kyc.v1";

function readKyc(): KycRecord {
  try {
    const raw = window.localStorage.getItem(KYC_KEY);
    if (!raw) return { status: "not_started" };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { status: "not_started" };
    const status: KycStatus =
      parsed.status === "approved" || parsed.status === "reviewing" || parsed.status === "rejected" ? parsed.status : "not_started";
    const birthday = typeof parsed.birthday === "string" ? parsed.birthday : undefined;
    const [birthYearFromBirthday, birthMonthFromBirthday, birthDayFromBirthday] =
      birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday.split("-") : [undefined, undefined, undefined];
    const name = typeof parsed.name === "string" ? parsed.name : "";
    const nameParts = name.trim().split(/\s+/).filter(Boolean);
    const firstNameFromName = nameParts[0] ?? undefined;
    const lastNameFromName = nameParts.slice(1).join(" ") || undefined;
    return {
      status,
      submittedAt: typeof parsed.submittedAt === "number" ? parsed.submittedAt : undefined,
      reviewedAt: typeof parsed.reviewedAt === "number" ? parsed.reviewedAt : undefined,
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : firstNameFromName,
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : lastNameFromName,
      birthDay: typeof parsed.birthDay === "string" ? parsed.birthDay : birthDayFromBirthday,
      birthMonth: typeof parsed.birthMonth === "string" ? parsed.birthMonth : birthMonthFromBirthday,
      birthYear: typeof parsed.birthYear === "string" ? parsed.birthYear : birthYearFromBirthday,
      country: typeof parsed.country === "string" ? parsed.country : undefined,
      city: typeof parsed.city === "string" ? parsed.city : undefined,
      postalCode: typeof parsed.postalCode === "string" ? parsed.postalCode : undefined,
      address: typeof parsed.address === "string" ? parsed.address : undefined,
      pep: typeof parsed.pep === "boolean" ? parsed.pep : undefined,
      rejectReason: typeof parsed.rejectReason === "string" ? parsed.rejectReason : undefined,
    };
  } catch {
    return { status: "not_started" };
  }
}

function writeKyc(next: KycRecord) {
  try {
    window.localStorage.setItem(KYC_KEY, JSON.stringify(next));
  } catch {}
}

function StatusPill({ status }: { status: KycStatus }) {
  const { label, bg, fg } = useMemo(() => {
    if (status === "approved") return { label: "已通過", bg: "rgba(20, 184, 166, 0.18)", fg: "#0f766e" };
    if (status === "reviewing") return { label: "審核中", bg: "rgba(34, 131, 246, 0.18)", fg: "#1d4ed8" };
    if (status === "rejected") return { label: "未通過", bg: "rgba(255, 77, 79, 0.16)", fg: "#dc2626" };
    return { label: "未提交", bg: "#f3f4f6", fg: "#374151" };
  }, [status]);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        padding: "0 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: "-0.2px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

type SelectOption = { value: string; label: string };

function SelectField({
  label,
  value,
  onChange,
  placeholder,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  options: SelectOption[];
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: 40,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          color: value ? "#111827" : "#9ca3af",
          padding: "0 12px",
          fontSize: 14,
          fontWeight: 800,
          outline: "none",
          appearance: "none",
        }}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ color: "#111827" }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RadioChip({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: checked ? "rgba(34,131,246,0.18)" : "#ffffff",
        color: checked ? "#111827" : "#374151",
        fontSize: 12,
        fontWeight: 900,
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          border: "2px solid #9ca3af",
          background: checked ? "rgba(34,131,246,0.95)" : "transparent",
          boxShadow: checked ? "0 0 0 3px rgba(34,131,246,0.18)" : "none",
        }}
      />
      {label}
    </button>
  );
}

function UiIcon({ href, size = 18, opacity = 0.92 }: { href: string; size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ opacity }}>
      <use href={href} />
    </svg>
  );
}

export default function KycPage() {
  return (
    <Suspense fallback={null}>
      <KycPageInner />
    </Suspense>
  );
}

function KycPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);

  const [kyc, setKyc] = useState<KycRecord>({ status: "not_started" });
  const [userId, setUserId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [pep, setPep] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function applyRecordToForm(r: KycRecord) {
    setFirstName(r.firstName ?? "");
    setLastName(r.lastName ?? "");
    setBirthDay(r.birthDay ?? "");
    setBirthMonth(r.birthMonth ?? "");
    setBirthYear(r.birthYear ?? "");
    setCountry(r.country ?? "");
    setCity(r.city ?? "");
    setPostalCode(r.postalCode ?? "");
    setAddress(r.address ?? "");
    setPep(typeof r.pep === "boolean" ? r.pep : null);
  }

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) {
      window.setTimeout(() => {
        const r = readKyc();
        setUserId(null);
        setKyc(r);
        applyRecordToForm(r);
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
          const r = readKyc();
          if (r.status === "reviewing" && typeof r.submittedAt === "number") {
            const age = Date.now() - r.submittedAt;
            if (age > 20_000) {
              const approved: KycRecord = { ...r, status: "approved", reviewedAt: Date.now() };
              writeKyc(approved);
              setKyc(approved);
              applyRecordToForm(approved);
              return;
            }
          }
          setKyc(r);
          applyRecordToForm(r);
          return;
        }

        const { data: row, error } = await sb
          .from("kyc_applications")
          .select("status, payload")
          .eq("user_id", uid)
          .maybeSingle();
        if (error) throw error;

        if (!row) {
          setKyc({ status: "not_started" });
          applyRecordToForm({ status: "not_started" });
          return;
        }

        const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
        const status: KycStatus =
          row.status === "approved" || row.status === "reviewing" || row.status === "rejected" ? (row.status as KycStatus) : "not_started";

        const birthdayRaw = typeof payload.birthday === "string" ? payload.birthday : undefined;
        const [birthYearFromBirthday, birthMonthFromBirthday, birthDayFromBirthday] =
          birthdayRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw) ? birthdayRaw.split("-") : [undefined, undefined, undefined];

        const r: KycRecord = {
          status,
          submittedAt: typeof payload.submittedAt === "number" ? payload.submittedAt : undefined,
          reviewedAt: typeof payload.reviewedAt === "number" ? payload.reviewedAt : undefined,
          name: typeof payload.name === "string" ? payload.name : undefined,
          birthday: birthdayRaw,
          firstName: typeof payload.firstName === "string" ? payload.firstName : undefined,
          lastName: typeof payload.lastName === "string" ? payload.lastName : undefined,
          birthDay: typeof payload.birthDay === "string" ? payload.birthDay : birthDayFromBirthday,
          birthMonth: typeof payload.birthMonth === "string" ? payload.birthMonth : birthMonthFromBirthday,
          birthYear: typeof payload.birthYear === "string" ? payload.birthYear : birthYearFromBirthday,
          country: typeof payload.country === "string" ? payload.country : undefined,
          city: typeof payload.city === "string" ? payload.city : undefined,
          postalCode: typeof payload.postalCode === "string" ? payload.postalCode : undefined,
          address: typeof payload.address === "string" ? payload.address : undefined,
          pep: typeof payload.pep === "boolean" ? payload.pep : undefined,
          rejectReason: typeof payload.rejectReason === "string" ? payload.rejectReason : undefined,
        };

        if (r.status === "reviewing" && typeof r.submittedAt === "number") {
          const age = Date.now() - r.submittedAt;
          if (age > 20_000) {
            const approved: KycRecord = { ...r, status: "approved", reviewedAt: Date.now() };
            await sb
              .from("kyc_applications")
              .update({ status: "approved", payload: { ...payload, status: "approved", reviewedAt: approved.reviewedAt } })
              .eq("user_id", uid);
            setKyc(approved);
            applyRecordToForm(approved);
            return;
          }
        }

        setKyc(r);
        applyRecordToForm(r);
      } catch (e) {
        const r = readKyc();
        setUserId(null);
        setKyc(r);
        applyRecordToForm(r);
        setErrorMsg(e instanceof Error ? e.message : "KYC 讀取失敗");
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
    if (kyc.status !== "approved") return;
    if (!next) return;
    router.push(next);
  }, [kyc.status, next, router]);

  function submit() {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const day = birthDay.trim();
    const month = birthMonth.trim();
    const year = birthYear.trim();
    const ctry = country.trim();
    const c = city.trim();
    const addr = address.trim();
    const isPep = pep === true;
    if (!fn || !ln || !day || !month || !year || !ctry || !c || !addr) return;

    const dd = String(day).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    const yyyy = String(year).padStart(4, "0");
    const bd = `${yyyy}-${mm}-${dd}`;
    const nm = `${fn} ${ln}`.trim();

    const reviewing: KycRecord = {
      status: "reviewing",
      submittedAt: Date.now(),
      name: nm,
      birthday: bd,
      firstName: fn,
      lastName: ln,
      birthDay: dd,
      birthMonth: mm,
      birthYear: yyyy,
      country: ctry,
      city: c,
      postalCode: postalCode.trim(),
      address: addr,
      pep: isPep,
    };
    writeKyc(reviewing);
    setKyc(reviewing);
    setSubmitting(true);
    setErrorMsg(null);

    if (userId) {
      const supabase = supabaseBrowser();
      if (!supabase) return;
      void supabase
        .from("kyc_applications")
        .upsert({ user_id: userId, status: "reviewing", payload: { ...reviewing } }, { onConflict: "user_id" })
        .then(({ error }) => {
          if (error) setErrorMsg(error.message);
        });
    }

    window.setTimeout(() => {
      const approved: KycRecord = { ...reviewing, status: "approved", reviewedAt: Date.now() };
      writeKyc(approved);
      setKyc(approved);
      setSubmitting(false);
      if (userId) {
        const supabase = supabaseBrowser();
        if (!supabase) return;
        void supabase
          .from("kyc_applications")
          .update({ status: "approved", payload: { ...approved } })
          .eq("user_id", userId)
          .then(({ error }) => {
            if (error) setErrorMsg(error.message);
          });
      }
    }, 1200);
  }

  const formLocked = submitting || kyc.status === "reviewing";
  const canSubmit =
    !formLocked &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!birthDay.trim() &&
    !!birthMonth.trim() &&
    !!birthYear.trim() &&
    !!country.trim() &&
    !!city.trim() &&
    !!address.trim() &&
    pep !== null;

  function noop() {}

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

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby} style={{ width: "100%" }}>
            <PageHeader
              title="帳戶"
              right={
                next ? (
                  <Button3D
                    color="blue"
                    onClick={() => router.push(next)}
                    disabled={kyc.status !== "approved"}
                    style={{ height: 36, borderRadius: 12, opacity: kyc.status === "approved" ? 1 : 0.6 }}
                  >
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
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 12, width: "100%" }}>
              {errorMsg ? (
                <SurfaceCard style={{ borderRadius: 14, background: "rgba(255,77,79,0.10)", padding: "10px 12px" }}>
                  <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 900 }}>{errorMsg}</div>
                </SurfaceCard>
              ) : null}
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                  alignItems: "start",
                  width: "100%",
                }}
              >
                <SurfaceCard style={{ borderRadius: 18, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 950, color: "#111827" }}>KYC 驗證</div>
                    <StatusPill status={kyc.status} />
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: 1.7 }}>
                    我們會盡最大努力，並採取必要措施以確保您的資料安全。完成驗證後，將能解鎖更完整的功能。
                  </div>
                  <div
                    aria-hidden
                    style={{
                      marginTop: 14,
                      borderRadius: 16,
                      height: 220,
                      background: "linear-gradient(135deg, #f3f4f6, #f9fafb)",
                      border: "1px solid #e5e7eb",
                    }}
                  />
                </SurfaceCard>

                <SurfaceCard style={{ borderRadius: 18, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {[
                        { label: "步驟 01", active: true },
                        { label: "步驟 02", active: false },
                        { label: "步驟 03", active: false },
                      ].map((s) => (
                        <div
                          key={s.label}
                          style={{
                            height: 32,
                            padding: "0 12px",
                            borderRadius: 999,
                            display: "inline-flex",
                            alignItems: "center",
                            border: "1px solid #e5e7eb",
                            background: s.active ? "rgba(34,131,246,0.22)" : "#ffffff",
                            color: s.active ? "#111827" : "#9ca3af",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {s.label}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#dc2626", fontSize: 12, fontWeight: 900 }}>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "rgba(255,77,79,0.92)" }} />
                      需要採取的行動
                    </div>
                  </div>

                  {kyc.status === "approved" ? (
                    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>
                        已完成驗證{typeof kyc.reviewedAt === "number" ? `（${new Date(kyc.reviewedAt).toLocaleString("zh-TW")}）` : ""}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <SecondaryButton
                          onClick={() => {
                            const nextKyc: KycRecord = { status: "not_started" };
                            writeKyc(nextKyc);
                            setKyc(nextKyc);
                            applyRecordToForm(nextKyc);
                            setErrorMsg(null);
                            if (userId) {
                              const supabase = supabaseBrowser();
                              if (!supabase) return;
                              void supabase
                                .from("kyc_applications")
                                .delete()
                                .eq("user_id", userId)
                                .then(({ error }) => {
                                  if (error) setErrorMsg(error.message);
                                });
                            }
                          }}
                          style={{ background: "#f3f4f6", color: "#111827" }}
                        >
                          重新提交
                        </SecondaryButton>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                        <TextField label="名字" value={firstName} onChange={formLocked ? noop : setFirstName} placeholder="名字" />
                        <TextField label="姓氏" value={lastName} onChange={formLocked ? noop : setLastName} placeholder="姓氏" />
                      </div>

                      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                        <SelectField
                          label="出生日期"
                          value={birthDay}
                          onChange={formLocked ? noop : setBirthDay}
                          placeholder="出生日期"
                          disabled={formLocked}
                          options={Array.from({ length: 31 }).map((_, idx) => {
                            const v = String(idx + 1).padStart(2, "0");
                            return { value: v, label: v };
                          })}
                        />
                        <SelectField
                          label="出生月份"
                          value={birthMonth}
                          onChange={formLocked ? noop : setBirthMonth}
                          placeholder="出生月份"
                          disabled={formLocked}
                          options={Array.from({ length: 12 }).map((_, idx) => {
                            const v = String(idx + 1).padStart(2, "0");
                            return { value: v, label: v };
                          })}
                        />
                        <SelectField
                          label="出生年份"
                          value={birthYear}
                          onChange={formLocked ? noop : setBirthYear}
                          placeholder="出生年份"
                          disabled={formLocked}
                          options={Array.from({ length: 70 }).map((_, idx) => {
                            const v = String(2010 - idx);
                            return { value: v, label: v };
                          })}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                        <SelectField
                          label="您的國家"
                          value={country}
                          onChange={formLocked ? noop : setCountry}
                          placeholder="您的國家"
                          disabled={formLocked}
                          options={[
                            { value: "TW", label: "台灣" },
                            { value: "HK", label: "香港" },
                            { value: "JP", label: "日本" },
                            { value: "US", label: "美國" },
                            { value: "OTHER", label: "其他" },
                          ]}
                        />
                        <TextField label="您的城市" value={city} onChange={formLocked ? noop : setCity} placeholder="您的城市" />
                        <TextField label="郵遞區號（選填）" value={postalCode} onChange={formLocked ? noop : setPostalCode} placeholder="郵遞區號（選填）" inputMode="numeric" />
                      </div>

                      <TextField label="居住地址" value={address} onChange={formLocked ? noop : setAddress} placeholder="居住地址" />

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>我是否政治公眾人物</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <RadioChip label="No" checked={pep === false} onClick={formLocked ? noop : () => setPep(false)} />
                          <RadioChip label="Yes" checked={pep === true} onClick={formLocked ? noop : () => setPep(true)} />
                        </div>
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 750, color: "#6b7280" }}>所有資料都經過安全存儲和加密。</div>

                      {kyc.status === "rejected" && kyc.rejectReason ? (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626" }}>未通過原因：{kyc.rejectReason}</div>
                      ) : null}

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button3D
                          color="blue"
                          disabled={!canSubmit}
                          onClick={submit}
                          style={{ height: 40, borderRadius: 12, opacity: canSubmit ? 1 : 0.6 }}
                        >
                          {kyc.status === "reviewing" ? "審核中..." : "提交"}
                        </Button3D>
                      </div>
                    </div>
                  )}
                </SurfaceCard>
              </div>

              <SecondaryButton onClick={() => router.back()} style={{ width: 220 }}>
                返回
              </SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
