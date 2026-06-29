import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { randomBytes } from 'crypto'

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

    if (!hasStatus && !hasPassword) return NextResponse.json({ error: '缺少更新欄位' }, { status: 400 })

    let updatedUser: any = null
    let tempPassword: string | null = null
    if (hasStatus) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ status: body.status })
        .eq('id', id)
        .select('id, status')
        .single()
      if (error) throw error
      updatedUser = data
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

    return NextResponse.json({ success: true, user: updatedUser, tempPassword: tempPassword ?? undefined })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
