// Shared priority-ordered list of all protected paths with their required permission.
// Used by middleware (redirect target) and login page (initial redirect).
// Order = sidebar order = user's "most important" page first.

export const MENU_PATH_ORDER: Array<{ path: string; permission: string }> = [
  { path: '/dashboard',          permission: 'dashboard' },
  { path: '/reports/overview',   permission: 'reports_overview' },
  { path: '/reports/behavior',   permission: 'reports_behavior' },
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
