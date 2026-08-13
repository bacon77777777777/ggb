'use client';

import Link from 'next/link';

/*
 * 商城底部導航 —— 照原型（docs/prototypes/ggb-market-taobao_1.html）的
 * .tabbar 四格與 SVG 原樣搬過來。
 *
 * 為什麼不用站上的全域 MobileTabbar：那支只在 mainTabPaths 裡的頁面顯示，
 * 商城不在名單內所以整組不出現（老闆看到的就是這個）。商城是自成一區的動線
 * （C2C／官方／訂單／我的），把它塞進全域頁籤會讓首頁那排變成五、六格。
 */

export type MarketTab = 'market' | 'official' | 'orders' | 'me';

const ITEMS: { key: MarketTab; label: string; href: string; icon: React.ReactNode }[] = [
  {
    key: 'market',
    label: 'C2C',
    href: '/sell',
    icon: (
      <>
        <path d="M3 9l1.5-5h15L21 9M4.5 9v11h15V9M4.5 9h15" />
        <path d="M9.5 20v-6h5v6" />
      </>
    ),
  },
  {
    key: 'official',
    label: '官方旗艦',
    href: '/sell?tab=official',
    icon: <path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z" />,
  },
  {
    key: 'orders',
    label: '訂單',
    href: '/purchases?tab=sell',
    icon: (
      <>
        <path d="M6.5 3L4 6.5V20a1 1 0 001 1h14a1 1 0 001-1V6.5L17.5 3z" />
        <path d="M4 6.5h16M15.5 10a3.5 3.5 0 01-7 0" />
      </>
    ),
  },
  {
    key: 'me',
    label: '我的',
    href: '/sell/manage',
    icon: (
      <>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.5 20.5a7.5 7.5 0 0115 0" />
      </>
    ),
  },
];

export default function MarketTabBar({
  active,
  onSelect,
}: {
  active: MarketTab;
  /** 同一頁內切換（C2C ↔ 官方）時不要換路由，直接切分頁 */
  onSelect?: (tab: MarketTab) => void;
}) {
  return (
    <nav className="mk-tabbar" role="tablist">
      {ITEMS.map((it) => {
        const selected = active === it.key;
        const content = (
          <>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              {it.icon}
            </svg>
            {it.label}
          </>
        );

        // C2C / 官方 都在同一頁，交給呼叫端切分頁；訂單與我的才真的換頁
        if (onSelect && (it.key === 'market' || it.key === 'official')) {
          return (
            <button key={it.key} type="button" role="tab" aria-selected={selected} onClick={() => onSelect(it.key)}>
              {content}
            </button>
          );
        }
        return (
          <Link key={it.key} href={it.href} role="tab" aria-selected={selected}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
