import type { SidebarItem } from "@/cardx/lib/types";

/**
 * 左側欄（老闆 2026-09-04 指定的清單）。
 * 商城／通知 cardx 沒有對應頁，先「點了沒反應」（disabled）。
 * 圖示對照在 AppShell 的 iconForLabel。
 */
export const defaultSidebarItems: SidebarItem[] = [
  { kind: "link", label: "收藏", href: "/favorites" },
  { kind: "link", label: "近期", href: "/recent" },
  // 老闆 2026-09-04 晚上：五個抽獎類別（一番賞／盒玩／轉蛋／抽卡／自製賞）從側欄移除——首頁的類別 tab 已經有了；
  // 挑戰機台先隱藏（cardx 沒對應頁），要開回來時放回這裡：{ kind: "link", label: "挑戰機台", href: "#", disabled: true }
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
