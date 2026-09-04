"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SurfaceCard } from "@/cardx/components/ui/Kit";

export default function RewardsPage() {
  const CLAIMED_KEY = "cardx.rewards.claimed.byId";
  type Reward = {
    id: string;
    title: string;
    description: string;
    points: number;
    claimed: boolean;
  };

  const [claimedById, setClaimedById] = useState<Record<string, boolean>>({});

  const rewards = useMemo<Reward[]>(
    () => [
      { id: "r-1", title: "今日登入", description: "每日領取一次。", points: 500, claimed: false },
      { id: "r-2", title: "完成任務：收藏 3 個商品", description: "前往任務頁查看進度。", points: 800, claimed: false },
      { id: "r-3", title: "完成任務：瀏覽 10 個市集商品", description: "前往任務頁查看進度。", points: 1200, claimed: false },
      { id: "r-4", title: "本週活躍獎勵", description: "本週累積行為達成後可領取。", points: 3500, claimed: false },
    ],
    []
  );

  const tiers = useMemo(
    () => [
      { level: "Bronze", need: 0, perks: ["基本任務獎勵", "收藏與近期功能"] },
      { level: "Silver", need: 10_000, perks: ["更高任務加成", "更多推薦內容"] },
      { level: "Gold", need: 30_000, perks: ["活動優先權", "更高獎勵倍率"] },
    ],
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

  const basePoints = 18_420;
  const earnedPoints = useMemo(() => {
    return rewards.reduce((sum, r) => (claimedById[r.id] || r.claimed ? sum + r.points : sum), 0);
  }, [claimedById, rewards]);
  const totalPoints = basePoints + earnedPoints;
  const nextTierNeed = tiers[1]?.need ?? 10_000;
  const tierPct = Math.min(1, totalPoints / nextTierNeed);

  function claimReward(id: string) {
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
            <PageHeader title="獎勵" subtitle="points、等級與可領取獎勵" />

            <SurfaceCard style={{ marginTop: 14, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.72)" }}>目前 points</div>
                <div style={{ fontSize: 18, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{totalPoints.toLocaleString()}</div>
              </div>
              <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${tierPct * 100}%`, height: "100%", background: "rgba(34,131,246,0.80)" }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.58)" }}>
                距離 Silver 還差 {(nextTierNeed - totalPoints).toLocaleString()} points
              </div>
            </SurfaceCard>

            <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", width: "100%" }}>
              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>可領取</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {rewards.map((r) => {
                    const claimed = claimedById[r.id] || r.claimed;
                    return (
                      <div
                        key={r.id}
                        style={{
                          borderRadius: 16,
                          background: "rgba(255,255,255,0.06)",
                          padding: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>{r.title}</div>
                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: "rgba(255,255,255,0.58)" }}>{r.description}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
                          <Pill tone="muted">+{r.points.toLocaleString()}</Pill>
                          <Button3D color="blue" disabled={claimed} onClick={() => claimReward(r.id)} style={{ height: 34, borderRadius: 12, opacity: claimed ? 0.55 : 1 }}>
                            {claimed ? "已領取" : "領取"}
                          </Button3D>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SurfaceCard>

              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>等級福利</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {tiers.map((t) => (
                    <div key={t.level} style={{ borderRadius: 16, background: "rgba(255,255,255,0.06)", padding: 12, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>{t.level}</div>
                        <Pill tone="muted">{t.need.toLocaleString()} pts</Pill>
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {t.perks.map((p) => (
                          <div key={p} style={{ fontSize: 12, fontWeight: 750, color: "rgba(255,255,255,0.62)" }}>
                            {p}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
