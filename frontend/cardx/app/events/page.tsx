"use client";

/**
 * 活動列表（桌機版）。
 *
 * 資料來自 /api/public/events —— events 表裡上架且還沒結束的活動，
 * 封面與副標取自活動頁的首屏段落。點卡片就進真正的活動頁 /events/<slug>。
 * 原本這頁是三張寫死的假活動＋一個「活動內容示例」彈窗，整段拿掉。
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { PageHeader, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";
import { untilText } from "@/lib/schedule";

type PublicEvent = {
  slug: string;
  title: string;
  kind: string;
  state: "running" | "upcoming";
  start_at: string | null;
  end_at: string | null;
  accent_color: string | null;
  cover: string | null;
  subtitle: string | null;
};

const KIND_LABEL: Record<string, string> = {
  machine: "機台檔期",
  campaign: "限時活動",
  guide: "玩法說明",
  other: "活動",
};

function ymd(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function periodText(e: PublicEvent) {
  if (e.state === "upcoming") {
    const left = untilText(e.start_at);
    return left ? `${left}後開始` : "即將開始";
  }
  if (e.end_at) {
    const left = untilText(e.end_at);
    return left ? `還剩 ${left}` : "";
  }
  return e.start_at ? `${ymd(e.start_at)} 起` : "長期開放";
}

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/public/events");
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as PublicEvent[];
        if (alive) setEvents(Array.isArray(data) ? data : []);
      } catch {
        if (alive) {
          setEvents([]);
          setFailed(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="活動" subtitle="正在進行與即將開始的活動" />

            <div style={{ marginTop: 14, display: "grid", gap: 12, width: "100%" }}>
              {events === null ? (
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", width: "100%" }}>
                  {[0, 1, 2].map((i) => (
                    <SurfaceCard key={i} style={{ padding: 0, overflow: "hidden" }}>
                      <div style={{ height: 160, background: "#f3f4f6" }} />
                      <div style={{ padding: "12px 14px 14px", display: "grid", gap: 8 }}>
                        <div style={{ height: 16, width: "70%", borderRadius: 6, background: "#f3f4f6" }} />
                        <div style={{ height: 12, width: "90%", borderRadius: 6, background: "#f3f4f6" }} />
                      </div>
                    </SurfaceCard>
                  ))}
                </div>
              ) : events.length === 0 ? (
                <SurfaceCard style={{ padding: 28, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>
                    {failed ? "活動資訊暫時載不出來" : "目前沒有進行中的活動"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 750, color: "#6b7280" }}>
                    {failed ? "請稍後再看看。" : "新活動開跑時會出現在這裡，也會在首頁公告。"}
                  </div>
                  <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                    <SecondaryButton href="/">回首頁看看</SecondaryButton>
                  </div>
                </SurfaceCard>
              ) : (
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", width: "100%" }}>
                  {events.map((e) => {
                    const running = e.state === "running";
                    const period = periodText(e);
                    return (
                      <SurfaceCard key={e.slug} style={{ padding: 0, overflow: "hidden" }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => router.push(`/events/${e.slug}`)}
                          onKeyDown={(ev) => {
                            if (ev.key !== "Enter" && ev.key !== " ") return;
                            ev.preventDefault();
                            router.push(`/events/${e.slug}`);
                          }}
                          style={{ display: "grid", cursor: "pointer", textAlign: "left" }}
                        >
                          <div
                            style={{
                              position: "relative",
                              height: 160,
                              background: e.cover ? "#f3f4f6" : `linear-gradient(135deg, ${e.accent_color || "#e5e7eb"}22, #f3f4f6)`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {e.cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={e.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            ) : (
                              <div style={{ padding: "0 24px", fontSize: 16, fontWeight: 950, color: "#374151", textAlign: "center", lineHeight: 1.3 }}>
                                {e.title}
                              </div>
                            )}
                            <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6 }}>
                              <Pill tone={running ? "success" : "info"}>{running ? "進行中" : "即將開始"}</Pill>
                              <Pill tone="muted">{KIND_LABEL[e.kind] ?? KIND_LABEL.other}</Pill>
                            </div>
                          </div>
                          <div style={{ padding: "12px 14px 14px", display: "grid", gap: 10 }}>
                            <div style={{ display: "grid", gap: 4 }}>
                              <div style={{ fontSize: 15, fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>{e.title}</div>
                              <div style={{ fontSize: 12, fontWeight: 750, color: "#6b7280", lineHeight: 1.35 }}>
                                {e.subtitle || period || "點進去看活動內容"}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>{e.subtitle ? period : ""}</div>
                              <SecondaryButton
                                onClick={() => router.push(`/events/${e.slug}`)}
                                style={{ background: "#f3f4f6", color: "#111827" }}
                              >
                                查看活動
                              </SecondaryButton>
                            </div>
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
