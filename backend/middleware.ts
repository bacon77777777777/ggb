import { NextRequest, NextResponse } from 'next/server'
import { firstAccessiblePath, MENU_PATH_ORDER } from '@/lib/permissionPaths'

// Lightweight session parser for Edge Runtime (no Node.js crypto)
// Full HMAC verification still happens in every API route via requireAdminSession()
type SessionPayload = { adminId: string; exp: number; role?: string; permissions?: string[] }
function parseSession(token: string): SessionPayload | null {
  const [body] = token.split('.')
  if (!body) return null
  try {
    const pad = body.length % 4 === 0 ? '' : '='.repeat(4 - (body.length % 4))
    const json = atob((body + pad).replace(/-/g, '+').replace(/_/g, '/'))
    const parsed = JSON.parse(json) as SessionPayload
    if (!parsed?.adminId || !parsed?.exp) return null
    if (Date.now() >= parsed.exp * 1000) return null
    return parsed
  } catch {
    return null
  }
}

// Pages that don't require authentication
const PUBLIC_PATHS = ['/login', '/no-access']

// Path prefix → required permission
// Built from MENU_PATH_ORDER + additional sub-paths that share permissions
const PATH_PERMISSIONS: Array<{ prefix: string; permission: string }> = [
  // 營運總覽
  { prefix: '/dashboard',           permission: 'dashboard' },
  { prefix: '/reports/overview',    permission: 'reports_overview' },
  { prefix: '/reports/behavior',    permission: 'reports_behavior' },
  // 對帳報表
  { prefix: '/recharges',           permission: 'recharges' },
  { prefix: '/recharge-review',     permission: 'recharge_review' },
  { prefix: '/reports/logistics',   permission: 'reports_logistics' },
  { prefix: '/reports/coupons',     permission: 'coupons' },
  { prefix: '/reports/products',    permission: 'reports_products' },
  { prefix: '/reports/dismantled',  permission: 'reports_dismantled' },
  { prefix: '/reports/settlement',  permission: 'reports_settlement' },
  { prefix: '/settlement-snapshots',permission: 'reports_settlement' },
  // 抽獎管理
  { prefix: '/draws',               permission: 'draws' },
  { prefix: '/orders',              permission: 'orders' },
  { prefix: '/refund-requests',     permission: 'orders' },
  { prefix: '/products',            permission: 'products' },
  { prefix: '/suppliers',           permission: 'suppliers' },
  { prefix: '/categories',          permission: 'categories' },
  { prefix: '/coupons',             permission: 'coupons' },
  { prefix: '/marketplace',         permission: 'marketplace' },
  // 系統設定 (specific rules before /settings catch-all)
  { prefix: '/users',               permission: 'users' },
  { prefix: '/banners',             permission: 'banners' },
  { prefix: '/news',                permission: 'news' },
  { prefix: '/settings/modules',    permission: 'settings_modules' },
  { prefix: '/settings/features',   permission: 'settings_features' },
  { prefix: '/settings/shipping',   permission: 'settings_shipping' },
  { prefix: '/settings',            permission: 'settings' },
  { prefix: '/analytics',           permission: 'admins' },
  { prefix: '/permissions',         permission: 'permissions' },
  { prefix: '/logs',                permission: 'logs' },
  { prefix: '/dev-logs',            permission: 'dev_logs' },
  { prefix: '/tools',               permission: 'tools' },
  // 販售
  { prefix: '/sell-orders',         permission: 'sell_orders' },
  { prefix: '/sell',                permission: 'sell' },
  // 交換
  { prefix: '/exchange-orders',     permission: 'exchange_orders' },
  { prefix: '/exchange',            permission: 'exchange' },
  // 其他黑科技
  { prefix: '/agent-events',        permission: 'agent_events' },
  { prefix: '/competitor-intel',    permission: 'competitor_intel' },
  { prefix: '/content-drafts',      permission: 'content_drafts' },
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip API routes, static assets, Next.js internals
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Public pages — let through
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const token = request.cookies.get('admin_session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const session = parseSession(token)
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('admin_session')
    return res
  }

  // superadmin bypasses all permission checks
  if (session.role === 'super_admin' || session.role === 'superadmin') {
    return NextResponse.next()
  }

  // Old tokens without permissions → force re-login
  if (!session.permissions) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('admin_session')
    return res
  }

  // Find required permission for this path (use most specific match)
  const match = PATH_PERMISSIONS
    .filter((rule) => pathname === rule.prefix || pathname.startsWith(rule.prefix + '/') || pathname.startsWith(rule.prefix + '?'))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]

  if (match && !session.permissions.includes(match.permission)) {
    const target = firstAccessiblePath(session.permissions, session.role)
    // Prevent redirect loop if target is also blocked (shouldn't happen, but guard anyway)
    if (target !== pathname) {
      return NextResponse.redirect(new URL(target, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
