"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { PageHeader } from "@/cardx/components/ui/Kit";

export default function TopicsPage() {
  return (
    <Suspense fallback={null}>
      <TopicsPageInner />
    </Suspense>
  );
}

function TopicsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  type TagKey =
    | "all"
    | "pokemon"
    | "onepiece"
    | "yugioh"
    | "sports"
    | "grading"
    | "market"
    | "packs"
    | "trades"
    | "strategy"
    | "newbie"
    | "events";

  const tags = useMemo<Array<{ key: TagKey; label: string }>>(
    () => [
      { key: "all", label: "全部" },
      { key: "pokemon", label: "寶可夢" },
      { key: "onepiece", label: "海賊王" },
      { key: "yugioh", label: "遊戲王" },
      { key: "sports", label: "運動卡" },
      { key: "grading", label: "鑑定/PSA" },
      { key: "market", label: "市集" },
      { key: "packs", label: "卡包" },
      { key: "trades", label: "交換" },
      { key: "strategy", label: "攻略" },
      { key: "newbie", label: "新手" },
      { key: "events", label: "活動" },
    ],
    []
  );

  type TopicItem = {
    id: string;
    tag: Exclude<TagKey, "all">;
    question: string;
    yesPct: number;
    voters: number;
  };

  const items = useMemo<TopicItem[]>(
    () => [
      {
        id: "tp-001",
        tag: "market",
        question: "下一週最熱門的卡牌系列會是寶可夢嗎？",
        yesPct: 72,
        voters: 1423,
      },
      {
        id: "tp-002",
        tag: "pokemon",
        question: "這週寶可夢新彈單卡均價會上漲嗎？",
        yesPct: 61,
        voters: 987,
      },
      {
        id: "tp-003",
        tag: "grading",
        question: "PSA 10 溢價本月會擴大嗎？",
        yesPct: 58,
        voters: 624,
      },
      {
        id: "tp-004",
        tag: "packs",
        question: "新卡包上架後 48 小時內會售罄嗎？",
        yesPct: 49,
        voters: 512,
      },
      {
        id: "tp-005",
        tag: "trades",
        question: "交換區熱門卡的媒合成功率會提升嗎？",
        yesPct: 44,
        voters: 388,
      },
      {
        id: "tp-006",
        tag: "yugioh",
        question: "遊戲王熱門卡成交價會回檔嗎？",
        yesPct: 41,
        voters: 301,
      },
      {
        id: "tp-007",
        tag: "events",
        question: "近期展會後市集成交量會增加嗎？",
        yesPct: 38,
        voters: 219,
      },
    ],
    []
  );

  const VOTES_KEY = "cardx.topics.votes.byId";
  const [activeTag, setActiveTag] = useState<TagKey>("all");
  const [pickedById, setPickedById] = useState<Record<string, "yes" | "no">>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VOTES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const next: Record<string, "yes" | "no"> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value === "yes" || value === "no") next[key] = value;
      }
      window.setTimeout(() => setPickedById(next), 0);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickTopic(id: string, choice: "yes" | "no") {
    setPickedById((prev) => {
      const next = { ...prev, [id]: choice };
      try {
        window.localStorage.setItem(VOTES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    const tagParam = (searchParams?.get("tag") ?? "").trim().toLowerCase();
    const idParam = (searchParams?.get("id") ?? "").trim();
    const desiredTag: TagKey =
      tagParam === "pokemon" ||
      tagParam === "onepiece" ||
      tagParam === "yugioh" ||
      tagParam === "sports" ||
      tagParam === "grading" ||
      tagParam === "market" ||
      tagParam === "packs" ||
      tagParam === "trades" ||
      tagParam === "strategy" ||
      tagParam === "newbie" ||
      tagParam === "events"
        ? (tagParam as TagKey)
        : "all";
    setActiveTag((prev) => (prev === desiredTag ? prev : desiredTag));
    setSelectedId((prev) => (prev === (idParam || null) ? prev : idParam || null));
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTag !== "all") params.set("tag", activeTag);
    if (selectedId) params.set("id", selectedId);
    const qs = params.toString();
    const url = qs ? `/topics?${qs}` : "/topics";
    router.replace(url);
  }, [activeTag, router, selectedId]);

  function avatarSrc(_seedKey: string) {
    return "/cardx/placeholder.svg";
  }

  useEffect(() => {
    const gap = 16;
    const minCardWidth = 340;
    const maxCardWidth = 420;

    function computeColumns() {
      const el = listRef.current;
      if (!el) return;
      const w = el.clientWidth;

      if (w <= 520) {
        setColumns((prev) => (prev === 1 ? prev : 1));
        return;
      }
      if (w <= 1023) {
        setColumns((prev) => (prev === 2 ? prev : 2));
        return;
      }

      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (maxCardWidth + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (minCardWidth + gap)));
      const next = Math.min(4, Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin)));
      setColumns((prev) => (prev === next ? prev : next));
    }

    computeColumns();
    const ro = new ResizeObserver(() => computeColumns());
    if (listRef.current) ro.observe(listRef.current);
    window.addEventListener("resize", computeColumns);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeColumns);
    };
  }, []);

  const filtered = useMemo(() => {
    if (activeTag === "all") return items;
    return items.filter((x) => x.tag === activeTag);
  }, [activeTag, items]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSelectedId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selected = useMemo(() => (selectedId ? items.find((x) => x.id === selectedId) ?? null : null), [items, selectedId]);

  function tagLabel(key: Exclude<TagKey, "all">) {
    const hit = tags.find((t) => t.key === key);
    return hit?.label ?? "話題";
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="話題" />

            <div style={{ marginTop: 14, alignSelf: "stretch", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", width: "100%" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    overflowX: "auto",
                    overflowY: "hidden",
                    paddingBottom: 2,
                    WebkitOverflowScrolling: "touch",
                    maxWidth: "100%",
                  }}
                >
                  {tags.map((t) => {
                    const active = activeTag === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTag(t.key)}
                        style={{
                          height: 34,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: 0,
                          cursor: "pointer",
                          background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                          color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)",
                          fontSize: 13,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>{filtered.length.toLocaleString()} 個話題</div>
              </div>

              <section className={homeStyles.section} aria-label="話題列表">
                <div
                  ref={listRef}
                  className={homeStyles.frame12}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: 16,
                    justifyItems: "stretch",
                    alignItems: "stretch",
                    width: "100%",
                    overflow: "visible",
                    overflowX: "visible",
                    marginTop: 14,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                >
                  {filtered.map((x) => {
                    const yes = Math.max(1, Math.min(99, Math.round(x.yesPct)));
                    const picked = pickedById[x.id];
                    return (
                      <div
                        key={x.id}
                        className={`${homeStyles.newsCard} ${homeStyles.topicCard}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(x.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(x.id);
                          }
                        }}
                        style={{
                          borderRadius: 16,
                          background: "#1c2532",
                          overflow: "hidden",
                          boxShadow: "0px 2px 15px 0px rgba(0,0,0,0.10)",
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div className={homeStyles.topicHeader}>
                          <div className={homeStyles.topicAvatar}>
                            <img alt="" src={avatarSrc(x.id)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          </div>
                          <div className={homeStyles.topicTitle}>{x.question}</div>
                          <div className={homeStyles.topicRing} style={{ ["--p" as never]: yes }}>
                            <div className={homeStyles.topicRingInner}>
                              <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1 }}>{yes}%</div>
                              <div style={{ fontSize: 10, fontWeight: 850, color: "rgba(255,255,255,0.55)", lineHeight: 1, marginTop: 2 }}>是</div>
                            </div>
                          </div>
                        </div>

                        <div className={homeStyles.topicSpacer} />
                        <div className={homeStyles.topicFooter}>
                          <div className={homeStyles.topicButtons}>
                            <button
                              type="button"
                              onClick={() => pickTopic(x.id, "yes")}
                              className={homeStyles.topicPickYes}
                              aria-pressed={picked === "yes"}
                              style={{ background: picked === "yes" ? "rgba(102,187,106,0.26)" : "rgba(102,187,106,0.12)" }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClickCapture={(e) => e.stopPropagation()}
                            >
                              是
                            </button>
                            <button
                              type="button"
                              onClick={() => pickTopic(x.id, "no")}
                              className={homeStyles.topicPickNo}
                              aria-pressed={picked === "no"}
                              style={{ background: picked === "no" ? "rgba(239,83,80,0.26)" : "rgba(239,83,80,0.12)" }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClickCapture={(e) => e.stopPropagation()}
                            >
                              否
                            </button>
                          </div>

                          <div className={homeStyles.topicMetaRow}>
                            <div className={homeStyles.topicVoters}>{x.voters.toLocaleString()} 人參與投票</div>
                            <div />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <div
          role="presentation"
          onClick={() => setSelectedId(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(0,0,0,0.62)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="話題詳情"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 96vw)",
              borderRadius: 18,
              border: "1px solid rgba(255, 255, 255, 0.10)",
              background: "rgba(17, 25, 35, 0.92)",
              boxShadow: "0 18px 60px rgba(0, 0, 0, 0.6)",
              padding: 16,
              position: "relative",
            }}
          >
            <button
              type="button"
              aria-label="關閉"
              onClick={() => setSelectedId(null)}
              style={{
                appearance: "none",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.18)",
                color: "rgba(255,255,255,0.9)",
                width: 38,
                height: 38,
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 950,
                lineHeight: 1,
                position: "absolute",
                top: 12,
                right: 12,
              }}
            >
              ×
            </button>

            {(() => {
              const yes = Math.max(1, Math.min(99, Math.round(selected.yesPct)));
              const no = 100 - yes;
              const picked = pickedById[selected.id];
              const activity = [
                { left: "最新", mid: "有玩家預測下週熱門度將走高", right: "2 分鐘前" },
                { left: "討論", mid: "收集到更多成交樣本後再觀察", right: "17 分鐘前" },
                { left: "提醒", mid: "注意卡況與評級差異會影響價格", right: "1 小時前" },
              ];

              return (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingRight: 44 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.06)", flex: "0 0 auto" }}>
                      <img alt="" src={avatarSrc(selected.id)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      <div style={{ fontSize: 16, fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1.25 }}>
                        {selected.question}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.55)" }}>
                        {tagLabel(selected.tag)} · {selected.voters.toLocaleString()} 人參與投票
                      </div>
                    </div>
                    <div className={homeStyles.topicRing} style={{ ["--p" as never]: yes }}>
                      <div className={homeStyles.topicRingInner}>
                        <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1 }}>{yes}%</div>
                        <div style={{ fontSize: 10, fontWeight: 850, color: "rgba(255,255,255,0.55)", lineHeight: 1, marginTop: 2 }}>是</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.04)",
                        padding: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => pickTopic(selected.id, "yes")}
                          aria-pressed={picked === "yes"}
                          className={homeStyles.topicPickYes}
                          style={{
                            flex: 1,
                            height: 46,
                            fontSize: 16,
                            fontWeight: 950,
                            background: picked === "yes" ? "rgba(102,187,106,0.26)" : "rgba(102,187,106,0.12)",
                          }}
                        >
                          是
                        </button>
                        <button
                          type="button"
                          onClick={() => pickTopic(selected.id, "no")}
                          aria-pressed={picked === "no"}
                          className={homeStyles.topicPickNo}
                          style={{
                            flex: 1,
                            height: 46,
                            fontSize: 16,
                            fontWeight: 950,
                            background: picked === "no" ? "rgba(239,83,80,0.26)" : "rgba(239,83,80,0.12)",
                          }}
                        >
                          否
                        </button>
                      </div>

                      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.78)" }}>是</div>
                          <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{yes}%</div>
                        </div>
                        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <div style={{ width: `${yes}%`, height: "100%", background: "rgba(102,187,106,0.52)" }} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.78)" }}>否</div>
                          <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{no}%</div>
                        </div>
                        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <div style={{ width: `${no}%`, height: "100%", background: "rgba(239,83,80,0.52)" }} />
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.04)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>最新動態</div>
                      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        {activity.map((a, idx) => (
                          <div key={`a_${idx}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap" }}>{a.left}</div>
                              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
                              <div style={{ fontSize: 12, fontWeight: 750, color: "rgba(255,255,255,0.62)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.mid}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 750, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>{a.right}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
