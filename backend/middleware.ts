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
const PUBLIC_PATHS = ['/login', '/no-access', '/maintenance']

/**
 * 後台維護模式
 *
 * 每個請求都查資料庫會把維護狀態變成每一頁的額外延遲，所以快取 20 秒 ——
 * 維護是低頻事件，開啟後最多 20 秒全站生效。
 *
 * 查不到就當作沒維護：資料庫掛掉時不該連帶把後台鎖住，
 * 那正好是最需要進後台看狀況的時候。
 *
 * 超級管理員不受維護限制 —— 維護中還是要有人能進去修東西。
 */
let maintCache: { scope: string; at: number } = { scope: 'off', at: 0 }
const MAINT_TTL_MS = 20_000

async function getMaintenanceScope(): Promise<string> {
  if (Date.now() - maintCache.at < MAINT_TTL_MS) return maintCache.scope
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return 'off'
  try {
    const res = await fetch(`${url}/rest/v1/public_maintenance?select=scope`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    })
    const rows = await res.json()
    const scope = Array.isArray(rows) ? (rows[0]?.scope ?? 'off') : 'off'
    maintCache = { scope, at: Date.now() }
    return scope
  } catch {
    maintCache = { scope: 'off', at: Date.now() }
    return 'off'
  }
}

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
  '/api/admin/analytics-supplier',// 廠商分析（同上，且整支只算單一廠商的數字）
  // 配送申請（老闆 2026-08-09）：route 內依 supplier_id 限縮＋玩家個資遮罩，
  // 出貨/改單（PUT、batch）在 route 內對廠商回 403 —— 這裡只放行「看」
  '/api/admin/orders',
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
  '/api/admin/orders/batch',
  '/api/admin/products/batch',
  // 整條批量匯入都不給 —— 只擋最後的 commit 的話，廠商會傳完檔案、看完預覽，
  // 按下上架才收到 403，那比一開始就沒有按鈕更糟。
  // 批量匯入本來就是平台人員拿廠商給的 list 來做的。
  '/api/admin/products/import',
  '/api/admin/products/upload-images',
]
const SUPPLIER_API_DENY_SUFFIX: string[] = ['/seal', '/seal-now', '/close-out', '/verify']

// Path prefix → required permission
// Built from MENU_PATH_ORDER + additional sub-paths that share permissions
// permission 可給陣列＝任一符合即可（例如廠商分析：營運看報表、廠商看自己的結算，兩邊都該進得去）
/*
 * ⚠️ 這張表必須跟 `components/AdminLayout.tsx` 的 `PATH_PERMISSION_MAP`（選單可見性）**成對**。
 * 兩邊對不上的後果分兩種，都很難查：
 *   選單放行、這裡擋 → 「看得到、點了沒反應」（實際是被踢回第一個有權限的頁）
 *   選單擋、這裡放行 → 有權限的人在選單上找不到那一頁，只能手打網址
 * 2026-08-24 稽核抓到 10 處（廠商看得到會計對接說明、會計看得到待審退款卻進不去、
 * 管理員的客服工單同樣狀況、挑戰機台在選單上對所有非超管隱形…）。
 * 有 `npm run check:permissions` 可以驗，新增頁面請跑一次（見 CLAUDE.md）。
 */
const PATH_PERMISSIONS: Array<{ prefix: string; permission: string | string[] }> = [
  // 營運總覽
  { prefix: '/dashboard',           permission: 'dashboard' },
  { prefix: '/reports/overview',    permission: ['reports_overview', 'analytics_overview'] },
  { prefix: '/reports/behavior',    permission: ['reports_behavior', 'analytics_overview'] },
  // 對帳報表
  { prefix: '/recharges',           permission: 'recharges' },
  { prefix: '/recharge-review',     permission: 'recharge_review' },
  { prefix: '/reports/logistics',   permission: 'reports_logistics' },
  { prefix: '/reports/coupons',     permission: 'coupons_report' },
  { prefix: '/reports/products',    permission: 'reports_products' },
  { prefix: '/reports/dismantled',  permission: 'reports_dismantled' },
  { prefix: '/reports/adjustments', permission: 'reports_adjustments' },
  { prefix: '/reports/settlement',  permission: 'reports_settlement' },
  // 這兩頁原本沒有規則，會落到最下面 `/reports` 的保底（reports_overview）——
  // 結果是「選單看得到、點進去被踢回去」（老闆 2026-08-24 廠商帳號截圖）。
  // 選單表（AdminLayout 的 PATH_PERMISSION_MAP）與這張表必須成對維護。
  { prefix: '/reports/accounting-guide', permission: 'reports_accounting_guide' },
  { prefix: '/reports/feed',        permission: 'reports_feed' },
  { prefix: '/settlement-snapshots',permission: 'settlement_snapshots' },
  // 抽獎管理
  { prefix: '/draws',               permission: 'draws' },
  { prefix: '/orders',              permission: 'orders' },
  { prefix: '/referrals',           permission: 'referrals' },
  { prefix: '/refund-requests',     permission: ['orders', 'header_refunds'] },
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
  { prefix: '/products/import',     permission: 'products' },
  { prefix: '/settings/promotions', permission: 'settings_promotions' },
  { prefix: '/settings/shipping',   permission: 'settings_shipping' },
  { prefix: '/settings/recycle',    permission: 'settings_recycle' },
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
  { prefix: '/slot/reports',           permission: ['slot_reports', 'slot', 'products'] },
  { prefix: '/slot',                   permission: ['slot', 'products'] },
  { prefix: '/small-items',            permission: 'products' },
  { prefix: '/announcements',          permission: 'announcements' },
  { prefix: '/events',                 permission: 'events' },
  { prefix: '/cs-management/tickets',  permission: ['cs_management', 'cs_tickets'] },
  { prefix: '/cs-management/sop',      permission: ['cs_management', 'cs_sop'] },
  { prefix: '/cs-management',          permission: 'cs_management' },
  { prefix: '/ai-usage',               permission: ['tools', 'ai_usage'] },
  // 維護頁本身不需要權限 —— 它就是給被擋下來的人看的
  { prefix: '/analytics-overview',     permission: 'analytics_overview' },
  { prefix: '/analytics-supplier',     permission: 'analytics_supplier' },
  { prefix: '/design-system',          permission: 'tools' },
  { prefix: '/frontend-design-system', permission: 'tools' },
  // 父層保底：/reports/xxx 各自的規則前綴更長，會優先命中
  { prefix: '/reports',                permission: 'reports_overview' },
]

export async function middleware(request: NextRequest) {
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

  // superadmin bypasses all permission checks —— 維護中也一樣，
  // 否則啟動維護之後就沒人進得去修了
  if (session.role === 'super_admin' || session.role === 'superadmin') {
    return NextResponse.next()
  }

  // 後台維護：擋掉 superadmin 以外的所有人
  const maintScope = await getMaintenanceScope()
  if (maintScope === 'backend' || maintScope === 'all') {
    if (pathname !== '/maintenance') {
      const url = request.nextUrl.clone()
      url.pathname = '/maintenance'
      url.search = ''
      return NextResponse.rewrite(url)
    }
  }

  // 廠商只有商品管理，連公平性驗證頁都不給 —— 那是平台對玩家的承諾，
  // 讓供貨方看得到封存內容等於把驗證的意義抵銷掉
  if (session.role === 'supplier') {
    const ok =
      pathname === '/products' ||
      (pathname.startsWith('/products/') && !pathname.endsWith('/verify')) ||
      pathname === '/reports/settlement' ||
      // 配送管理：2026-08-09 就把 /api/admin/orders 放進 API 白名單了，
      // 但頁面路徑忘了一起加 —— 廠商點側欄「配送管理」會被這裡打回
      // /products，看起來就是「點了沒反應」。
      // 寫入面 route 內已經擋死（PUT 與 batch 出貨對廠商回 403、
      // 詳情跨廠商也擋），這裡放行的只有「看」
      pathname === '/orders' ||
      pathname.startsWith('/orders/') ||
      // 廠商分析：頁面與 API 都只算自己那家（route 內把 supplierId 蓋成自己的）
      pathname === '/analytics-supplier'
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

  const needed = match ? (Array.isArray(match.permission) ? match.permission : [match.permission]) : []
  if (match && !needed.some(pm => session.permissions!.includes(pm))) {
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
