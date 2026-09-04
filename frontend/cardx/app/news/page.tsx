"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { PageHeader } from "@/cardx/components/ui/Kit";

export default function NewsPage() {
  return (
    <Suspense fallback={null}>
      <NewsPageInner />
    </Suspense>
  );
}

function NewsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams?.get("tab") ?? "").trim().toLowerCase();

  type NewsCategoryKey = "all" | "market" | "packs" | "platform";
  const catParamRaw = (searchParams?.get("cat") ?? "").trim().toLowerCase();
  const catParam: NewsCategoryKey =
    catParamRaw === "market" || catParamRaw === "packs" || catParamRaw === "platform"
      ? (catParamRaw as NewsCategoryKey)
      : catParamRaw === "igaming"
        ? "market"
        : catParamRaw === "crypto"
          ? "packs"
          : "all";
  const pageParam = Math.max(1, Number(searchParams?.get("page") ?? "1") || 1);
  const [newsCategory, setNewsCategory] = useState<NewsCategoryKey>(catParam);
  const [newsPage, setNewsPage] = useState(pageParam);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    if (tabParam === "topics") {
      router.replace("/topics");
      return;
    }
    if (tabParam === "trends") {
      router.replace("/trends");
      return;
    }
    window.setTimeout(() => {
      setNewsCategory((prev) => (prev === catParam ? prev : catParam));
      setNewsPage((prev) => (prev === pageParam ? prev : pageParam));
    }, 0);
  }, [catParam, pageParam, router, tabParam]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSelectedId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const gap = 16;
    const minCardWidth = 280;
    const maxCardWidth = 520;

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
      const next = Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin));
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

  function setNewsParamsAndUrl(nextCat: NewsCategoryKey, nextPage: number) {
    const page = Math.max(1, Math.floor(nextPage || 1));
    setNewsCategory(nextCat);
    setNewsPage(page);
    const params = new URLSearchParams();
    if (nextCat !== "all") params.set("cat", nextCat);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    router.push(qs ? `/news?${qs}` : "/news");
  }

  type NewsItem = {
    id: string;
    category: NewsCategoryKey;
    dateISO: string;
    title: string;
    subtitle: string;
    imageUrl?: string;
    content: string;
  };

  const categories = useMemo<Array<{ key: NewsCategoryKey; label: string }>>(
    () => [
      { key: "all", label: "全部" },
      { key: "market", label: "市集" },
      { key: "packs", label: "卡包" },
      { key: "platform", label: "平台" },
    ],
    []
  );

  const newsItems = useMemo<NewsItem[]>(() => {
    const homeBanners = [
      "/cardx/placeholder.svg",
      "/cardx/placeholder.svg",
      "/cardx/placeholder.svg",
      "/cardx/placeholder.svg",
      "/cardx/placeholder.svg",
    ] as const;

    const pool = [
      {
        category: "market" as const,
        title: "市集功能更新：收藏同步與篩選排序優化",
        subtitle: "更快找到想要的卡牌與價格區間",
        imageUrl: homeBanners[0],
      },
      {
        category: "market" as const,
        title: "卡牌成交熱度觀察：近期熱門系列排行",
        subtitle: "寶可夢、遊戲王、海賊王熱門關鍵字整理",
        imageUrl: homeBanners[1],
      },
      {
        category: "packs" as const,
        title: "新卡包上架預告：抽卡規則與剩餘庫存提醒",
        subtitle: "掌握發售節奏，避免錯過限量卡包",
        imageUrl: homeBanners[2],
      },
      {
        category: "platform" as const,
        title: "系統維護公告：部分功能短暫不可用",
        subtitle: "維護期間可正常瀏覽，交易功能將暫停",
        imageUrl: homeBanners[3],
      },
      {
        category: "packs" as const,
        title: "卡包新手指南：抽卡機率、稀有度與保底說明",
        subtitle: "用更清楚的方式理解卡包價值與風險",
        imageUrl: homeBanners[4],
      },
      {
        category: "platform" as const,
        title: "安全提醒：如何避免交易詐騙與釣魚連結",
        subtitle: "確認對象、核對卡況、保留交易紀錄",
        imageUrl: homeBanners[0],
      },
      {
        category: "market" as const,
        title: "卡牌走勢怎麼看：價格區間、成交量與流動性",
        subtitle: "用更直覺的方式理解短期波動與長期趨勢",
        imageUrl: homeBanners[1],
      },
    ] as const;

    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    const list = Array.from({ length: 40 }, (_, idx) => {
      const p = pool[idx % pool.length]!;
      const d = new Date(baseDate.getTime() - idx * 1000 * 60 * 60 * 24 * 3);
      const iso = d.toISOString();
      const id = `news_${String(idx + 1).padStart(3, "0")}`;
      const content =
        "這裡是文章內容示例。後續接上 CMS 之後會替換成真實文章內容。\n\n重點摘要：\n- 影響範圍：市集/卡包/交換\n- 建議作法：先看走勢、再比卡況、最後看成交紀錄\n\n本公告用於展示版型與閱讀體驗。";
      return { id, category: p.category, dateISO: iso, title: p.title, subtitle: p.subtitle, imageUrl: p.imageUrl, content };
    });

    return list;
  }, []);

  const formatZhDate = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric" });
    return (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return fmt.format(d);
    };
  }, []);

  function categoryLabel(key: NewsCategoryKey) {
    if (key === "market") return "市集";
    if (key === "packs") return "卡包";
    if (key === "platform") return "平台";
    return "全部";
  }

  const TabButton = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => {
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
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
    );
  };

  const filteredNews = useMemo(() => {
    const list = newsCategory === "all" ? newsItems : newsItems.filter((x) => x.category === newsCategory);
    return [...list].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  }, [newsCategory, newsItems]);

  const selected = useMemo(() => (selectedId ? newsItems.find((x) => x.id === selectedId) ?? null : null), [newsItems, selectedId]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredNews.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, newsPage));
  const pageItems = useMemo(() => filteredNews.slice((safePage - 1) * pageSize, safePage * pageSize), [filteredNews, safePage]);

  function pageTokens(total: number, current: number) {
    const out: Array<number | "ellipsis"> = [];
    const push = (v: number | "ellipsis") => out.push(v);
    const show = new Set<number>([1, total, current, current - 1, current + 1].filter((n) => n >= 1 && n <= total));
    const sorted = [...show].sort((a, b) => a - b);
    let prev = 0;
    for (const n of sorted) {
      if (prev && n - prev > 1) push("ellipsis");
      push(n);
      prev = n;
    }
    return out;
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="最新消息" />

            <div style={{ marginTop: 14, alignSelf: "stretch", width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.04)",
                    padding: 6,
                    flex: "1 1 520px",
                    minWidth: 0,
                    maxWidth: 720,
                  }}
                >
                  {categories.map((c) => (
                    <TabButton key={c.key} active={newsCategory === c.key} label={c.label} onClick={() => setNewsParamsAndUrl(c.key, 1)} />
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
                  {categoryLabel(newsCategory)} · {filteredNews.length.toLocaleString()} 篇
                </div>
              </div>

              <section className={homeStyles.section} aria-label="最新消息列表">
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
                  {pageItems.map((n) => {
                    const hasImage = !!n.imageUrl;
                    return (
                      <div
                        key={n.id}
                        className={homeStyles.newsCard}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(n.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(n.id);
                          }
                        }}
                        style={{
                          borderRadius: 16,
                          background: "#1c2532",
                          overflow: "hidden",
                          width: "100%",
                          boxShadow: "0px 2px 15px 0px rgba(0,0,0,0.10)",
                          cursor: "pointer",
                        }}
                      >
                        {hasImage ? (
                          <div style={{ width: "100%", aspectRatio: "342 / 188", background: "#1c2532" }}>
                            <img alt="" src={n.imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          </div>
                        ) : null}

                        <div style={{ padding: "14px 14px", display: "grid", gap: 10, background: "#1c2532" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap" }}>{categoryLabel(n.category)}</div>
                              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
                              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{formatZhDate(n.dateISO)}</div>
                            </div>
                          </div>

                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                              {n.title}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.62)" }}>{n.subtitle}</div>
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 650,
                              color: "rgba(255,255,255,0.62)",
                              lineHeight: 1.5,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {n.content}
                          </div>

                          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)" }}>{n.id.replace(/^news_/, "").toUpperCase()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setNewsParamsAndUrl(newsCategory, safePage - 1)}
                    disabled={safePage <= 1}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.86)",
                      cursor: safePage <= 1 ? "not-allowed" : "pointer",
                      opacity: safePage <= 1 ? 0.45 : 1,
                    }}
                  >
                    {"<"}
                  </button>
                  {pageTokens(totalPages, safePage).map((t, idx) => {
                    if (t === "ellipsis") {
                      return (
                        <div key={`e_${idx}`} style={{ width: 34, textAlign: "center", color: "rgba(255,255,255,0.45)", fontWeight: 800 }}>
                          …
                        </div>
                      );
                    }
                    const active = t === safePage;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewsParamsAndUrl(newsCategory, t)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                          color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.72)",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setNewsParamsAndUrl(newsCategory, safePage + 1)}
                    disabled={safePage >= totalPages}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.86)",
                      cursor: safePage >= totalPages ? "not-allowed" : "pointer",
                      opacity: safePage >= totalPages ? 0.45 : 1,
                    }}
                  >
                    {">"}
                  </button>
                </div>
              </div>
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
            aria-label="最新消息詳情"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(860px, 96vw)",
              borderRadius: 18,
              border: "1px solid rgba(255, 255, 255, 0.10)",
              background: "rgba(17, 25, 35, 0.92)",
              boxShadow: "0 18px 60px rgba(0, 0, 0, 0.6)",
              overflow: "hidden",
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
                zIndex: 2,
              }}
            >
              ×
            </button>

            {selected.imageUrl ? (
              <div style={{ width: "100%", aspectRatio: "342 / 188", background: "#1c2532" }}>
                <img alt="" src={selected.imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
            ) : null}

            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.78)", whiteSpace: "nowrap" }}>
                    {categoryLabel(selected.category)}
                  </div>
                  <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{formatZhDate(selected.dateISO)}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.45)" }}>{selected.id.replace(/^news_/, "").toUpperCase()}</div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 20, fontWeight: 950, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                  {selected.title}
                </div>
                <div style={{ fontSize: 13, fontWeight: 750, color: "rgba(255,255,255,0.62)" }}>{selected.subtitle}</div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  padding: 14,
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 13,
                  fontWeight: 650,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {selected.content}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
