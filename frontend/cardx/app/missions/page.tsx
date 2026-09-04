"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";

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
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.58)",
        boxShadow: active ? "0 1px 0 rgba(255,255,255,0.06), 0 4px 18px rgba(0,0,0,0.25)" : "none",
      }}
    >
      {label}
    </button>
  );
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
  const CLAIMED_KEY = "cardx.missions.claimed.byId";
  type TabKey = "daily" | "weekly" | "achievements";
  const tabParamRaw = (searchParams?.get("tab") ?? "").trim().toLowerCase();
  const [tab, setTab] = useState<TabKey>(tabParamRaw === "weekly" || tabParamRaw === "achievements" ? (tabParamRaw as TabKey) : "daily");
  const [claimedById, setClaimedById] = useState<Record<string, boolean>>({});

  type Mission = {
    id: string;
    title: string;
    description: string;
    progress: number;
    target: number;
    rewardPoints: number;
    actionLabel: string;
    actionHref: string;
  };

  const missions = useMemo<Record<TabKey, Mission[]>>(
    () => ({
      daily: [
        {
          id: "d-1",
          title: "瀏覽 10 個市集商品",
          description: "提升曝光與成交機會。",
          progress: 4,
          target: 10,
          rewardPoints: 1200,
          actionLabel: "前往市集",
          actionHref: "/market",
        },
        {
          id: "d-2",
          title: "收藏 3 個你喜歡的商品",
          description: "收藏後可在「收藏」頁快速回訪。",
          progress: 1,
          target: 3,
          rewardPoints: 800,
          actionLabel: "去收藏",
          actionHref: "/favorites",
        },
        {
          id: "d-3",
          title: "查看 5 個卡包詳情",
          description: "了解庫存與公平性資訊。",
          progress: 2,
          target: 5,
          rewardPoints: 1000,
          actionLabel: "前往卡包",
          actionHref: "/packs",
        },
      ],
      weekly: [
        {
          id: "w-1",
          title: "本週完成 3 次交換瀏覽",
          description: "查看交換詳情，探索媒合機會。",
          progress: 1,
          target: 3,
          rewardPoints: 3000,
          actionLabel: "前往交換",
          actionHref: "/trades",
        },
        {
          id: "w-2",
          title: "本週收藏 10 個商品/卡包",
          description: "建立你的追蹤清單。",
          progress: 3,
          target: 10,
          rewardPoints: 3500,
          actionLabel: "去收藏",
          actionHref: "/favorites",
        },
      ],
      achievements: [
        {
          id: "a-1",
          title: "累積瀏覽 100 個市集商品",
          description: "成為資深收藏家。",
          progress: 42,
          target: 100,
          rewardPoints: 12000,
          actionLabel: "前往市集",
          actionHref: "/market",
        },
        {
          id: "a-2",
          title: "累積查看 30 個交換詳情",
          description: "更容易找到好交換。",
          progress: 12,
          target: 30,
          rewardPoints: 9000,
          actionLabel: "前往交換",
          actionHref: "/trades",
        },
      ],
    }),
    []
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLAIMED_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      window.setTimeout(() => setClaimedById(parsed as Record<string, boolean>), 0);
    } catch {}
  }, []);

  useEffect(() => {
    const desired: TabKey = tabParamRaw === "weekly" || tabParamRaw === "achievements" ? (tabParamRaw as TabKey) : "daily";
    setTab((prev) => (prev === desired ? prev : desired));
  }, [tabParamRaw]);

  useEffect(() => {
    const url = tab === "daily" ? "/missions" : `/missions?tab=${tab}`;
    router.replace(url);
  }, [router, tab]);

  function claimMission(id: string) {
    setClaimedById((prev) => {
      const next = { ...prev, [id]: true };
      try {
        window.localStorage.setItem(CLAIMED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="任務" subtitle="完成行為任務獲得 points" />

            <div style={{ marginTop: 14, width: "100%" }}>
              <SurfaceCard style={{ padding: 6, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <TabButton active={tab === "daily"} label="每日" onClick={() => setTab("daily")} />
                  <TabButton active={tab === "weekly"} label="每週" onClick={() => setTab("weekly")} />
                  <TabButton active={tab === "achievements"} label="成就" onClick={() => setTab("achievements")} />
                </div>
              </SurfaceCard>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 12, width: "100%" }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", width: "100%" }}>
                {missions[tab].map((m) => {
                  const pct = m.target <= 0 ? 0 : Math.min(1, Math.max(0, m.progress / m.target));
                  const done = m.progress >= m.target;
                  const claimed = !!claimedById[m.id];
                  return (
                    <SurfaceCard key={m.id} style={{ borderRadius: 16, background: "rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>{m.title}</div>
                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: "rgba(255,255,255,0.58)" }}>{m.description}</div>
                        </div>
                        <Pill tone="muted">+{m.rewardPoints.toLocaleString()} pts</Pill>
                      </div>

                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <div style={{ width: `${pct * 100}%`, height: "100%", background: done ? "rgba(102,187,106,0.85)" : "rgba(34,131,246,0.80)" }} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.62)" }}>
                            進度 {m.progress}/{m.target}
                          </div>
                          {done ? (
                            <Button3D
                              color="green"
                              disabled={claimed}
                              onClick={() => claimMission(m.id)}
                              style={{ height: 36, borderRadius: 12, opacity: claimed ? 0.55 : 1 }}
                            >
                              {claimed ? "已領取" : "領取"}
                            </Button3D>
                          ) : (
                            <SecondaryButton onClick={() => router.push(m.actionHref)} style={{ height: 36, borderRadius: 12 }}>
                              {m.actionLabel}
                            </SecondaryButton>
                          )}
                        </div>
                      </div>
                    </SurfaceCard>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
