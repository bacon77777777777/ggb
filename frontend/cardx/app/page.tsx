"use client";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { HomeClient } from "@/cardx/components/home/HomeClient";
import { defaultSidebarItems } from "@/cardx/lib/navigation";

export default function Home() {
  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <HomeClient />
    </AppShell>
  );
}
