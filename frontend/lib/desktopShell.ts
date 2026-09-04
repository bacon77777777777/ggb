/**
 * 電腦端外殼（≥1024：頂部導覽列＋左側可收合側欄，照 cardx 的 AppShell）的共用常數。
 *
 * 側欄是全站的（掛在 layout），首頁的分類頁籤卻是首頁自己的 state；
 * 兩邊用 window 事件講話，不把首頁那 2000 行的 state 往上搬：
 *   - 首頁 → 側欄：`HOME_TABS_EVENT`，把目前的頁籤清單與選中的那一顆播出去
 *     （自建分類是後台設的，只有首頁知道有哪些）
 *   - 側欄 → 首頁：`SET_HOME_TAB_EVENT`，人已經在首頁時直接切頁籤，不換頁
 *   - 不在首頁：側欄用 `/?tab=<id>`／`/?menu=<uuid>` 換頁，首頁掛載時自己會讀網址
 *
 * 768 以下沒有側欄，這些事件也沒人聽。
 */

export const SIDEBAR_WIDTH = 230;
export const SIDEBAR_COLLAPSED_WIDTH = 56;
export const SIDEBAR_STORAGE_KEY = 'ggb.sidebarCollapsed';

export const HOME_TABS_EVENT = 'ggb:homeTabs';
export const SET_HOME_TAB_EVENT = 'ggb:setHomeTab';
/** 既有：底部導覽「首頁」再點一次時首頁回到綜合並捲到頂（MobileTabbar 也在發） */
export const RESET_HOME_EVENT = 'ggb:resetHome';

export interface HomeTabsDetail {
  tabs: { id: string; label: string }[];
  active: string;
}

/** 首頁頁籤 id → 網址（內建頁籤走 `?tab=`、自建分類走 `?menu=`） */
export function homeTabHref(tabId: string): string {
  if (tabId === 'all') return '/';
  if (tabId.startsWith('menu:')) return `/?menu=${encodeURIComponent(tabId.slice('menu:'.length))}`;
  return `/?tab=${encodeURIComponent(tabId)}`;
}
