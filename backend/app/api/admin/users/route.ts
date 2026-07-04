import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    // Use * so the page keeps working even if this environment is missing
    // some later user-table migrations such as invite_code / points.
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (usersError) {
      throw usersError
    }

    const authLastSignInAtById = new Map<string, string>()
    const authLastSignInIpById = new Map<string, string>()
    {
      const perPage = 1000
      let page = 1
      while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
        if (error) throw error
        const authUsers = data?.users ?? []
        for (const au of authUsers) {
          if (!au?.id) continue
          const last = (au as unknown as { last_sign_in_at?: string | null }).last_sign_in_at
          if (last) authLastSignInAtById.set(au.id, last)
          const ip = (au as unknown as { last_sign_in_ip?: string | null }).last_sign_in_ip
          if (ip) authLastSignInIpById.set(au.id, ip)
        }
        if (authUsers.length < perPage) break
        page += 1
      }
    }

    // 從 user_event_logs 撈最近一次登入 IP
    const lastLoginIpById = new Map<string, string>()
    {
      const { data: loginLogs } = await supabaseAdmin
        .from('user_event_logs')
        .select('user_id, ip, created_at')
        .eq('event_type', 'login')
        .order('created_at', { ascending: false })
        .limit(5000)
      for (const row of loginLogs ?? []) {
        const userId = String((row as any).user_id || '')
        const ip = String((row as any).ip || '')
        if (!userId || !ip || ip === 'unknown') continue
        if (!lastLoginIpById.has(userId)) lastLoginIpById.set(userId, ip)
      }
    }

    let orders: Array<{ user_id: string | null }> = []
    {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('user_id')

      // New cutover databases may not have legacy marketplace tables yet.
      // Missing stats tables should not block the member list itself.
      if (error) {
        const message = String(error.message || '')
        const isMissingTable =
          message.includes("Could not find the table 'public.orders'") ||
          message.includes('relation "public.orders" does not exist')
        if (!isMissingTable) throw error
      } else {
        orders = (data as Array<{ user_id: string | null }>) ?? []
      }
    }

    const orderCountMap = new Map<string, number>()
    for (const row of orders ?? []) {
      if (!row.user_id) continue
      const prev = orderCountMap.get(row.user_id) ?? 0
      orderCountMap.set(row.user_id, prev + 1)
    }

    let draws: Array<{ user_id: string | null }> = []
    {
      const { data, error } = await supabaseAdmin
        .from('draw_records')
        .select('user_id')

      if (error) {
        const message = String(error.message || '')
        const isMissingTable =
          message.includes("Could not find the table 'public.draw_records'") ||
          message.includes('relation "public.draw_records" does not exist')
        if (!isMissingTable) throw error
      } else {
        draws = (data as Array<{ user_id: string | null }>) ?? []
      }
    }

    const drawCountMap = new Map<string, number>()
    for (const row of draws ?? []) {
      if (!row.user_id) continue
      const prev = drawCountMap.get(row.user_id) ?? 0
      drawCountMap.set(row.user_id, prev + 1)
    }

    const result = (users ?? []).map((u: any) => ({
      id: u.id,
      userId: u.id,
      inviteCode: u.invite_code ?? null,
      name: u.name ?? '',
      email: u.email ?? '',
      phone: u.phone ?? '',
      tokens: typeof u.tokens === 'number' ? u.tokens : 0,
      points: typeof u.points === 'number' ? u.points : 0,
      registerDate: u.created_at,
      lastLoginDate: u.last_login_at || authLastSignInAtById.get(u.id) || '',
      lastLoginIp: authLastSignInIpById.get(u.id) || lastLoginIpById.get(u.id) || '',
      status: u.status === 'inactive' ? 'inactive' : 'active',
      isBot: u.is_bot === true,
      totalOrders: orderCountMap.get(u.id) ?? 0,
      totalSpent: Number(u.total_spent ?? 0),
      totalDraws: drawCountMap.get(u.id) ?? (typeof u.total_draws === 'number' ? u.total_draws : 0),
      address: u.address ?? ''
    }))

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error fetching admin users with stats:', error)
    return NextResponse.json(
      { error: error.message || '載入會員統計失敗' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const name = String(body?.name || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    const phone = String(body?.phone || '').trim()
    const address = String(body?.address || '').trim()
    const status = body?.status === 'inactive' ? 'inactive' : 'active'
    const tokens = Math.max(0, Number.parseInt(String(body?.tokens ?? '0'), 10) || 0)

    if (!name) {
      return NextResponse.json({ error: '會員名稱不可為空' }, { status: 400 })
    }
    if (!email) {
      return NextResponse.json({ error: '電子郵件不可為空' }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: '密碼至少需要 6 碼' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
      },
    })

    if (createAuthError) throw createAuthError

    const authUserId = authData.user?.id
    if (!authUserId) {
      return NextResponse.json({ error: '建立會員失敗' }, { status: 500 })
    }

    const invite_code = Math.random().toString(36).substring(2, 6).toUpperCase() +
                        Math.random().toString(36).substring(2, 6).toUpperCase()

    const avatarIndex = (Math.floor(Math.random() * 8) + 1).toString().padStart(2, '0')
    const avatar_url = `/images/avatar/${avatarIndex}.png`

    const payload = {
      id: authUserId,
      name,
      email,
      phone: phone || null,
      tokens,
      status,
      address: address || null,
      invite_code,
      avatar_url,
    }

    const { data: createdUser, error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert(payload, { onConflict: 'id' })
      .select('id, name, email, phone, tokens, status, address, created_at')
      .single()

    if (upsertError) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => undefined)
      throw upsertError
    }

    return NextResponse.json({
      success: true,
      user: {
        id: createdUser.id,
        userId: createdUser.id,
        inviteCode: null,
        name: createdUser.name ?? '',
        email: createdUser.email ?? '',
        phone: createdUser.phone ?? '',
        tokens: typeof (createdUser as any).tokens === 'number' ? (createdUser as any).tokens : 0,
        points: 0,
        registerDate: createdUser.created_at ?? new Date().toISOString(),
        lastLoginDate: '',
        lastLoginIp: '',
        status: createdUser.status === 'inactive' ? 'inactive' : 'active',
        totalOrders: 0,
        totalSpent: 0,
        totalDraws: 0,
        address: createdUser.address ?? '',
      },
    })
  } catch (error: any) {
    console.error('Error creating admin user:', error)
    return NextResponse.json(
      { error: error?.message || '建立會員失敗' },
      { status: 500 }
    )
  }
}
