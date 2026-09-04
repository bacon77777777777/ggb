import type { SidebarItem } from "@/cardx/lib/types";

/**
 * 左側欄（老闆 2026-09-04 指定的清單）。
 * 圖示對照在 AppShell 的 iconForLabel。
 */
export const defaultSidebarItems: SidebarItem[] = [
  { kind: "link", label: "收藏", href: "/favorites" },
  { kind: "link", label: "近期", href: "/recent" },
  // 老闆 2026-09-04 晚上：五個抽獎類別（一番賞／盒玩／轉蛋／抽卡／自製賞）從側欄移除——首頁的類別 tab 已經有了；
  // 挑戰機台先隱藏（cardx 沒對應頁），要開回來時放回這裡：{ kind: "link", label: "挑戰機台", href: "#", disabled: true }
  { kind: "divider" },
  { kind: "link", label: "交易所", href: "/market" },
  // 商城與通知 cardx 沒有自己的頁，連到站上原本那兩頁（外框會換成主站的導覽列）
  { kind: "link", label: "商城", href: "/sell" },
  { kind: "link", label: "卡牌交換", href: "/trades" },
  // 這頁接的是交易所實際成交的行情，不是卡牌市價（那張表前台沒有讀取權限），名稱要對得上內容
  { kind: "link", label: "成交行情", href: "/trends" },
  { kind: "divider" },
  { kind: "link", label: "排行榜", href: "/leaderboard" },
  { kind: "link", label: "活動", href: "/events" },
  { kind: "link", label: "情報", href: "/news" },
  { kind: "link", label: "話題", href: "/topics" },
  { kind: "link", label: "任務", href: "/missions" },
  { kind: "link", label: "獎勵", href: "/rewards" },
  { kind: "link", label: "通知", href: "/announcements" },
];
