import type { SidebarItem } from "@/cardx/lib/types";

export const defaultSidebarItems: SidebarItem[] = [
  { kind: "link", label: "收藏", href: "/favorites" },
  { kind: "link", label: "近期", href: "/recent" },
  { kind: "divider" },
  { kind: "link", label: "市集", href: "/market" },
  { kind: "link", label: "卡包", href: "/packs" },
  { kind: "divider" },
  { kind: "link", label: "交換", href: "/trades" },
  { kind: "link", label: "任務", href: "/missions" },
  { kind: "link", label: "活動", href: "/events" },
  { kind: "link", label: "排行榜", href: "/leaderboard" },
  { kind: "link", label: "獎勵", href: "/rewards" },
  { kind: "link", label: "最新消息", href: "/news" },
  { kind: "link", label: "話題", href: "/topics" },
  { kind: "link", label: "卡牌走勢", href: "/trends" },
];
