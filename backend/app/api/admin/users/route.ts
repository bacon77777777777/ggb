import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select(
            `
            id,
            invite_code,
            name,
            email,
            phone,
            tokens,
            points,
            status,
            total_spent,
            total_draws,
            address,
            created_at,
            last_login_at
          `
          )
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

    const lastLoginIpById = new Map<string, string>()
    const userIdsForIp = (users ?? []).map((u: any) => String(u.id)).slice(0, 1000)
    if (userIdsForIp.length > 0) {
      const missing = userIdsForIp.filter((id) => !authLastSignInIpById.has(id))
      if (missing.length > 0) {
        const chunkSize = 200
        for (let i = 0; i < missing.length; i += chunkSize) {
          const chunk = missing.slice(i, i + chunkSize)
          const { data, error } = await supabaseAdmin
            .schema('auth')
            .from('audit_log_entries')
            .select('user_id, ip_address, created_at')
            .in('user_id', chunk)
            .order('created_at', { ascending: false })
            .limit(5000)
          if (error) break
          for (const row of data ?? []) {
            const userId = String((row as any).user_id || '')
            const ip = String((row as any).ip_address || '')
            if (!userId || !ip) continue
            if (!lastLoginIpById.has(userId)) lastLoginIpById.set(userId, ip)
          }
        }
      }
    }

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('user_id')

    if (ordersError) {
      throw ordersError
    }

    const orderCountMap = new Map<string, number>()
    for (const row of orders ?? []) {
      if (!row.user_id) continue
      const prev = orderCountMap.get(row.user_id) ?? 0
      orderCountMap.set(row.user_id, prev + 1)
    }

    const { data: draws, error: drawsError } = await supabaseAdmin
      .from('draw_records')
      .select('user_id')

    if (drawsError) {
      throw drawsError
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
