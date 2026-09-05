'use client';

/**
 * 1024 以上掛 cardx 的頁面。
 *
 * ⚠️ 門檻是 768（老闆 2026-09-05 定案：平板也走 cardx 殼，768～1279 側欄是窄欄、漢堡開抽屜；
 * 768 以下才是手機版）。改門檻時這幾個地方要一起動，缺一個就會兩套外殼疊在一起或都不出現：
 *   - 這裡的 `hidden md:block`
 *   - components/cardx/CardxRoute.tsx 的寬度判斷
 *   - 各雙軌頁面（app 底下的 page.tsx）的 useMinWidth(768)
 *   - components/Navbar.tsx 的 md:!hidden
 *   - components/FooterWrapper.tsx（cardx 路由一律不畫我們的頁尾）
 *   - cardx/components/layout/AppShell.module.css 的 max-width: 767px 那幾個區塊
 *
 * cardx 的頁面全是 client 元件、自己帶 AppShell（頂部工具列＋側欄＋≤1023 的抽屜與底部導覽），
 * 這裡只負責兩件事：`ssr:false` 動態載入（它們讀 localStorage，也不需要 SSR），
 * 外面包一層 `.cardx-root hidden lg:block`（cardx 的 globals 全收在 .cardx-root 底下；1024 以下不顯示）。
 */

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

const load = (p: () => Promise<{ default: ComponentType }>) => dynamic(p, { ssr: false });

export const CARDX_PAGES = {
  home: load(() => import('@/cardx/app/page')),
  packs: load(() => import('@/cardx/app/packs/page')),
  packDetail: load(() => import('@/cardx/app/packs/[id]/page')),
  leaderboard: load(() => import('@/cardx/app/leaderboard/page')),
  missions: load(() => import('@/cardx/app/missions/page')),
  news: load(() => import('@/cardx/app/news/page')),
  market: load(() => import('@/cardx/app/market/page')),
  marketDetail: load(() => import('@/cardx/app/market/[id]/page')),
  trades: load(() => import('@/cardx/app/trades/page')),
  tradeDetail: load(() => import('@/cardx/app/trades/[id]/page')),
  tradeNew: load(() => import('@/cardx/app/trades/new/page')),
  favorites: load(() => import('@/cardx/app/favorites/page')),
  recent: load(() => import('@/cardx/app/recent/page')),
  events: load(() => import('@/cardx/app/events/page')),
  rewards: load(() => import('@/cardx/app/rewards/page')),
  topics: load(() => import('@/cardx/app/topics/page')),
  trends: load(() => import('@/cardx/app/trends/page')),
  account: load(() => import('@/cardx/app/account/page')),
  addresses: load(() => import('@/cardx/app/account/addresses/page')),
  kyc: load(() => import('@/cardx/app/account/kyc/page')),
  checkout: load(() => import('@/cardx/app/checkout/page')),
  openings: load(() => import('@/cardx/app/openings/page')),
  openingDetail: load(() => import('@/cardx/app/openings/[id]/page')),
  orders: load(() => import('@/cardx/app/orders/page')),
  orderDetail: load(() => import('@/cardx/app/orders/[id]/page')),
  info: load(() => import('@/cardx/app/info/page')),
} as const;

export type CardxPageKey = keyof typeof CARDX_PAGES;

export default function CardxPage({ page }: { page: CardxPageKey }) {
  const Comp = CARDX_PAGES[page];
  return (
    <div className="cardx-root hidden md:block" data-cardx-page={page}>
      <Comp />
    </div>
  );
}
