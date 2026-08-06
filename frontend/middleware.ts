import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * 維護模式
 *
 * 快取的理由：middleware 每個請求都會跑，每次都查資料庫等於把維護狀態
 * 變成全站每一頁的額外延遲。維護是低頻事件，快取 20 秒完全夠用 ——
 * 開啟維護後最多 20 秒全站生效。
 *
 * 查不到就當作沒維護：資料庫掛了的時候不該連帶把整個站鎖起來，
 * 那會讓一個可恢復的故障變成完全無法存取。
 */
let maintCache: { scope: string; at: number } = { scope: 'off', at: 0 }
const MAINT_TTL_MS = 20_000

async function getMaintenanceScope(url: string, key: string): Promise<string> {
  if (Date.now() - maintCache.at < MAINT_TTL_MS) return maintCache.scope
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

const BYPASS_COOKIE = 'ggb_maint_bypass'

export async function middleware(request: NextRequest) {
  // Intercept Supabase auth params that land on the homepage (Site URL fallback)
  if (request.nextUrl.pathname === '/') {
    const code = request.nextUrl.searchParams.get('code')
    const error = request.nextUrl.searchParams.get('error')
    const errorCode = request.nextUrl.searchParams.get('error_code')

    if (code) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/callback'
      url.searchParams.set('next', '/update-password')
      return NextResponse.redirect(url)
    }

    if (error) {
      const url = request.nextUrl.clone()
      url.pathname = '/forgot-password'
      url.search = ''
      url.searchParams.set('auth_error', errorCode || error)
      return NextResponse.redirect(url)
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request })
  }

  // ── 維護模式 ──
  const { pathname } = request.nextUrl

  // 帶 ?__mk=<金鑰> 進站就種一張繞過票，之後照常瀏覽。
  // 維護期間自己要能進去驗證改好了沒，不然只能盲改
  const mk = request.nextUrl.searchParams.get('__mk')
  if (mk) {
    const url = request.nextUrl.clone()
    url.searchParams.delete('__mk')
    const res = NextResponse.redirect(url)
    res.cookies.set(BYPASS_COOKIE, mk, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
    return res
  }

  const isMaintPage = pathname === '/maintenance'
  const hasBypass = Boolean(request.cookies.get(BYPASS_COOKIE)?.value)

  if (!isMaintPage && !hasBypass && !pathname.startsWith('/api/')) {
    const scope = await getMaintenanceScope(supabaseUrl, supabaseAnonKey)
    if (scope === 'frontend' || scope === 'all') {
      const url = request.nextUrl.clone()
      url.pathname = '/maintenance'
      url.search = ''
      // rewrite 而不是 redirect：網址列保持原樣，維護結束重整就回到原本那一頁
      return NextResponse.rewrite(url)
    }
  }

  // 維護結束後，還留在維護頁的人要被帶回首頁
  if (isMaintPage) {
    const scope = await getMaintenanceScope(supabaseUrl, supabaseAnonKey)
    if (scope !== 'frontend' && scope !== 'all') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    // const url = request.nextUrl.clone()
    // url.pathname = '/login'
    // return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
