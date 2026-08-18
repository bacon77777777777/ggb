import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { randomBytes } from 'crypto'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { pushSensitiveAlert } from '@/lib/sensitiveAlert'

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
              price,
              product_id,
              product_prize_id,
              product:products ( name ),
              prize:product_prizes ( name, level )
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

    // 邀請人：誰邀他來的（referrals 一人一列，referee 唯一）
    let referrer: { id: string; name: string; invite_code: string | null } | null = null
    {
      const { data: ref } = await supabaseAdmin
        .from('referrals')
        .select('referrer_id, qualified_at')
        .eq('referee_id', id)
        .maybeSingle()
      if (ref?.referrer_id) {
        const { data: r } = await supabaseAdmin
          .from('users')
          .select('id, name, invite_code')
          .eq('id', ref.referrer_id)
          .maybeSingle()
        if (r) referrer = { id: r.id, name: r.name, invite_code: r.invite_code }
      }
    }

    return NextResponse.json({ user, orders, draws, recharges, referrer })
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

    /*
     * 改代幣要先記下原本的餘額 —— 下面要用 (新 − 舊) 補一筆 token_adjustments。
     * 只 update `users.tokens` 而不進分類帳的話，帳面會憑空多出一筆錢，
     * 財務對帳（expected = recharge + manual − draw − refund）永遠對不平。
     * 實際踩過：一個帳號在建立時被塞了 100 萬，對帳就短少 100 萬（2026-08-13 查出）。
     */
    let tokensBefore: number | null = null
    if (profileUpdates.tokens !== undefined) {
      const { data: prev } = await supabaseAdmin.from('users').select('tokens').eq('id', id).single()
      tokensBefore = Number(prev?.tokens ?? 0)
    }

    if (hasProfile || hasStatus) {
      const fieldsToUpdate: Record<string, any> = { ...profileUpdates }
      if (hasStatus) fieldsToUpdate.status = body.status
      const { data, error } = await supabaseAdmin
        .from('users').update(fieldsToUpdate).eq('id', id).select('*').single()
      if (error) throw error
      updatedUser = data
    }

    // 代幣有變動就補分類帳。差額為 0（送了同樣的數字）不寫，免得留下一堆 delta=0 的雜訊
    if (tokensBefore !== null) {
      const delta = Number(profileUpdates.tokens ?? 0) - tokensBefore
      if (delta !== 0) {
        await supabaseAdmin.from('token_adjustments').insert({
          user_id: id,
          delta,
          reason: '後台編輯會員直接調整代幣',
          created_by: 'admin',
          category: 'correction',   // 直接改數字本質上是修帳（migration 582）
        })
      }
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
        // 原本只推「新餘額」，看不出改了多少 —— 補上原餘額與差額
        pushSensitiveAlert(
          `🔧 管理員敏感操作\n操作：手動調整代幣\n管理員ID：${session.adminId}\n用戶ID：${id}\n`
          + `原餘額：${tokensBefore ?? '?'} G → 新餘額：${profileUpdates.tokens} G`
          + `（${Number(profileUpdates.tokens ?? 0) - Number(tokensBefore ?? 0) >= 0 ? '+' : ''}`
          + `${Number(profileUpdates.tokens ?? 0) - Number(tokensBefore ?? 0)} G）`
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
