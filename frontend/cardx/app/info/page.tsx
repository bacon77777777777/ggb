"use client";

import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import homeStyles from "@/cardx/components/home/HomeClient.module.css";
import { PageHeader, SurfaceCard, SurfaceRowLink } from "@/cardx/components/ui/Kit";

export default function InfoPage() {
  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div className={homeStyles.main2}>
        <div className={homeStyles.main}>
          <div className={homeStyles.sectionLobby}>
            <PageHeader title="資訊" />

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <SurfaceCard style={{ display: "grid", gap: 10 }}>
                {[
                  { title: "公告與平台消息", desc: "查看更新、維護與功能公告。", href: "/news" },
                  { title: "話題", desc: "追蹤熱門討論與關鍵字。", href: "/topics" },
                  { title: "卡牌走勢", desc: "查看近期價格變動與趨勢。", href: "/trends" },
                ].map((x) => (
                  <SurfaceRowLink key={x.href} href={x.href}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 950, color: "#111827" }}>{x.title}</div>
                      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{x.desc}</div>
                    </div>
                    <span aria-hidden="true" style={{ color: "#6b7280", fontWeight: 900 }}>
                      →
                    </span>
                  </SurfaceRowLink>
                ))}
              </SurfaceCard>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
