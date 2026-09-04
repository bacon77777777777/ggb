"use client";

/**
 * 桌機情報（/news）—— 真資料版（老闆 2026-09-04）。
 *
 * 走 `/api/public/news`（`lib/queries/news.ts`），跟手機版 `app/news` 同一批文章
 * （news-agent 寫進 `news` 表、後台上架的那些）。分類固定為 DB 的五類：
 * 一番賞／轉蛋／盒玩周邊／卡牌／公仔景品。
 *
 * 拿掉的假東西：市集／卡包／平台三個假分類、40 篇假公告、彈窗裡的假內文
 * （內文與留言／按讚都在 `/news/<id>` 那頁，點卡片直接過去）。
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { fetchNewsList, type NewsListItem } from "@/lib/queries/news";
import CategoryBadge from "@/components/news/CategoryBadge";
import { timeAgo } from "@/lib/timeAgo";
import { asset } from "@/lib/asset";
import Link from "next/link";

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "ichiban", label: "一番賞" },
  { key: "gacha", label: "轉蛋" },
  { key: "toy", label: "盒玩周邊" },
  { key: "tcg", label: "卡牌" },
  { key: "figure", label: "公仔景品" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];
const CATEGORY_KEYS = new Set<string>(CATEGORIES.map((c) => c.key));
const FALLBACK_IMAGE = "/images/banner_defaulet.png";
const PAGE_SIZE = 8;

function NewsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ color: "#111827" }}>
      <path
        d="M4 4h12a2 2 0 0 1 2 2v12a2 2 0 0 0 2-2V8h1.5v10a3.5 3.5 0 0 1-3.5 3.5H5A3 3 0 0 1 2 18.5V6a2 2 0 0 1 2-2Zm2 4v2h8V8H6Zm0 4v2h8v-2H6Zm0 4v2h5v-2H6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor" />
    </svg>
  );
}

function HeartSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
    </svg>
  );
}

function CommentSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" />
    </svg>
  );
}

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
  const catParamRaw = (searchParams?.get("cat") ?? "").trim().toLowerCase();
  const catParam: CategoryKey = CATEGORY_KEYS.has(catParamRaw) ? (catParamRaw as CategoryKey) : "all";
  const pageParam = Math.max(1, Number(searchParams?.get("page") ?? "1") || 1);

  const [category, setCategory] = useState<CategoryKey>(catParam);
  const [page, setPage] = useState(pageParam);
  const [items, setItems] = useState<NewsListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    if (tabParam === "topics") { router.replace("/topics"); return; }
    if (tabParam === "trends") { router.replace("/trends"); return; }
    window.setTimeout(() => {
      setCategory((prev) => (prev === catParam ? prev : catParam));
      setPage((prev) => (prev === pageParam ? prev : pageParam));
    }, 0);
  }, [catParam, pageParam, router, tabParam]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchNewsList(category)
      .then((rows) => { if (alive) { setItems(Array.isArray(rows) ? rows : []); setLoading(false); } })
      .catch(() => { if (alive) { setItems([]); setLoading(false); } });
    return () => { alive = false; };
  }, [category]);

  useEffect(() => {
    const gap = 16;
    function computeColumns() {
      const el = listRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (w <= 520) { setColumns((prev) => (prev === 1 ? prev : 1)); return; }
      if (w <= 1023) { setColumns((prev) => (prev === 2 ? prev : 2)); return; }
      const minColsForMax = Math.max(1, Math.ceil((w + gap) / (520 + gap)));
      const maxColsForMin = Math.max(1, Math.floor((w + gap) / (280 + gap)));
      const next = Math.max(2, Math.min(Math.max(minColsForMax, 2), maxColsForMin));
      setColumns((prev) => (prev === next ? prev : next));
    }
    computeColumns();
    const ro = new ResizeObserver(() => computeColumns());
    if (listRef.current) ro.observe(listRef.current);
    window.addEventListener("resize", computeColumns);
    return () => { ro.disconnect(); window.removeEventListener("resize", computeColumns); };
  }, []);

  function setParamsAndUrl(nextCat: CategoryKey, nextPage: number) {
    const p = Math.max(1, Math.floor(nextPage || 1));
    setCategory(nextCat);
    setPage(p);
    const params = new URLSearchParams();
    if (nextCat !== "all") params.set("cat", nextCat);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    router.push(qs ? `/news?${qs}` : "/news");
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const pageItems = useMemo(() => items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [items, safePage]);

  function pageTokens(total: number, current: number) {
    const out: Array<number | "ellipsis"> = [];
    const show = new Set<number>([1, total, current, current - 1, current + 1].filter((n) => n >= 1 && n <= total));
    const sorted = [...show].sort((a, b) => a - b);
    let prev = 0;
    for (const n of sorted) {
      if (prev && n - prev > 1) out.push("ellipsis");
      out.push(n);
      prev = n;
    }
    return out;
  }

  const TabButton = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, height: 42, border: 0, borderRadius: 10, padding: "0 14px", cursor: "pointer",
        fontSize: 14, fontWeight: 600, transition: "all 200ms ease",
        background: active ? "#ffffff" : "transparent",
        color: active ? "#111827" : "#6b7280",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06), 0 4px 12px -6px rgba(0,0,0,0.12)" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  const categoryLabel = CATEGORIES.find((c) => c.key === category)?.label ?? "全部";

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <div style={{ display: "flex", alignItems: "center", alignSelf: "stretch", paddingTop: 4, paddingBottom: 4, gap: 8 }}>
              <NewsIcon />
              <h1
                style={{
                  margin: 0, height: 24, lineHeight: "24px", letterSpacing: "-0.36px", color: "#111827",
                  fontFamily: 'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
                  fontSize: 18, fontWeight: 600,
                }}
              >
                情報
              </h1>
            </div>

            <div style={{ marginTop: 14, alignSelf: "stretch", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", width: "100%" }}>
                <div style={{ display: "flex", gap: 8, borderRadius: 14, background: "#f3f4f6", padding: 6, flex: "1 1 520px", minWidth: 0, maxWidth: 720 }}>
                  {CATEGORIES.map((c) => (
                    <TabButton key={c.key} active={category === c.key} label={c.label} onClick={() => setParamsAndUrl(c.key, 1)} />
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>
                  {categoryLabel} · {items.length.toLocaleString()} 篇
                </div>
              </div>

              <section className={homeStyles.section} aria-label="情報列表">
                <div
                  ref={listRef}
                  className={homeStyles.frame12}
                  style={{
                    display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16,
                    justifyItems: "stretch", alignItems: "stretch", width: "100%", overflow: "visible",
                    overflowX: "visible", marginTop: 14, paddingTop: 0, paddingBottom: 0,
                  }}
                >
                  {loading
                    ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                        <div key={`sk_${i}`} style={{ borderRadius: 16, overflow: "hidden", background: "#ffffff", boxShadow: "0 0 0 1px #e5e7eb" }}>
                          <div className="animate-pulse" style={{ width: "100%", aspectRatio: "342 / 188", background: "#e5e7eb" }} />
                          <div style={{ padding: 14, display: "grid", gap: 10 }}>
                            <div className="animate-pulse" style={{ height: 14, borderRadius: 6, background: "#e5e7eb" }} />
                            <div className="animate-pulse" style={{ height: 14, width: "70%", borderRadius: 6, background: "#e5e7eb" }} />
                          </div>
                        </div>
                      ))
                    : pageItems.map((n) => (
                        <Link
                          key={n.id}
                          href={`/news/${n.id}`}
                          className={homeStyles.newsCard}
                          style={{
                            borderRadius: 16, background: "#ffffff", overflow: "hidden", width: "100%",
                            boxShadow: "0 0 0 1px #e5e7eb, 0 10px 40px -10px rgba(0,0,0,0.08)",
                            cursor: "pointer", textDecoration: "none", color: "inherit", display: "block",
                          }}
                        >
                          <div style={{ width: "100%", aspectRatio: "342 / 188", background: "#f3f4f6" }}>
                            <img
                              alt=""
                              src={n.image_url || asset(FALLBACK_IMAGE)}
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          </div>

                          <div style={{ padding: 14, display: "grid", gap: 10, background: "#ffffff" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <CategoryBadge category={n.category ?? "general"} />
                              <div style={{ width: 1, height: 14, background: "#e5e7eb" }} />
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap" }}>{timeAgo(n.created_at)}</div>
                            </div>

                            <div style={{ display: "grid", gap: 6 }}>
                              <div
                                style={{
                                  fontSize: 16, fontWeight: 900, color: "#111827", letterSpacing: "-0.01em", lineHeight: 1.3,
                                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                                }}
                              >
                                {n.title}
                              </div>
                              {n.summary ? (
                                <div
                                  style={{
                                    fontSize: 12, fontWeight: 650, color: "#6b7280", lineHeight: 1.5,
                                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                                  }}
                                >
                                  {n.summary}
                                </div>
                              ) : null}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><EyeIcon />{(n.view_count ?? 0).toLocaleString()}</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><HeartSmallIcon />{n.likes_count.toLocaleString()}</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CommentSmallIcon />{n.comments_count.toLocaleString()}</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                </div>
              </section>

              {!loading && items.length === 0 ? (
                <div style={{ padding: "48px 0", display: "grid", justifyItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>這個分類還沒有文章</div>
                  <Link href="/news" style={{ fontSize: 13, fontWeight: 800, color: "#111827", textDecoration: "underline" }}>
                    看全部情報
                  </Link>
                </div>
              ) : null}

              {!loading && totalPages > 1 ? (
                <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setParamsAndUrl(category, safePage - 1)}
                      disabled={safePage <= 1}
                      style={{
                        width: 34, height: 34, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff",
                        color: "#374151", cursor: safePage <= 1 ? "not-allowed" : "pointer", opacity: safePage <= 1 ? 0.45 : 1,
                      }}
                    >
                      {"<"}
                    </button>
                    {pageTokens(totalPages, safePage).map((t, idx) =>
                      t === "ellipsis" ? (
                        <div key={`e_${idx}`} style={{ width: 34, textAlign: "center", color: "#6b7280", fontWeight: 800 }}>…</div>
                      ) : (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setParamsAndUrl(category, t)}
                          style={{
                            width: 34, height: 34, borderRadius: 10, border: "1px solid #e5e7eb",
                            background: t === safePage ? "#111827" : "#ffffff",
                            color: t === safePage ? "#ffffff" : "#374151",
                            cursor: "pointer", fontSize: 12, fontWeight: 900,
                          }}
                        >
                          {t}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      onClick={() => setParamsAndUrl(category, safePage + 1)}
                      disabled={safePage >= totalPages}
                      style={{
                        width: 34, height: 34, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff",
                        color: "#374151", cursor: safePage >= totalPages ? "not-allowed" : "pointer", opacity: safePage >= totalPages ? 0.45 : 1,
                      }}
                    >
                      {">"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
