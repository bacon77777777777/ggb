"use client";

/**
 * 桌機排行榜（/leaderboard）—— 真資料版（老闆 2026-09-04）。
 *
 * 走 `/api/public/ranking`（`lib/queries/ranking.ts`），跟手機版 `app/ranking` 同一份資料：
 *   類別 reward（賞金狂人＝累積消費）／draws（轉蛋魔人＝抽獎次數）× 區間 day／week。
 * 榜單是「昨日／上週結算」，所以倒數算到下一個台灣午夜。
 *
 * 拿掉的假東西：交易量（US$）、週榜／總榜（DB 只結算日／週）、寫死的 22 個假帳號與積分。
 */

import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { fetchRanking, type RankingRow, type RankingType, type RankingRange } from "@/lib/queries/ranking";
import { asset } from "@/lib/asset";
import Link from "next/link";

const DEFAULT_AVATAR = "/images/avatar.webp";
const TITLE_BG: Record<string, string> = {
  gold: "#e6a817",
  red: "#fc2c54",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  green: "#22c55e",
};

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
        background: active ? "#ffffff" : "transparent",
        color: active ? "#111827" : "#6b7280",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06), 0 4px 12px -6px rgba(0,0,0,0.12)" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ color: "#111827" }}>
      <path
        d="M18 4V3H6v1H2.5v2.5A4.5 4.5 0 0 0 7 11h.3a5 5 0 0 0 3.7 2.9V17H8v2h8v-2h-3v-3.1A5 5 0 0 0 16.7 11H17a4.5 4.5 0 0 0 4.5-4.5V4H18ZM4.5 6.5V6H6v2.9A2.5 2.5 0 0 1 4.5 6.5Zm15 0A2.5 2.5 0 0 1 18 8.9V6h1.5v.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** 下一個台灣午夜（榜單結算點） */
function nextTaipeiMidnight(from: number) {
  const TW_OFFSET_MS = 8 * 3600 * 1000;
  const twNow = from + TW_OFFSET_MS;
  const dayStart = Math.floor(twNow / 86400000) * 86400000;
  return dayStart + 86400000 - TW_OFFSET_MS;
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

  const typeParam = searchParams?.get("type") === "draws" ? "draws" : "reward";
  const rangeParam = searchParams?.get("range") === "week" ? "week" : "day";
  const [type, setType] = useState<RankingType>(typeParam);
  const [range, setRange] = useState<RankingRange>(rangeParam);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);

  useEffect(() => {
    window.setTimeout(() => {
      setType((prev) => (prev === typeParam ? prev : typeParam));
      setRange((prev) => (prev === rangeParam ? prev : rangeParam));
    }, 0);
  }, [typeParam, rangeParam]);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchRanking(type, range)
      .then((data) => { if (alive) { setRows(Array.isArray(data) ? data : []); setLoading(false); } })
      .catch(() => { if (alive) { setRows([]); setLoading(false); } });
    return () => { alive = false; };
  }, [type, range]);

  function setUrl(nextType: RankingType, nextRange: RankingRange) {
    setType(nextType);
    setRange(nextRange);
    const sp = new URLSearchParams();
    if (nextType !== "reward") sp.set("type", nextType);
    if (nextRange !== "day") sp.set("range", nextRange);
    const q = sp.toString();
    router.push(q ? `/leaderboard?${q}` : "/leaderboard");
  }

  const ranked = useMemo(
    () => rows.map((r, idx) => ({ ...r, displayRank: Number(r.rank) || idx + 1 })),
    [rows],
  );
  const topThree = useMemo(() => ranked.slice(0, 3), [ranked]);
  const tableRows = useMemo(() => ranked.slice(3), [ranked]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const timeLeft = useMemo(() => {
    const ms = Math.max(0, nextTaipeiMidnight(now) - now);
    const totalSeconds = Math.floor(ms / 1000);
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  }, [now]);

  const metricLabel = type === "draws" ? "抽獎次數" : "累積消費";
  function metricOf(r: RankingRow) {
    if (type === "draws") return Math.floor(Number(r.draw_count ?? r.total_spent ?? 0));
    return Math.floor(Number(r.total_spent ?? 0));
  }
  function metricText(r: RankingRow) {
    const v = metricOf(r).toLocaleString();
    return type === "draws" ? `${v} 抽` : `${v} G`;
  }
  function avatarOf(r: RankingRow) {
    return asset(r.avatar_url || DEFAULT_AVATAR);
  }
  function nicknameOf(r: RankingRow) {
    return r.nickname || "神秘玩家";
  }

  const pillStyle = {
    borderRadius: 6,
    background: "#f3f4f6",
    padding: isMobile ? "2px 5px" : "2px 6px",
    fontSize: isMobile ? 11 : 12,
    color: "#111827",
  } as const;

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby} style={{ width: "100%" }}>
            <div
              style={{
                display: "flex", flexShrink: 0, alignItems: "center", alignSelf: "stretch",
                justifyContent: "space-between", paddingTop: 4, paddingBottom: 4, gap: 16, flexWrap: "nowrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", width: "auto", minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ display: "flex", alignItems: "center", overflow: "hidden" }}><TrophyIcon /></div>
                <h1
                  style={{
                    display: "flex", alignItems: "center", margin: "0 0 0 8px", width: "auto", height: 24,
                    lineHeight: "24px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    letterSpacing: "-0.36px", color: "#111827",
                    fontFamily: 'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                    fontSize: 18, fontWeight: 600,
                  }}
                >
                  排行榜
                </h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", justifyContent: "flex-end", flex: "0 0 auto", minWidth: 0, height: 38 }}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 6, borderRadius: 10,
                    border: "1px solid #e5e7eb", background: "#ffffff",
                    padding: isMobile ? "6px 8px" : "8px 10px", whiteSpace: "nowrap",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ color: "#6b7280" }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                    <polyline points="12 6 12 12 16 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {!isMobile ? <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>結算倒數：</span> : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 600 }}>
                    <span style={pillStyle}>{String(timeLeft.hours).padStart(2, "0")}h</span>
                    <span style={pillStyle}>{String(timeLeft.minutes).padStart(2, "0")}m</span>
                    <span style={pillStyle}>{String(timeLeft.seconds).padStart(2, "0")}s</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 榜別（賞金狂人／轉蛋魔人）＋ 區間（日／週）：兩個都是後端真的支援的維度 */}
            <div style={{ marginTop: 12, width: "100%", display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, borderRadius: 14, background: "#f3f4f6", padding: 6, flex: "1 1 320px", minWidth: 0 }}>
                <TabButton active={type === "reward"} label="賞金狂人" onClick={() => setUrl("reward", range)} />
                <TabButton active={type === "draws"} label="轉蛋魔人" onClick={() => setUrl("draws", range)} />
              </div>
              <div style={{ display: "flex", gap: 8, borderRadius: 14, background: "#f3f4f6", padding: 6, flex: "0 1 240px", minWidth: 0 }}>
                <TabButton active={range === "day"} label="日榜" onClick={() => setUrl(type, "day")} />
                <TabButton active={range === "week"} label="週榜" onClick={() => setUrl(type, "week")} />
              </div>
            </div>

            {loading ? (
              <div style={{ marginTop: 18, width: "100%", display: "grid", gap: 10 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={`sk_${i}`} className="animate-pulse" style={{ height: 52, borderRadius: 12, background: "#e5e7eb" }} />
                ))}
              </div>
            ) : ranked.length === 0 ? (
              <div style={{ padding: "56px 0", display: "grid", justifyItems: "center", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>這個榜單還沒有人上榜，抽一發就是第一名</div>
                <Link href="/" style={{ fontSize: 13, fontWeight: 800, color: "#111827", textDecoration: "underline" }}>
                  去看看有什麼可以抽
                </Link>
              </div>
            ) : (
              <>
                <div style={{ padding: "14px 2px 0", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 6 : 8, alignItems: "flex-end", flexWrap: "nowrap", width: "min(780px, 100%)" }}>
                    {([topThree[1], topThree[0], topThree[2]] as Array<(RankingRow & { displayRank: number }) | undefined>).map((item, idx) => {
                      if (!item) return <div key={`top_empty_${idx}`} style={{ width: isMobile ? "33.333%" : 170 }} />;
                      const place = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                      const podiumH = isMobile ? (place === 1 ? 64 : 48) : place === 1 ? 76 : 56;
                      const avatarSize = isMobile ? (place === 1 ? 46 : 40) : place === 1 ? 58 : 50;
                      const cardW = isMobile ? "33.333%" : place === 1 ? 200 : 170;
                      const nameW = isMobile ? 110 : place === 1 ? 160 : 140;
                      return (
                        <div key={`${item.user_id}_${place}`} style={{ display: "grid", justifyItems: "center", gap: 8, width: cardW, flex: "0 0 auto", minWidth: 0 }}>
                          <div
                            style={{
                              width: avatarSize, height: avatarSize, borderRadius: 999, border: "1px solid #e5e7eb",
                              boxShadow: "0 6px 18px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(0,0,0,0.06)",
                              display: "grid", placeItems: "center", overflow: "hidden", background: "#f9fafb",
                            }}
                          >
                            <img alt="" src={avatarOf(item)} style={{ width: "100%", height: "100%", display: "block", borderRadius: 999, objectFit: "cover" }} />
                          </div>
                          <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
                            {item.title_name ? (
                              <span
                                style={{
                                  display: "inline-flex", alignItems: "center", height: 18, padding: "0 8px", borderRadius: 999,
                                  background: TITLE_BG[item.title_color || "gold"] ?? TITLE_BG.gold,
                                  color: "#ffffff", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap",
                                }}
                              >
                                {item.title_name}
                              </span>
                            ) : null}
                            <div style={{ fontSize: isMobile ? 11 : 12, fontWeight: 650, color: "#111827", maxWidth: nameW, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
                              {nicknameOf(item)}
                            </div>
                            <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: "#111827", lineHeight: 1.15, textAlign: "center" }}>
                              {metricOf(item).toLocaleString()}
                            </div>
                            <div style={{ fontSize: isMobile ? 11 : 12, fontWeight: 500, color: "#6b7280", lineHeight: 1.05 }}>
                              {type === "draws" ? "抽" : "G"}
                            </div>
                          </div>
                          <div style={{ width: 68, height: podiumH, borderRadius: "8px 8px 0 0", background: "linear-gradient(180deg, #e5e7eb, #f3f4f6)", boxShadow: "inset 0 0 0 1px #e5e7eb" }} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {tableRows.length > 0 ? (
                  <div style={{ marginTop: 14, borderRadius: 18, overflow: "hidden", border: "1px solid #e5e7eb", background: "#ffffff", width: "100%" }}>
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ minWidth: 720 }}>
                        <div
                          style={{
                            display: "grid", gridTemplateColumns: "64px minmax(0, 1fr) minmax(0, 1fr) 160px", gap: 12,
                            padding: "14px 16px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb",
                            color: "#6b7280", fontSize: 12, fontWeight: 600,
                          }}
                        >
                          <div>#</div>
                          <div>玩家</div>
                          <div>最高獎項</div>
                          <div style={{ textAlign: "right" }}>{metricLabel}</div>
                        </div>
                        {tableRows.map((e) => (
                          <div
                            key={e.user_id}
                            onMouseEnter={() => setHoveredRank(e.displayRank)}
                            onMouseLeave={() => setHoveredRank((prev) => (prev === e.displayRank ? null : prev))}
                            style={{
                              display: "grid", gridTemplateColumns: "64px minmax(0, 1fr) minmax(0, 1fr) 160px", gap: 12,
                              padding: "14px 16px", borderBottom: "1px solid #e5e7eb", alignItems: "center",
                              background: hoveredRank === e.displayRank ? "#f9fafb" : "transparent",
                              transition: "background 160ms ease",
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{e.displayRank}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid #e5e7eb", background: "#f9fafb", overflow: "hidden", flex: "0 0 auto" }}>
                                <img alt="" src={avatarOf(e)} style={{ width: "100%", height: "100%", display: "block", borderRadius: 999, objectFit: "cover" }} />
                              </div>
                              <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {nicknameOf(e)}
                                </div>
                                {e.title_name ? (
                                  <span style={{ fontSize: 10, fontWeight: 800, color: TITLE_BG[e.title_color || "gold"] ?? TITLE_BG.gold, whiteSpace: "nowrap" }}>
                                    {e.title_name}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {e.prize_level || e.prize_name ? `${e.prize_level ?? ""} ${e.prize_name ?? ""}`.trim() : "—"}
                            </div>
                            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#111827" }}>{metricText(e)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
