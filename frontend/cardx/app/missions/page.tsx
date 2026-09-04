"use client";

/**
 * 任務（桌機版）—— 接真任務系統，與手機版 /mission 同一組資料：
 *   ・任務清單／進度：get_user_missions（登入）／tasks 表（訪客，全部當未完成）
 *   ・領取獎勵：claim_task_reward
 *   ・每日簽到：get_check_in_status／daily_check_in
 *
 * 原本這頁是七筆寫死的假任務，領取狀態存 localStorage（重整就回不去、也不會真的加積分），
 * 整段刪掉。訪客照樣看得到任務清單（跟手機版一樣，簽到頁本身就是招募畫面），
 * 按簽到／領取才請他登入。
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { MissionService } from "@/services/mission";
import { useToast } from "@/components/ui/Toast";

type TabKey = "daily" | "weekly" | "achievement";

type MissionRow = {
  id: string;
  title: string;
  description: string;
  type: TabKey;
  reward: number;
  progress: number;
  target: number;
  conditionType: string;
  periodKey: string | null;
  claimed: boolean;
  completed: boolean;
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "daily", label: "每日" },
  { key: "weekly", label: "每週" },
  { key: "achievement", label: "成就" },
];

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        height: 42,
        border: 0,
        borderRadius: 10,
        padding: "0 14px",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 650,
        transition: "all 200ms ease",
        background: active ? "#ffffff" : "transparent",
        color: active ? "#111827" : "#6b7280",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06), 0 4px 12px -6px rgba(0,0,0,0.12)" : "none",
      }}
    >
      {label}
    </button>
  );
}

/** 任務沒做完時，「前往」該去哪一頁 —— 與手機版同一套判斷 */
function targetHref(m: MissionRow): { label: string; href: string } {
  const t = m.title;
  if (m.conditionType === "invite_friend" || m.conditionType === "share_invite") return { label: "去邀請好友", href: "/invite" };
  if (m.conditionType === "bind_phone" || t.includes("手機") || t.includes("驗證")) return { label: "去設定", href: "/account" };
  if (m.conditionType === "recharge" || m.conditionType === "recharge_amount" || m.conditionType === "topup_streak" || t.includes("儲值"))
    return { label: "去儲值", href: "/topup" };
  if (m.conditionType === "sell_item" || t.includes("上架")) return { label: "去交易所", href: "/market" };
  return { label: "去逛逛", href: "/" };
}

export default function MissionsPage() {
  return (
    <Suspense fallback={null}>
      <MissionsPageInner />
    </Suspense>
  );
}

function MissionsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const userId = user?.id;

  const tabParam = (searchParams?.get("tab") ?? "").trim().toLowerCase();
  const initialTab: TabKey = tabParam === "weekly" ? "weekly" : tabParam === "achievement" || tabParam === "achievements" ? "achievement" : "daily";
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const [totalDays, setTotalDays] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    setTab((prev) => (prev === initialTab ? prev : initialTab));
  }, [initialTab]);

  const goTab = useCallback(
    (next: TabKey) => {
      setTab(next);
      router.replace(next === "daily" ? "/missions" : `/missions?tab=${next}`);
    },
    [router],
  );

  const fetchMissions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await MissionService.getUserMissions();
      setMissions(
        (data ?? []).map((m) => ({
          id: String(m.id),
          title: m.title,
          description: m.description || "",
          type: (m.type as TabKey) || "daily",
          reward: Number(m.reward_coins) || 0,
          progress: Number(m.progress) || 0,
          target: Number(m.target_value) || 0,
          conditionType: String(m.condition_type || ""),
          periodKey: m.period_key ?? null,
          claimed: !!m.is_claimed,
          completed: !!m.is_completed,
        })),
      );
    } catch {
      setMissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 訪客的任務清單：讀公開的 tasks 表，全部當未完成（get_user_missions 是照登入者算的） */
  const fetchPublicTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await createClient()
        .from("tasks")
        .select("id, type, title, description, target_value, reward_coins, condition_type, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setMissions(
        (data ?? []).map((t) => ({
          id: String(t.id),
          title: String(t.title),
          description: String(t.description ?? ""),
          type: (t.type as TabKey) || "daily",
          reward: Number(t.reward_coins) || 0,
          progress: 0,
          target: Number(t.target_value) || 0,
          conditionType: String(t.condition_type ?? ""),
          periodKey: null,
          claimed: false,
          completed: false,
        })),
      );
    } catch {
      setMissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCheckIn = useCallback(async () => {
    if (!userId) return;
    const { data } = await createClient().rpc("get_check_in_status", { p_user_id: userId });
    if (data) {
      setTotalDays(Number(data.total_days) || 0);
      setCheckedInToday(!!data.checked_in_today);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchMissions();
      fetchCheckIn();
    } else if (!authLoading) {
      fetchPublicTasks();
    }
  }, [userId, authLoading, fetchMissions, fetchCheckIn, fetchPublicTasks]);

  const handleCheckIn = useCallback(async () => {
    if (!userId) {
      router.push("/login");
      return;
    }
    if (checkingIn || checkedInToday) return;
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
        fetchMissions();
      } else {
        showToast(data?.message || "今天已經簽到過了", "info");
        setCheckedInToday(true);
      }
    } catch {
      showToast("簽到失敗，請再試一次", "error");
    } finally {
      setCheckingIn(false);
    }
  }, [userId, checkingIn, checkedInToday, router, showToast, refreshProfile, fetchCheckIn, fetchMissions]);

  const handleClaim = useCallback(
    async (m: MissionRow) => {
      if (!userId) {
        router.push("/login");
        return;
      }
      if (!m.periodKey || claiming) return;
      setClaiming(m.id);
      try {
        await MissionService.claimReward(m.id, m.periodKey);
        showToast(`領取成功！獲得 ${m.reward} 積分`, "success");
        await refreshProfile();
        await fetchMissions();
      } catch {
        showToast("領取失敗，請再試一次", "error");
      } finally {
        setClaiming(null);
      }
    },
    [userId, claiming, router, showToast, refreshProfile, fetchMissions],
  );

  const shown = useMemo(() => missions.filter((m) => m.type === tab), [missions, tab]);
  const claimableCount = useMemo(() => missions.filter((m) => m.completed && !m.claimed).length, [missions]);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader
              title="任務"
              subtitle="完成任務領積分"
              right={
                user ? (
                  <Pill tone="info">目前 {Number(user.points || 0).toLocaleString()} 積分</Pill>
                ) : (
                  <SecondaryButton href="/login">登入看進度</SecondaryButton>
                )
              }
            />

            {/* 每日簽到 */}
            <SurfaceCard style={{ marginTop: 14, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 950, color: "#111827" }}>每日簽到</div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: "#6b7280" }}>
                    {user ? `已累積簽到 ${totalDays} 天${checkedInToday ? "，今天已經簽過了" : "，今天還沒簽到"}` : "登入後每天簽到就能領積分"}
                  </div>
                </div>
                <Button3D
                  color="red"
                  disabled={!!user && (checkedInToday || checkingIn)}
                  onClick={handleCheckIn}
                  style={{ height: 42, borderRadius: 12, minWidth: 132 }}
                >
                  {!user ? "登入後簽到" : checkedInToday ? "今天已簽到" : checkingIn ? "簽到中…" : "立即簽到"}
                </Button3D>
              </div>
            </SurfaceCard>

            <div style={{ marginTop: 14, width: "100%" }}>
              <SurfaceCard style={{ padding: 6, background: "#f9fafb" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {TABS.map((t) => (
                    <TabButton key={t.key} active={tab === t.key} label={t.label} onClick={() => goTab(t.key)} />
                  ))}
                </div>
              </SurfaceCard>
            </div>

            {user && claimableCount > 0 ? (
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, color: "#6b7280" }}>
                有 {claimableCount} 個任務已完成，記得領獎勵。
              </div>
            ) : null}

            <div style={{ marginTop: 14, display: "grid", gap: 12, width: "100%" }}>
              {loading ? (
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", width: "100%" }}>
                  {[0, 1, 2, 3].map((i) => (
                    <SurfaceCard key={i} style={{ borderRadius: 16 }}>
                      <div style={{ height: 16, width: "60%", borderRadius: 6, background: "#f3f4f6" }} />
                      <div style={{ marginTop: 10, height: 12, width: "85%", borderRadius: 6, background: "#f3f4f6" }} />
                      <div style={{ marginTop: 16, height: 8, borderRadius: 999, background: "#f3f4f6" }} />
                    </SurfaceCard>
                  ))}
                </div>
              ) : shown.length === 0 ? (
                <SurfaceCard style={{ padding: 28, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>這個分頁還沒有任務</div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 750, color: "#6b7280" }}>換個分頁看看，新任務上線時會出現在這裡。</div>
                </SurfaceCard>
              ) : (
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", width: "100%" }}>
                  {shown.map((m) => {
                    const pct = m.target <= 0 ? (m.completed ? 1 : 0) : Math.min(1, Math.max(0, m.progress / m.target));
                    const go = targetHref(m);
                    return (
                      <SurfaceCard key={m.id} style={{ borderRadius: 16, background: "#ffffff" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>{m.title}</div>
                            {m.description ? (
                              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: "#6b7280" }}>{m.description}</div>
                            ) : null}
                          </div>
                          <Pill tone="muted">+{m.reward.toLocaleString()} 積分</Pill>
                        </div>

                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                          <div style={{ height: 8, borderRadius: 999, background: "#f3f4f6", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${pct * 100}%`,
                                height: "100%",
                                background: m.completed ? "rgba(102,187,106,0.85)" : "rgb(var(--primary))",
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                              {user ? `進度 ${Math.min(m.progress, m.target || m.progress)}/${m.target}` : `目標 ${m.target}`}
                            </div>
                            {!user ? (
                              <SecondaryButton href="/login" style={{ height: 36, borderRadius: 12 }}>
                                登入後開始
                              </SecondaryButton>
                            ) : m.claimed ? (
                              <SecondaryButton disabled style={{ height: 36, borderRadius: 12 }}>
                                已領取
                              </SecondaryButton>
                            ) : m.completed ? (
                              <Button3D
                                color="green"
                                disabled={claiming === m.id}
                                onClick={() => handleClaim(m)}
                                style={{ height: 36, borderRadius: 12 }}
                              >
                                {claiming === m.id ? "領取中…" : "領取"}
                              </Button3D>
                            ) : (
                              <SecondaryButton onClick={() => router.push(go.href)} style={{ height: 36, borderRadius: 12 }}>
                                {go.label}
                              </SecondaryButton>
                            )}
                          </div>
                        </div>
                      </SurfaceCard>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
