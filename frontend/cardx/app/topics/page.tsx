"use client";

/**
 * 話題（桌機版）—— 站上正在被討論／被搜尋的關鍵字。
 *
 * 原本這頁是七題「你覺得會不會漲」的投票，票數寫死、投票結果存 localStorage
 * （平台沒有任何投票資料表，重整就沒了）。整段刪掉，改接真的熱門訊號：
 *   ・/api/public/topics —— 情報標題關鍵字 ＋ 站內搜尋熱詞 ＋ 商品標籤熱度（近 7 天）
 *   ・/api/hot-tags     —— 商品標籤熱度榜
 * 點任何一個關鍵字就帶去搜尋結果。
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { PageHeader, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";

type Topic = { keyword: string; weight: number; source: string };
type HotTag = { id: string; name: string; score: number; is_pinned: boolean };

/** source 是 news／search／tag，多來源會用 + 串起來 */
function sourceLabel(source: string) {
  const parts: string[] = [];
  if (source.includes("search")) parts.push("有人在搜");
  if (source.includes("news")) parts.push("情報在談");
  if (source.includes("tag")) parts.push("商品熱度");
  return parts.join("・") || "熱門";
}

function sourceTone(source: string): "info" | "success" | "muted" {
  if (source.includes("search")) return "info";
  if (source.includes("news")) return "success";
  return "muted";
}

export default function TopicsPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [tags, setTags] = useState<HotTag[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/public/topics");
        const data = res.ok ? await res.json() : [];
        if (alive) setTopics(Array.isArray(data) ? (data as Topic[]) : []);
      } catch {
        if (alive) setTopics([]);
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/hot-tags?limit=16&days=30");
        const json = res.ok ? await res.json() : { tags: [] };
        if (alive) setTags(Array.isArray(json?.tags) ? (json.tags as HotTag[]) : []);
      } catch {
        if (alive) setTags([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const go = (keyword: string) => router.push(`/search?q=${encodeURIComponent(keyword)}`);

  const loading = topics === null || tags === null;
  const nothing = !loading && (topics?.length ?? 0) === 0 && (tags?.length ?? 0) === 0;
  const maxWeight = Math.max(1, ...(topics ?? []).map((t) => t.weight));

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="話題" subtitle="站上這陣子最常被搜尋、被討論的關鍵字" />

            {loading ? (
              <div style={{ marginTop: 14, display: "grid", gap: 12, width: "100%" }}>
                {[0, 1].map((i) => (
                  <SurfaceCard key={i} style={{ height: 160 }}>
                    <div style={{ height: 16, width: "30%", borderRadius: 6, background: "#f3f4f6" }} />
                    <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[0, 1, 2, 3, 4, 5].map((j) => (
                        <div key={j} style={{ height: 34, width: 96, borderRadius: 999, background: "#f3f4f6" }} />
                      ))}
                    </div>
                  </SurfaceCard>
                ))}
              </div>
            ) : nothing ? (
              <SurfaceCard style={{ marginTop: 14, padding: 28, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>目前還沒有熱門話題</div>
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 750, color: "#6b7280" }}>
                  等大家開始搜尋、開抽之後，最熱的關鍵字就會出現在這裡。
                </div>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 8 }}>
                  <SecondaryButton href="/">回首頁</SecondaryButton>
                  <SecondaryButton href="/news">看看情報</SecondaryButton>
                </div>
              </SurfaceCard>
            ) : (
              <div style={{ marginTop: 14, display: "grid", gap: 12, width: "100%" }}>
                {topics && topics.length > 0 ? (
                  <SurfaceCard style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>正在熱門</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>近 7 天</div>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {topics.map((t, i) => {
                        const strong = t.weight >= maxWeight * 0.5 || i < 3;
                        return (
                          <button
                            key={`${t.keyword}-${i}`}
                            type="button"
                            onClick={() => go(t.keyword)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              height: strong ? 42 : 36,
                              padding: strong ? "0 16px" : "0 14px",
                              borderRadius: 999,
                              border: strong ? "1px solid transparent" : "1px solid #e5e7eb",
                              background: strong ? "rgb(var(--primary))" : "#ffffff",
                              color: strong ? "#ffffff" : "#374151",
                              fontSize: strong ? 15 : 13,
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            <span style={{ opacity: strong ? 0.75 : 0.5, fontSize: 12, fontWeight: 900 }}>{i + 1}</span>
                            {t.keyword}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {topics.slice(0, 6).map((t, i) => (
                        <Pill key={`${t.keyword}-src-${i}`} tone={sourceTone(t.source)}>
                          {t.keyword}・{sourceLabel(t.source)}
                        </Pill>
                      ))}
                    </div>
                  </SurfaceCard>
                ) : null}

                {tags && tags.length > 0 ? (
                  <SurfaceCard style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>熱門標籤</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>近 30 天商品熱度</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {tags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => go(t.name)}
                          style={{
                            height: 36,
                            padding: "0 14px",
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            background: "#ffffff",
                            color: "#374151",
                            fontSize: 13,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          #{t.name}
                          {t.is_pinned ? " ★" : ""}
                        </button>
                      ))}
                    </div>
                  </SurfaceCard>
                ) : null}

                <div style={{ fontSize: 12, fontWeight: 750, color: "#9ca3af" }}>點任何一個關鍵字，就會帶你去搜尋結果。</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
