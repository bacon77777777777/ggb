import type { SidebarItem } from "@/cardx/lib/types";

/**
 * 左側欄（老闆 2026-09-04 指定的清單）。
 * 五個抽獎類別切首頁的類別 tab（/?tab=…，首頁照網址切籤）；
 * 挑戰機台／商城／通知 cardx 沒有對應頁，先「點了沒反應」（disabled）。
 * 圖示對照在 AppShell 的 iconForLabel。
 */
export const defaultSidebarItems: SidebarItem[] = [
  { kind: "link", label: "收藏", href: "/favorites" },
  { kind: "link", label: "近期", href: "/recent" },
  { kind: "divider" },
  { kind: "link", label: "一番賞", href: "/?tab=ichiban" },
  { kind: "link", label: "盒玩", href: "/?tab=blindbox" },
  { kind: "link", label: "轉蛋", href: "/?tab=gacha" },
  { kind: "link", label: "抽卡", href: "/?tab=card" },
  { kind: "link", label: "自製賞", href: "/?tab=custom" },
  { kind: "link", label: "挑戰機台", href: "#", disabled: true },
  { kind: "divider" },
  { kind: "link", label: "交易所", href: "/market" },
  { kind: "link", label: "商城", href: "#", disabled: true },
  { kind: "link", label: "卡牌交換", href: "/trades" },
  { kind: "link", label: "卡牌走勢", href: "/trends" },
  { kind: "divider" },
  { kind: "link", label: "排行榜", href: "/leaderboard" },
  { kind: "link", label: "活動", href: "/events" },
  { kind: "link", label: "情報", href: "/news" },
  { kind: "link", label: "話題", href: "/topics" },
  { kind: "link", label: "通知", href: "#", disabled: true },
];
