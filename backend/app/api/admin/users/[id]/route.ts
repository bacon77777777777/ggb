import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { randomBytes } from 'crypto'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

async function pushLineAlert(text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const id    = process.env.NOTIFY_TARGET_ID
  if (!token || !id) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: id, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabaseAdmin = getSupabaseAdmin()

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single()
    if (userError) throw userError

    let orders: any[] = []
    {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select(
          `
            *,
            items:order_items (
              id,
              product_name,
              prize_name,
              prize_level,
              quantity,
              product_id
            )
          `
        )
        .eq('user_id', id)
        .order('created_at', { ascending: false })
      if (error) {
        const message = String(error.message || '')
        const isMissingTable =
          message.includes("Could not find the table 'public.orders'") ||
          message.includes('relation "public.orders" does not exist')
        if (!isMissingTable) throw error
      } else {
        orders = data ?? []
      }
    }

    let draws: any[] = []
    {
      const { data, error } = await supabaseAdmin
        .from('draw_records')
        .select(
          `
            *,
            product:products (name, price, product_code)
          `
        )
        .eq('user_id', id)
        .order('created_at', { ascending: false })
      if (error) {
        const message = String(error.message || '')
        const isMissingTable =
          message.includes("Could not find the table 'public.draw_records'") ||
          message.includes('relation "public.draw_records" does not exist')
        if (!isMissingTable) throw error
      } else {
        draws = data ?? []
      }
    }

    let recharges: any[] = []
    {
      const { data, error } = await supabaseAdmin
        .from('recharge_records')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
      if (error) {
        const message = String(error.message || '')
        const isMissingTable =
          message.includes("Could not find the table 'public.recharge_records'") ||
          message.includes('relation "public.recharge_records" does not exist')
        if (!isMissingTable) throw error
      } else {
        recharges = data ?? []
      }
    }

    return NextResponse.json({ user, orders, draws, recharges })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const supabaseAdmin = getSupabaseAdmin()
    const hasStatus = body.status !== undefined
    const shouldGeneratePassword = body.generatePassword === true
    const hasPassword = body.password !== undefined || shouldGeneratePassword
    const PROFILE_FIELDS = ['name', 'email', 'avatar_url', 'gender', 'birthday', 'phone_number', 'phone',
      'recipient_name', 'recipient_phone', 'address', 'tokens', 'points']
    const profileUpdates: Record<string, any> = {}
    for (const f of PROFILE_FIELDS) {
      if (body[f] !== undefined) profileUpdates[f] = body[f] === '' ? null : body[f]
    }
    const hasProfile = Object.keys(profileUpdates).length > 0

    if (!hasStatus && !hasPassword && !hasProfile) return NextResponse.json({ error: '缺少更新欄位' }, { status: 400 })

    let updatedUser: any = null
    let tempPassword: string | null = null

    if (hasProfile || hasStatus) {
      const fieldsToUpdate: Record<string, any> = { ...profileUpdates }
      if (hasStatus) fieldsToUpdate.status = body.status
      const { data, error } = await supabaseAdmin
        .from('users').update(fieldsToUpdate).eq('id', id).select('*').single()
      if (error) throw error
      updatedUser = data
    }

    if (hasProfile) {
      await logAdminAction({
        adminId: session.adminId,
        action: '編輯會員資料',
        targetType: 'user',
        targetId: id,
        detail: profileUpdates,
        ip: getClientIp(request),
      })

      // 即時通知：手動調整代幣
      if (profileUpdates.tokens !== undefined) {
        const before = updatedUser?.tokens ?? '?'
        pushLineAlert(
          `🔧 管理員敏感操作\n操作：手動調整代幣\n管理員：${session.username ?? session.adminId}\n用戶ID：${id}\n新餘額：${profileUpdates.tokens} G`
        )
      }
    }


    if (hasPassword) {
      const nextPassword = shouldGeneratePassword
        ? randomBytes(9).toString('base64url')
        : String(body.password ?? '').trim()
      if (!nextPassword) return NextResponse.json({ error: '新密碼不可為空' }, { status: 400 })
      if (shouldGeneratePassword) tempPassword = nextPassword

      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
        password: nextPassword,
      })
      if (error) throw error

      await supabaseAdmin.from('notifications').insert({
        user_id: id,
        type: 'security',
        title: '密碼已重置',
        body: '管理員已為您的帳號重置密碼。如非本人操作，請立即聯繫客服。',
        link: '/profile?tab=settings',
        meta: { action: 'reset_password' },
      })
    }

    if (body.status) {
      const text = body.status === 'active' ? '啟用' : '停用'
      await supabaseAdmin.from('notifications').insert({
        user_id: id,
        type: 'security',
        title: '帳號狀態變更通知',
        body: `您的帳號狀態已被管理員設為：${text}`,
        link: '/profile?tab=settings',
        meta: { status: body.status },
      })
    }

    if (hasStatus) {
      await logAdminAction({
        adminId: session.adminId,
        action: body.status === 'active' ? '啟用用戶' : '停用用戶',
        targetType: 'user',
        targetId: id,
        detail: { status: body.status },
        ip: getClientIp(request),
      })
    }
    if (hasPassword) {
      await logAdminAction({
        adminId: session.adminId,
        action: '重設用戶密碼',
        targetType: 'user',
        targetId: id,
        detail: { generated: shouldGeneratePassword },
        ip: getClientIp(request),
      })
    }

    return NextResponse.json({ success: true, user: updatedUser, tempPassword: tempPassword ?? undefined })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
