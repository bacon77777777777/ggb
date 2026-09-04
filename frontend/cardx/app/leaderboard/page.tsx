"use client";

import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";

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
        fontWeight: 600,
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

export default function LeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardPageInner />
    </Suspense>
  );
}

function LeaderboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  type TabKey = "weekly" | "all_time";
  const tabParam = searchParams?.get("tab") ?? "";
  const initialTab = tabParam === "all_time" || tabParam === "weekly" ? (tabParam as TabKey) : "weekly";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);

  useEffect(() => {
    if (tabParam === "prizes") {
      router.replace("/leaderboard");
      return;
    }
    const next = tabParam === "all_time" || tabParam === "weekly" ? (tabParam as TabKey) : "weekly";
    window.setTimeout(() => setTab((prev) => (prev === next ? prev : next)), 0);
  }, [router, tabParam]);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  type Entry = {
    rank: number;
    username: string;
    volumeUsd: number;
    pulls: number;
    weeklyPoints: number;
    allTimePoints: number;
  };
  type RankedEntry = Entry & { displayRank: number };

  const entries = useMemo<Entry[]>(() => {
    const base = [
      "AquaChampion1237",
      "BlazeCommander2353",
      "ThunderCollector2834",
      "MintVault12",
      "CardRunner7",
      "NovaShuffler",
      "RikuCollector",
      "AriaStacks",
      "ZenBinder",
      "HanaVault",
      "NoahSleeves",
      "KaiClaw",
      "RyoPacks",
      "EmmaVault",
      "LeoCards",
      "ReiPulls",
      "MikaToploader",
      "KumaBinder",
      "ByteCollector",
      "AceVault",
      "PikaCoddy",
      "Coddy20123",
    ];

    const top = [
      { username: "AquaChampion1237", points: 82_152_632 },
      { username: "BlazeCommander2353", points: 54_819_276 },
      { username: "ThunderCollector2834", points: 27_938_414 },
    ];

    return base.map((name, idx) => {
      const rank = idx + 1;
      const topHit = top.find((t) => t.username === name)?.points ?? null;
      const allTimePoints = topHit ?? Math.max(19_842_330 - idx * 812_438, 412_300);
      const weeklyPoints = topHit ?? Math.max(9_742_280 - idx * 391_140, 98_000);
      const volumeUsd = Math.max(821_524.75 - idx * 27_332.68, 2_140.12);
      const pulls = Math.max(465 - idx * 13, 12);
      return { rank, username: name, volumeUsd, pulls, weeklyPoints, allTimePoints };
    });
  }, []);

  function setTabAndUrl(next: TabKey) {
    setTab(next);
    const url = next === "weekly" ? "/leaderboard" : `/leaderboard?tab=${next}`;
    router.push(url);
  }

  const sorted = useMemo(() => {
    const list = [...entries];
    if (tab === "weekly") return list.sort((a, b) => b.weeklyPoints - a.weeklyPoints);
    return list.sort((a, b) => b.allTimePoints - a.allTimePoints);
  }, [entries, tab]);

  const ranked = useMemo<RankedEntry[]>(() => {
    return sorted.map((e, idx) => ({ ...e, displayRank: idx + 1 }));
  }, [sorted]);

  const topThree = useMemo(() => ranked.slice(0, 3), [ranked]);
  const tableRows = useMemo(() => ranked.slice(3), [ranked]);

  const [winnersTarget] = useState(() => Date.now() + 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 60 * 19 + 1000 * 60 * 38 + 1000 * 56);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timeLeft = useMemo(() => {
    const ms = Math.max(0, winnersTarget - now);
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds };
  }, [now, winnersTarget]);

  function initials(username: string) {
    const raw = username.trim();
    if (!raw) return "?";
    return raw.slice(0, 2).toUpperCase();
  }

  function avatarSrc(_username: string) {
    return "/cardx/placeholder.svg";
  }

  function formatUsd(v: number) {
    return `US$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatInt(v: number) {
    return v.toLocaleString();
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby} style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                flexShrink: 0,
                alignItems: "center",
                alignSelf: "stretch",
                justifyContent: "space-between",
                paddingTop: 4,
                paddingBottom: 4,
                gap: 16,
                flexWrap: "nowrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", width: "auto", minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ display: "flex", alignItems: "center", paddingRight: 1, paddingLeft: 1, overflow: "hidden" }}>
                  <img alt="" src="/cardx/placeholder.svg" style={{ width: 23, height: 24, overflow: "hidden" }} />
                </div>
                <h1
                  style={{
                    display: "flex",
                    alignItems: "center",
                    margin: "0 0 0 8px",
                    width: "auto",
                    height: 24,
                    lineHeight: "24px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    letterSpacing: "-0.36px",
                    color: "#ffffff",
                    fontFamily:
                      'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  排行榜
                </h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", justifyContent: "flex-end", flex: "0 0 auto", minWidth: 0, height: 38 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(17, 25, 35, 0.72)",
                    padding: isMobile ? "6px 8px" : "8px 10px",
                    backdropFilter: "blur(10px)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ color: "rgba(255,255,255,0.58)" }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                    <polyline points="12 6 12 12 16 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {!isMobile ? <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.58)" }}>結算倒數：</span> : null}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.06)",
                        padding: isMobile ? "2px 5px" : "2px 6px",
                        fontSize: isMobile ? 11 : 12,
                        color: "rgba(255,255,255,0.86)",
                      }}
                    >
                      {String(timeLeft.days).padStart(2, "0")}d
                    </span>
                    <span
                      style={{
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.06)",
                        padding: isMobile ? "2px 5px" : "2px 6px",
                        fontSize: isMobile ? 11 : 12,
                        color: "rgba(255,255,255,0.86)",
                      }}
                    >
                      {String(timeLeft.hours).padStart(2, "0")}h
                    </span>
                    <span
                      style={{
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.06)",
                        padding: isMobile ? "2px 5px" : "2px 6px",
                        fontSize: isMobile ? 11 : 12,
                        color: "rgba(255,255,255,0.86)",
                      }}
                    >
                      {String(timeLeft.minutes).padStart(2, "0")}m
                    </span>
                    <span
                      style={{
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.06)",
                        padding: isMobile ? "2px 5px" : "2px 6px",
                        fontSize: isMobile ? 11 : 12,
                        color: "rgba(255,255,255,0.86)",
                      }}
                    >
                      {String(timeLeft.seconds).padStart(2, "0")}s
                    </span>
                  </div>
                </div>
              </div>
            </div>

              <div style={{ padding: "10px 2px 0", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: isMobile ? 6 : 8,
                      alignItems: "flex-end",
                      flexWrap: "nowrap",
                      width: "min(780px, 100%)",
                    }}
                  >
                    {([topThree[1], topThree[0], topThree[2]] as Array<RankedEntry | undefined>).map((item, idx) => {
                      if (!item) return <div key={`top_empty_${idx}`} />;
                      const place = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                      const points = tab === "weekly" ? item.weeklyPoints : item.allTimePoints;
                      const podiumH = isMobile ? (place === 1 ? 64 : 48) : place === 1 ? 76 : 56;
                      const avatarSize = isMobile ? (place === 1 ? 46 : 40) : place === 1 ? 58 : 50;
                      const cardW = isMobile ? "33.333%" : place === 1 ? 200 : 170;
                      const nameW = isMobile ? 110 : place === 1 ? 160 : 140;

                      return (
                        <div
                          key={`${item.username}_${place}`}
                          style={{
                            display: "grid",
                            justifyItems: "center",
                            gap: 8,
                            width: cardW,
                            flex: "0 0 auto",
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              width: avatarSize,
                              height: avatarSize,
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.16)",
                              boxShadow: "0 10px 30px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.25)",
                              display: "grid",
                              placeItems: "center",
                              overflow: "hidden",
                            }}
                          >
                            <img
                              alt=""
                              src={avatarSrc(item.username)}
                              style={{ width: "100%", height: "100%", display: "block", borderRadius: 999 }}
                            />
                          </div>
                          <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
                            <div
                              style={{
                                fontSize: isMobile ? 11 : 12,
                                fontWeight: 650,
                                color: "rgba(255,255,255,0.86)",
                                maxWidth: nameW,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                textAlign: "center",
                              }}
                            >
                              {item.username}
                            </div>
                            <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: "rgba(255,255,255,0.92)", lineHeight: 1.15, textAlign: "center" }}>
                              {formatInt(points)}
                            </div>
                            <div style={{ fontSize: isMobile ? 11 : 12, fontWeight: 500, color: "rgba(255,255,255,0.46)", lineHeight: 1.05 }}>points</div>
                          </div>
                          <div
                            style={{
                              width: 68,
                              height: podiumH,
                              borderRadius: "8px 8px 0 0",
                              background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
              </div>

              <div style={{ marginTop: 14, width: "100%" }}>
                <div style={{ display: "flex", gap: 8, borderRadius: 14, background: "rgba(255,255,255,0.04)", padding: 6 }}>
                  <TabButton active={tab === "weekly"} label="週榜" onClick={() => setTabAndUrl("weekly")} />
                  <TabButton active={tab === "all_time"} label="總榜" onClick={() => setTabAndUrl("all_time")} />
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  borderRadius: 18,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.12)",
                  width: "100%",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: 860 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "64px minmax(0, 1fr) 160px 140px 160px",
                        gap: 12,
                        padding: "14px 16px",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.03)",
                        color: "rgba(255,255,255,0.46)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <div>#</div>
                      <div>用戶</div>
                      <div style={{ textAlign: "right" }}>交易量</div>
                      <div style={{ textAlign: "right" }}>抽卡次數</div>
                      <div style={{ textAlign: "right" }}>積分</div>
                    </div>

                    {tableRows.map((e) => {
                      const points = tab === "weekly" ? e.weeklyPoints : e.allTimePoints;
                      return (
                        <div
                          key={e.username}
                          onMouseEnter={() => setHoveredRank(e.displayRank)}
                          onMouseLeave={() => setHoveredRank((prev) => (prev === e.displayRank ? null : prev))}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "64px minmax(0, 1fr) 160px 140px 160px",
                            gap: 12,
                            padding: "14px 16px",
                            borderBottom: "1px solid rgba(255,255,255,0.08)",
                            alignItems: "center",
                            background: hoveredRank === e.displayRank ? "rgba(255,255,255,0.03)" : "transparent",
                            transition: "background 160ms ease",
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.62)" }}>{e.displayRank}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.06)",
                                display: "block",
                                overflow: "hidden",
                                flex: "0 0 auto",
                              }}
                            >
                              <img alt="" src={avatarSrc(e.username)} style={{ width: "100%", height: "100%", display: "block", borderRadius: 999 }} />
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.86)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {e.username}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.70)" }}>{formatUsd(e.volumeUsd)}</div>
                          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.70)" }}>{formatInt(e.pulls)}</div>
                          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{formatInt(points)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </AppShell>
  );
}
