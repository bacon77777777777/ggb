"use client";

/**
 * 獎勵（桌機版）—— 把平台真的有的獎勵集中在這一頁：
 *   ・每日簽到（get_check_in_status／daily_check_in，與任務頁同一組）
 *   ・我的優惠券（user_coupons ＋ coupons）
 *   ・邀請好友（/api/user/referral-status，每 5 位有效邀請領 100 積分）
 *   ・我的稱號（user_titles ＋ titles）
 *
 * 原本這頁是 Bronze／Silver／Gold 三級會員制度＋四筆假的可領獎勵（存 localStorage）。
 * 平台沒有等級制度，整段刪掉，不留殼。
 */

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

type Coupon = {
  id: string;
  title: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  minSpend: number;
  expiryDate: string | null;
  status: string;
};

type TitleRow = { id: string; name: string; selected: boolean };

type Referral = {
  qualified: number;
  claimable: number;
  step: number;
  pointsPerStep: number;
  cycleProgress: number;
  nextTarget: number;
};

function couponAmount(c: Coupon) {
  if (c.discountType === "percentage") return `${c.discountValue} % OFF`;
  return `折 ${Number(c.discountValue).toLocaleString()} 元`;
}

function ymd(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>{children}</div>
      {right}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 750, color: "#6b7280", padding: "10px 0" }}>{children}</div>;
}

export default function RewardsPage() {
  const { user, isLoading: authLoading, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const userId = user?.id;

  const [totalDays, setTotalDays] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [titles, setTitles] = useState<TitleRow[] | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [claimingReferral, setClaimingReferral] = useState(false);

  const fetchCheckIn = useCallback(async () => {
    if (!userId) return;
    const { data } = await createClient().rpc("get_check_in_status", { p_user_id: userId });
    if (data) {
      setTotalDays(Number(data.total_days) || 0);
      setCheckedInToday(!!data.checked_in_today);
    }
  }, [userId]);

  const fetchReferral = useCallback(async () => {
    try {
      const res = await fetch("/api/user/referral-status");
      if (!res.ok) throw new Error("failed");
      setReferral((await res.json()) as Referral);
    } catch {
      setReferral(null);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      if (!authLoading) {
        setCoupons([]);
        setTitles([]);
      }
      return;
    }
    const supabase = createClient();

    fetchCheckIn();
    fetchReferral();

    (async () => {
      const { data } = await supabase
        .from("user_coupons")
        .select("id, status, expiry_date, coupons ( title, description, discount_type, discount_value, min_spend )")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        status: string;
        expiry_date: string | null;
        coupons: { title: string; description: string | null; discount_type: string; discount_value: number; min_spend: number } | null;
      }>;
      setCoupons(
        rows
          .filter((r) => r.coupons)
          .map((r) => ({
            id: String(r.id),
            title: r.coupons!.title,
            description: r.coupons!.description,
            discountType: r.coupons!.discount_type,
            discountValue: Number(r.coupons!.discount_value) || 0,
            minSpend: Number(r.coupons!.min_spend) || 0,
            expiryDate: r.expiry_date,
            status: String(r.status ?? "unused"),
          })),
      );
    })();

    (async () => {
      const [{ data: all }, { data: mine }] = await Promise.all([
        supabase.from("titles").select("id, name, sort_order").order("sort_order"),
        supabase.from("user_titles").select("title_id, is_selected").eq("user_id", userId),
      ]);
      const earned = new Map((mine ?? []).map((t) => [String(t.title_id), !!t.is_selected]));
      setTitles(
        (all ?? [])
          .filter((t) => earned.has(String(t.id)))
          .map((t) => ({ id: String(t.id), name: String(t.name), selected: earned.get(String(t.id)) === true })),
      );
    })();
  }, [userId, authLoading, fetchCheckIn, fetchReferral]);

  const handleCheckIn = useCallback(async () => {
    if (!userId || checkingIn || checkedInToday) return;
    setCheckingIn(true);
    try {
      const { data, error } = await createClient().rpc("daily_check_in", { p_user_id: userId });
      if (error) throw error;
      if (data?.success) {
        showToast(`簽到成功！獲得 ${data.reward} 積分`, "success");
        setCheckedInToday(true);
        if (typeof data.total_days === "number") setTotalDays(data.total_days);
        await refreshProfile();
        fetchCheckIn();
      } else {
        showToast(data?.message || "今天已經簽到過了", "info");
        setCheckedInToday(true);
      }
    } catch {
      showToast("簽到失敗，請再試一次", "error");
    } finally {
      setCheckingIn(false);
    }
  }, [userId, checkingIn, checkedInToday, showToast, refreshProfile, fetchCheckIn]);

  const handleClaimReferral = useCallback(async () => {
    if (claimingReferral) return;
    setClaimingReferral(true);
    try {
      const res = await fetch("/api/user/referral-status", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      showToast("邀請獎勵領取成功", "success");
      await refreshProfile();
      await fetchReferral();
    } catch {
      showToast("領取失敗，請再試一次", "error");
    } finally {
      setClaimingReferral(false);
    }
  }, [claimingReferral, showToast, refreshProfile, fetchReferral]);

  const usableCoupons = (coupons ?? []).filter((c) => c.status === "unused");

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader
              title="獎勵"
              subtitle="簽到、優惠券、邀請好友與稱號"
              right={
                user ? (
                  <Pill tone="info">目前 {Number(user.points || 0).toLocaleString()} 積分</Pill>
                ) : (
                  <SecondaryButton href="/login">登入</SecondaryButton>
                )
              }
            />

            {!user && !authLoading ? (
              <SurfaceCard style={{ marginTop: 14, width: "100%", padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>登入後就能看到你的獎勵</div>
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 750, color: "#6b7280" }}>
                  每天簽到領積分、查看手上的優惠券與稱號，還能邀請好友再賺一筆。
                </div>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                  <Button3D color="red" href="/login" style={{ height: 42, borderRadius: 12, minWidth: 140 }}>
                    前往登入
                  </Button3D>
                </div>
              </SurfaceCard>
            ) : null}

            {/* 每日簽到 */}
            <SurfaceCard style={{ marginTop: 14, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 950, color: "#111827" }}>每日簽到</div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: "#6b7280" }}>
                    {user
                      ? `已累積簽到 ${totalDays} 天${checkedInToday ? "，今天已經簽過了" : "，今天還沒簽到"}`
                      : "每天登入簽到就有積分，連續簽到還會加碼"}
                  </div>
                </div>
                {user ? (
                  <Button3D
                    color="red"
                    disabled={checkedInToday || checkingIn}
                    onClick={handleCheckIn}
                    style={{ height: 42, borderRadius: 12, minWidth: 132 }}
                  >
                    {checkedInToday ? "今天已簽到" : checkingIn ? "簽到中…" : "立即簽到"}
                  </Button3D>
                ) : (
                  <SecondaryButton href="/login" style={{ height: 42, minWidth: 132 }}>
                    登入後簽到
                  </SecondaryButton>
                )}
              </div>
            </SurfaceCard>

            <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", width: "100%" }}>
              {/* 我的優惠券 */}
              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                <SectionTitle right={user && usableCoupons.length ? <Pill tone="success">可用 {usableCoupons.length} 張</Pill> : undefined}>
                  我的優惠券
                </SectionTitle>
                {!user ? (
                  <EmptyLine>登入後可以看到手上的優惠券。</EmptyLine>
                ) : coupons === null ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {[0, 1].map((i) => (
                      <div key={i} style={{ height: 62, borderRadius: 16, background: "#f3f4f6" }} />
                    ))}
                  </div>
                ) : coupons.length === 0 ? (
                  <EmptyLine>目前還沒有優惠券，活動期間發放時會直接進到這裡。</EmptyLine>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {coupons.map((c) => {
                      const unused = c.status === "unused";
                      return (
                        <div
                          key={c.id}
                          style={{
                            borderRadius: 16,
                            background: "#f9fafb",
                            border: "1px solid #e5e7eb",
                            padding: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            opacity: unused ? 1 : 0.6,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>{c.title}</div>
                            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: "#6b7280" }}>
                              {c.description || (c.minSpend > 0 ? `滿 ${c.minSpend.toLocaleString()} 元可用` : "不限金額")}
                              {c.expiryDate ? `・${ymd(c.expiryDate)} 前使用` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
                            <Pill tone={unused ? "info" : "muted"}>{couponAmount(c)}</Pill>
                            {!unused ? <Pill tone="muted">{c.status === "used" ? "已使用" : "已過期"}</Pill> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SurfaceCard>

              {/* 邀請好友 */}
              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                <SectionTitle>邀請好友</SectionTitle>
                {!user ? (
                  <EmptyLine>登入後把邀請連結分享給朋友，好友完成綁定你就有積分。</EmptyLine>
                ) : referral === null ? (
                  <div style={{ height: 92, borderRadius: 16, background: "#f3f4f6" }} />
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 750, color: "#6b7280" }}>
                      每邀請 {referral.step} 位好友完成綁定，就能領 {referral.pointsPerStep} 積分，沒有次數上限。
                    </div>
                    <div>
                      <div style={{ height: 8, borderRadius: 999, background: "#f3f4f6", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${(referral.cycleProgress / Math.max(1, referral.step)) * 100}%`,
                            height: "100%",
                            background: "rgb(var(--primary))",
                          }}
                        />
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                        已成功邀請 {referral.qualified} 位・距離下一次領獎還差 {Math.max(0, referral.nextTarget - referral.qualified)} 位
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <Pill tone={referral.claimable > 0 ? "success" : "muted"}>可領 {referral.claimable.toLocaleString()} 積分</Pill>
                      <div style={{ display: "flex", gap: 8 }}>
                        <SecondaryButton href="/invite" style={{ height: 36, borderRadius: 12 }}>
                          去邀請
                        </SecondaryButton>
                        <Button3D
                          color="green"
                          disabled={referral.claimable <= 0 || claimingReferral}
                          onClick={handleClaimReferral}
                          style={{ height: 36, borderRadius: 12 }}
                        >
                          {claimingReferral ? "領取中…" : "領取"}
                        </Button3D>
                      </div>
                    </div>
                  </div>
                )}
              </SurfaceCard>

              {/* 我的稱號 */}
              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                <SectionTitle>我的稱號</SectionTitle>
                {!user ? (
                  <EmptyLine>登入後這裡會列出你解鎖的稱號。</EmptyLine>
                ) : titles === null ? (
                  <div style={{ height: 62, borderRadius: 16, background: "#f3f4f6" }} />
                ) : titles.length === 0 ? (
                  <EmptyLine>還沒有解鎖任何稱號，多抽多玩就會拿到。</EmptyLine>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {titles.map((t) => (
                      <Pill key={t.id} tone={t.selected ? "success" : "muted"}>
                        {t.name}
                        {t.selected ? "・配戴中" : ""}
                      </Pill>
                    ))}
                  </div>
                )}
              </SurfaceCard>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
