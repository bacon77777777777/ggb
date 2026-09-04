"use client";

import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { Button3D, PageHeader, Pill, SecondaryButton, SurfaceCard } from "@/cardx/components/ui/Kit";

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsPageInner />
    </Suspense>
  );
}

function EventsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  type EventCard = {
    id: string;
    title: string;
    subtitle: string;
    banner: string;
    status: "live" | "upcoming" | "ended";
    ctaLabel: string;
    ctaHref: string;
  };

  const events = useMemo<EventCard[]>(
    () => [
      {
        id: "e-1",
        title: "週末加碼：市集收藏回饋",
        subtitle: "完成收藏與回訪任務，解鎖額外 points。",
        banner: "/cardx/placeholder.svg",
        status: "live",
        ctaLabel: "前往市集",
        ctaHref: "/market",
      },
      {
        id: "e-2",
        title: "交換季：提升媒合成功率",
        subtitle: "瀏覽交換詳情並建立收藏清單。",
        banner: "/cardx/placeholder.svg",
        status: "upcoming",
        ctaLabel: "前往交換",
        ctaHref: "/trades",
      },
      {
        id: "e-3",
        title: "卡包週：新手任務加成",
        subtitle: "查看卡包詳情與剩餘庫存，快速上手。",
        banner: "/cardx/placeholder.svg",
        status: "ended",
        ctaLabel: "前往卡包",
        ctaHref: "/packs",
      },
    ],
    []
  );

  useEffect(() => {
    const idParam = (searchParams?.get("id") ?? "").trim();
    setSelectedId((prev) => (prev === (idParam || null) ? prev : idParam || null));
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedId) params.set("id", selectedId);
    const qs = params.toString();
    router.replace(qs ? `/events?${qs}` : "/events");
  }, [router, selectedId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSelectedId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selected = useMemo(() => (selectedId ? events.find((x) => x.id === selectedId) ?? null : null), [events, selectedId]);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="活動" subtitle="週期活動與任務加碼" />

            <div style={{ marginTop: 14, display: "grid", gap: 12, width: "100%" }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", width: "100%" }}>
                {events.map((e) => {
                  const badgeTone = e.status === "live" ? "success" : e.status === "upcoming" ? "info" : "muted";
                  const badgeLabel = e.status === "live" ? "進行中" : e.status === "upcoming" ? "即將開始" : "已結束";
                  return (
                    <SurfaceCard key={e.id} style={{ padding: 0, overflow: "hidden" }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(e.id)}
                        onKeyDown={(ev) => {
                          if (ev.key !== "Enter" && ev.key !== " ") return;
                          ev.preventDefault();
                          setSelectedId(e.id);
                        }}
                        style={{
                          width: "100%",
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "grid",
                        }}
                      >
                        <div style={{ position: "relative", height: 160 }}>
                          <Image
                            src={e.banner}
                            alt=""
                            fill
                            unoptimized
                            sizes="(max-width: 1023px) 92vw, 860px"
                            style={{ objectFit: "cover" }}
                            priority={e.id === "e-1"}
                          />
                          <div style={{ position: "absolute", top: 12, left: 12 }}>
                            <Pill tone={badgeTone}>{badgeLabel}</Pill>
                          </div>
                        </div>
                        <div style={{ padding: "12px 14px 14px", display: "grid", gap: 10 }}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <div style={{ fontSize: 15, fontWeight: 900, color: "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>{e.title}</div>
                            <div style={{ fontSize: 12, fontWeight: 750, color: "rgba(255,255,255,0.62)", lineHeight: 1.35 }}>{e.subtitle}</div>
                          </div>
                          <div
                            style={{ display: "flex", justifyContent: "flex-end" }}
                            onMouseDown={(ev) => ev.stopPropagation()}
                            onClickCapture={(ev) => ev.stopPropagation()}
                          >
                            <SecondaryButton
                              onClick={() => router.push(e.ctaHref)}
                              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.86)" }}
                            >
                              {e.ctaLabel}
                            </SecondaryButton>
                          </div>
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
            aria-label="活動詳情"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(860px, 96vw)",
              borderRadius: 18,
              background: "rgba(17, 25, 35, 0.92)",
              boxShadow: "0 18px 60px rgba(0, 0, 0, 0.6)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
              <SecondaryButton onClick={() => setSelectedId(null)} style={{ width: 38, padding: 0 }}>
                ×
              </SecondaryButton>
            </div>

            <div style={{ position: "relative", height: 220 }}>
              <Image src={selected.banner} alt="" fill unoptimized sizes="(max-width: 1023px) 92vw, 860px" style={{ objectFit: "cover" }} priority />
            </div>
            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 18, fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>{selected.title}</div>
                  <div style={{ fontSize: 13, fontWeight: 750, color: "rgba(255,255,255,0.62)", lineHeight: 1.4 }}>{selected.subtitle}</div>
                </div>
                <Button3D color="blue" onClick={() => router.push(selected.ctaHref)} style={{ height: 40 }}>
                  {selected.ctaLabel}
                </Button3D>
              </div>

              <SurfaceCard style={{ borderRadius: 16, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize: 13, fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>活動說明</div>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 750, color: "rgba(255,255,255,0.72)", lineHeight: 1.7 }}>
                  這裡是活動內容示例，用於展示版型。後續接上後端活動資料後，可替換成真實規則、時間與獎勵內容。
                </div>
              </SurfaceCard>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
