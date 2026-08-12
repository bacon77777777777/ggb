// Shared priority-ordered list of all protected paths with their required permission.
// Used by middleware (redirect target) and login page (initial redirect).
// Order = sidebar order = user's "most important" page first.

export const MENU_PATH_ORDER: Array<{ path: string; permission: string }> = [
  { path: '/dashboard',          permission: 'dashboard' },
  // 營運總覽收成三頁：數據分析（併了原轉換分析／點擊分析）、廠商儀表板。
  // 舊的 /reports/overview 與 /reports/behavior 不再掛選單，權限跟著數據分析走，
  // 排在這裡是為了「登入後導到第一個有權限的頁」時順序正確。
  { path: '/analytics-overview', permission: 'analytics_overview' },
  { path: '/analytics-supplier', permission: 'analytics_supplier' },
  { path: '/recharges',          permission: 'recharges' },
  { path: '/reports/logistics',  permission: 'reports_logistics' },
  { path: '/reports/products',   permission: 'reports_products' },
  { path: '/reports/dismantled', permission: 'reports_dismantled' },
  { path: '/reports/settlement', permission: 'reports_settlement' },
  { path: '/products',           permission: 'products' },
  { path: '/draws',              permission: 'draws' },
  { path: '/orders',             permission: 'orders' },
  { path: '/coupons',            permission: 'coupons' },
  { path: '/settings/shipping',  permission: 'settings_shipping' },
  { path: '/users',              permission: 'users' },
  { path: '/recharge-review',    permission: 'recharge_review' },
  { path: '/suppliers',          permission: 'suppliers' },
  { path: '/banners',            permission: 'banners' },
  { path: '/news',               permission: 'news' },
  { path: '/categories',         permission: 'categories' },
  { path: '/settings/modules',   permission: 'settings_modules' },
  { path: '/settings/features',  permission: 'settings_features' },
  { path: '/products/import',    permission: 'products' },
  { path: '/settings/promotions',permission: 'settings_features' },
  { path: '/settings/theme',     permission: 'settings_theme' },
  { path: '/analytics',          permission: 'admins' },
  { path: '/permissions',        permission: 'permissions' },
  { path: '/logs',               permission: 'logs' },
  { path: '/tools',              permission: 'tools' },
  { path: '/marketplace',        permission: 'marketplace' },
  { path: '/sell',               permission: 'sell' },
  { path: '/sell-orders',        permission: 'sell_orders' },
  { path: '/exchange',           permission: 'exchange' },
  { path: '/exchange-orders',    permission: 'exchange_orders' },
  { path: '/agent-events',       permission: 'agent_events' },
  { path: '/competitor-intel',   permission: 'competitor_intel' },
  { path: '/content-drafts',     permission: 'content_drafts' },
  { path: '/settings/rates',     permission: 'settings' },
]

export function firstAccessiblePath(permissions: string[], role?: string): string {
  if (role === 'super_admin' || role === 'superadmin') return '/dashboard'
  const found = MENU_PATH_ORDER.find(({ permission }) => permissions.includes(permission))
  return found?.path ?? '/no-access'
}
