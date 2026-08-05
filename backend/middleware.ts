import { NextRequest, NextResponse } from 'next/server'
import { firstAccessiblePath, MENU_PATH_ORDER } from '@/lib/permissionPaths'

// Lightweight session parser for Edge Runtime (no Node.js crypto)
// Full HMAC verification still happens in every API route via requireAdminSession()
type SessionPayload = { adminId: string; exp: number; role?: string; permissions?: string[]; supplierId?: number }
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

/**
 * 廠商角色可以呼叫的後台 API —— 白名單，不在清單上一律 403。
 *
 * 為什麼要在 middleware 做而不是每支 API 自己判斷：
 * 後台有 104 支 admin API，其中 26 支會吐商品／訂單資料。
 * 一支一支加過濾的話，漏掉的那支就是外洩，而且不會有人發現。
 * 反過來用白名單，新增的 API 預設不在清單上 —— 漏掉的後果是「壞掉」，
 * 有人會馬上回報，不是「安靜地把別家廠商的資料送出去」。
 *
 * 注意：middleware 在 Edge 執行，只解析 token 不驗簽。
 * 這對「拒絕」的判斷是安全的 —— 偽造 token 宣稱自己是 supplier 只會被限縮更多；
 * 想偽造成 super_admin 繞過這裡的話，路由裡的 requireAdminSession() 會做完整 HMAC 驗簽擋下來。
 */
const SUPPLIER_API_ALLOW: string[] = [
  '/api/admin/auth',              // 登出、取得自己的身份
  '/api/admin/products',          // 商品（route 內依 supplier_id 限縮，且擋掉刪除）
  '/api/admin/categories',        // 編輯商品時要選分類
  '/api/admin/upload',            // 上傳商品圖
  '/api/admin/suppliers',         // 結算頁的廠商下拉（route 內只回自己那家）
  '/api/admin/reports',           // 廠商結算（route 內強制蓋成自己的 supplierId）
]

/**
 * 廠商禁區 —— 即使在白名單的前綴底下也一律 403。
 *
 * `/api/admin/products` 是允許的，但它底下有幾支不該給廠商：
 *   seal / seal-now  籤號封存，動到公平性驗證的基礎
 *   close-out        結案出清
 *   batch            批次上下架（會跨到別家商品）
 *   verify           公平性驗證資料
 * 老闆的要求是「廠商只能編輯，不得刪除跟驗證」。
 */
const SUPPLIER_API_DENY: string[] = [
  '/api/admin/products/batch',
  '/api/admin/products/import/commit',
]
const SUPPLIER_API_DENY_SUFFIX: string[] = ['/seal', '/seal-now', '/close-out', '/verify']

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
  { prefix: '/reports/coupons',     permission: 'coupons_report' },
  { prefix: '/reports/products',    permission: 'reports_products' },
  { prefix: '/reports/dismantled',  permission: 'reports_dismantled' },
  { prefix: '/reports/settlement',  permission: 'reports_settlement' },
  { prefix: '/settlement-snapshots',permission: 'settlement_snapshots' },
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

  // ── 以下原本完全沒有規則，任何登入者都進得去 ──
  // 稽核 70 個後台頁面時發現有 21 個是裸的。對一般管理員影響不大
  // （他們本來權限就寬），但廠商角色一開出去就是外洩：
  // 廠商登入後直接打 /token-ledger 就看得到全站代幣帳本。
  // 規則排序是「前綴最長者優先」，所以 /reports 這種父層放最後當保底。
  { prefix: '/token-ledger',           permission: 'recharges' },
  { prefix: '/dismantled',             permission: 'reports_dismantled' },
  { prefix: '/reports/points',         permission: 'reports_overview' },
  { prefix: '/leaderboard-bots',       permission: 'users' },
  { prefix: '/slot',                   permission: 'products' },
  { prefix: '/small-items',            permission: 'products' },
  { prefix: '/announcements',          permission: 'announcements' },
  { prefix: '/events',                 permission: 'events' },
  { prefix: '/cs-management',          permission: 'cs_management' },
  { prefix: '/ai-usage',               permission: 'tools' },
  { prefix: '/design-system',          permission: 'tools' },
  { prefix: '/frontend-design-system', permission: 'tools' },
  // 父層保底：/reports/xxx 各自的規則前綴更長，會優先命中
  { prefix: '/reports',                permission: 'reports_overview' },
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 靜態資源與 Next.js 內部路徑直接放行
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    (pathname.includes('.') && !pathname.startsWith('/api/'))
  ) {
    return NextResponse.next()
  }

  // API 路徑：只對廠商角色做白名單過濾，其餘身份的權限判斷仍在各路由的
  // requireAdminSession() 裡（那裡才有完整 HMAC 驗簽）
  if (pathname.startsWith('/api/')) {
    const apiToken = request.cookies.get('admin_session')?.value
    const apiSession = apiToken ? parseSession(apiToken) : null

    if (apiSession?.role === 'supplier') {
      const denied =
        SUPPLIER_API_DENY.some(p => pathname === p || pathname.startsWith(p + '/')) ||
        SUPPLIER_API_DENY_SUFFIX.some(sfx => pathname.endsWith(sfx))
      const allowed = !denied && SUPPLIER_API_ALLOW.some(
        p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')
      )
      if (!allowed) {
        return NextResponse.json(
          { error: '此功能不開放廠商帳號使用' },
          { status: 403 },
        )
      }
    }
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

  // 廠商只有商品管理，連公平性驗證頁都不給 —— 那是平台對玩家的承諾，
  // 讓供貨方看得到封存內容等於把驗證的意義抵銷掉
  if (session.role === 'supplier') {
    const ok =
      pathname === '/products' ||
      (pathname.startsWith('/products/') && !pathname.endsWith('/verify')) ||
      pathname === '/reports/settlement'
    if (!ok) return NextResponse.redirect(new URL('/products', request.url))
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
