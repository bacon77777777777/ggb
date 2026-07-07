import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession } from '@/lib/adminSession'

// Pages that don't require authentication
const PUBLIC_PATHS = ['/login']

// Path prefix → required permission (undefined = accessible to all authenticated users)
const PATH_PERMISSIONS: Array<{ prefix: string; permission: string }> = [
  { prefix: '/recharges', permission: 'recharges' },
  { prefix: '/recharge-review', permission: 'recharges' },
  { prefix: '/reports/logistics', permission: 'reports_logistics' },
  { prefix: '/reports/products', permission: 'reports_products' },
  { prefix: '/reports/dismantled', permission: 'reports_dismantled' },
  { prefix: '/reports/settlement', permission: 'reports_settlement' },
  { prefix: '/settlement-snapshots', permission: 'reports_settlement' },
  { prefix: '/draws', permission: 'draws' },
  { prefix: '/orders', permission: 'orders' },
  { prefix: '/refund-requests', permission: 'orders' },
  { prefix: '/users', permission: 'users' },
  { prefix: '/products', permission: 'products' },
  { prefix: '/suppliers', permission: 'suppliers' },
  { prefix: '/categories', permission: 'categories' },
  { prefix: '/banners', permission: 'banners' },
  { prefix: '/news', permission: 'news' },
  { prefix: '/coupons', permission: 'coupons' },
  { prefix: '/logs', permission: 'logs' },
  { prefix: '/dev-logs', permission: 'logs' },
  { prefix: '/permissions', permission: 'permissions' },
  { prefix: '/settings/modules', permission: 'settings_modules' },
  { prefix: '/settings', permission: 'settings' },
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

  const session = verifyAdminSession(token)
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('admin_session')
    return res
  }

  // superadmin bypasses all permission checks
  if (session.role === 'superadmin') {
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
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
