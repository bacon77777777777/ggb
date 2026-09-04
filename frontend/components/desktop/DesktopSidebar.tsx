'use client';

/**
 * 電腦端左側欄（≥1024 才有；老闆 2026-09-04：外殼照 cardx，改亮色）
 *
 * cardx 的量法：導覽列 64 高、側欄 230 寬（收合 50）、內距 12、
 * 項目 14px/600、內距 10×12、圓角 8、間距 4，選中的那一項加底色。
 * 我們導覽列是 57 高，側欄從它下緣開始貼到底、固定不捲。
 *
 * 項目清單是老闆 2026-09-04 確認的：首頁｜一番賞 盒玩 轉蛋 抽卡 自製賞 機台｜情報 排行榜 倉庫。
 * （活動沒有列表頁，先不放。）分類跟著後台的功能開關：關閉的不出現、維護中照常出現。
 *
 * 分類點下去的行為跟首頁頂部頁籤一樣，只是入口移到這裡：
 * 人在首頁 → 發事件叫首頁切頁籤；不在首頁 → 換頁到 `/?tab=…`。
 * 首頁有自建分類（後台選單）時會把整份頁籤清單播過來，這裡照著列。
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Star, Box, Dna, Layers, Gift, Gamepad2, Newspaper, Crown, Package, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { categoryState, CATEGORY_LABELS } from '@/lib/categoryFlags';
import { useDesktopShell } from '@/contexts/DesktopShellContext';
import { isCardxRoute } from '@/lib/cardxRoutes';
import {
  HOME_TABS_EVENT, SET_HOME_TAB_EVENT, RESET_HOME_EVENT,
  SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, homeTabHref, type HomeTabsDetail,
} from '@/lib/desktopShell';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ichiban: Star, blindbox: Box, gacha: Dna, card: Layers, custom: Gift,
};
const CATEGORY_ORDER = ['ichiban', 'blindbox', 'gacha', 'card', 'custom'] as const;

interface Item {
  id: string;
  label: string;
  icon: LucideIcon;
  /** 首頁頁籤（走事件／`?tab=`）還是一般路由 */
  kind: 'home-tab' | 'route';
  href: string;
  active: boolean;
}

/** 導覽列上的收合鈕（放在 logo 左邊，只有 ≥1024 出現） */
export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggle } = useDesktopShell();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? '展開側欄' : '收合側欄'}
      title={collapsed ? '展開側欄' : '收合側欄'}
      className={cn(
        'hidden lg:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors',
        'hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white',
        className,
      )}
    >
      <Icon className="h-5 w-5 stroke-[2]" />
    </button>
  );
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed } = useDesktopShell();
  const { states: flagStates, isLoading: flagsLoading } = useFeatureFlags();

  // 首頁播過來的頁籤清單與選中項；離開首頁就清掉，回到靜態清單
  const [homeTabs, setHomeTabs] = useState<HomeTabsDetail | null>(null);
  useEffect(() => {
    const onTabs = (e: Event) => setHomeTabs((e as CustomEvent<HomeTabsDetail>).detail);
    window.addEventListener(HOME_TABS_EVENT, onTabs);
    return () => window.removeEventListener(HOME_TABS_EVENT, onTabs);
  }, []);
  useEffect(() => { if (pathname !== '/') setHomeTabs(null); }, [pathname]);

  // 倉庫是會員頁的分頁（/profile?tab=warehouse），要看 query 才知道是不是它
  const [search, setSearch] = useState('');
  useEffect(() => { setSearch(window.location.search); }, [pathname]);

  const isHome = pathname === '/';
  const activeHomeTab = isHome ? (homeTabs?.active ?? 'all') : null;

  // 分類：首頁有播清單就照它（含自建分類），否則照功能開關列內建五類
  const categories: Item[] = (() => {
    if (homeTabs) {
      return homeTabs.tabs
        .filter((t) => t.id !== 'all' && t.id !== 'sell' && t.id !== 'exchange')
        .map((t) => ({
          id: t.id, label: t.label, kind: 'home-tab' as const, href: homeTabHref(t.id),
          icon: CATEGORY_ICONS[t.id] ?? Layers,
          active: activeHomeTab === t.id,
        }));
    }
    return CATEGORY_ORDER
      .filter((type) => flagsLoading || categoryState(type, flagStates, false) !== 'off')
      .map((type) => ({
        id: type, label: CATEGORY_LABELS[type], kind: 'home-tab' as const, href: homeTabHref(type),
        icon: CATEGORY_ICONS[type], active: false,
      }));
  })();

  const slotOn = flagsLoading || (flagStates.slot ?? 'on') !== 'off';

  const groups: Item[][] = [
    [{ id: 'home', label: '首頁', icon: Home, kind: 'home-tab', href: '/', active: isHome && activeHomeTab === 'all' }],
    [
      ...categories,
      ...(slotOn ? [{
        id: 'slot', label: CATEGORY_LABELS.slot, icon: Gamepad2, kind: 'route' as const, href: '/challenge',
        active: pathname === '/challenge' || pathname.startsWith('/challenge/'),
      }] : []),
    ],
    [
      { id: 'news', label: '情報', icon: Newspaper, kind: 'route', href: '/news', active: pathname === '/news' || pathname.startsWith('/news/') },
      { id: 'ranking', label: '排行榜', icon: Crown, kind: 'route', href: '/ranking', active: pathname === '/ranking' },
      { id: 'warehouse', label: '倉庫', icon: Package, kind: 'route', href: '/profile?tab=warehouse', active: pathname === '/profile' && /[?&]tab=warehouse/.test(search) },
    ],
  ];

  const go = useCallback((item: Item, e: React.MouseEvent) => {
    if (item.kind !== 'home-tab') return; // 一般路由交給 <Link>
    if (!isHome) return; // 不在首頁：<Link> 換頁到 /?tab=…，首頁掛載時自己讀網址
    e.preventDefault();
    if (item.id === 'home') {
      window.dispatchEvent(new CustomEvent(RESET_HOME_EVENT));
    } else {
      window.dispatchEvent(new CustomEvent(SET_HOME_TAB_EVENT, { detail: item.id }));
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    // 網址也跟上（分享／重新整理才會停在同一籤）；不用 router 免得整頁重跑
    window.history.replaceState(window.history.state, '', item.href);
  }, [isHome]);

  // 一般路由的 prefetch：首頁那顆跟分類共用 <Link>，不用另外處理
  void router;

  // 768 以上換 cardx 的頁面時側欄是它的 AppShell 的（lib/cardxRoutes）
  if (isCardxRoute(pathname)) return null;

  return (
    <aside
      data-testid="desktop-sidebar"
      className={cn(
        'fixed bottom-0 left-0 top-[57px] z-40 hidden flex-col border-r border-neutral-100 bg-white p-3 transition-[width] duration-200 lg:flex',
        'dark:border-neutral-800 dark:bg-neutral-900',
      )}
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
    >
      <nav className="flex flex-col gap-1">
        {groups.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && <div className="my-2 border-t border-neutral-100 dark:border-neutral-800" />}
            {group.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={(e) => go(item, e)}
                  title={collapsed ? item.label : undefined}
                  aria-current={item.active ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-lg text-[14px] font-bold leading-none transition-colors',
                    collapsed ? 'justify-center px-0' : 'px-3',
                    item.active
                      ? 'bg-primary-soft text-primary dark:bg-primary/15'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 stroke-[2]" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </React.Fragment>
        ))}
      </nav>
    </aside>
  );
}
