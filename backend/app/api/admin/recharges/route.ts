import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { nanoid } from 'nanoid'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data: botRows } = await supabaseAdmin.from('users').select('id').eq('is_bot', true)
    const botIds = botRows?.map(r => r.id) ?? []

    let query = supabaseAdmin
      .from('recharge_records')
      .select(
        `
        *,
        user:users (id, name, email)
      `
      )
      .order('created_at', { ascending: false })

    if (botIds.length > 0) query = query.not('user_id', 'in', `(${botIds.join(',')})`)

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json(data ?? [])
  } catch (error: any) {
    console.error('Error fetching admin recharge records:', error)
    return NextResponse.json(
      { error: error.message || '載入儲值紀錄失敗' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { user_id, amount, payment_method, note } = body

    if (!user_id || !amount || amount <= 0) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // 取得目前代幣數
    const { data: userData, error: userErr } = await supabaseAdmin
      .from('users')
      .select('tokens')
      .eq('id', user_id)
      .single()

    if (userErr || !userData) {
      return NextResponse.json({ error: '找不到此會員' }, { status: 404 })
    }

    const newTokens = (userData.tokens ?? 0) + amount
    const tradeNo = `MANUAL-${nanoid(10).toUpperCase()}`

    // 寫入 recharge_records
    const { error: insertErr } = await supabaseAdmin.from('recharge_records').insert({
      user_id,
      amount,
      bonus: 0,
      status: 'success',
      payment_method: payment_method ?? 'manual_transfer',
      order_number: tradeNo,
      trade_no: tradeNo,
      review_note: note ?? null,
      created_at: new Date().toISOString(),
    })

    if (insertErr) throw insertErr

    // 更新 users.tokens
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ tokens: newTokens })
      .eq('id', user_id)
      .select('id')

    if (updateErr) throw updateErr
    if (!updated?.length) return NextResponse.json({ error: '更新代幣失敗（0 rows affected）' }, { status: 500 })

    return NextResponse.json({ success: true, trade_no: tradeNo, new_tokens: newTokens })
  } catch (error: any) {
    console.error('Error creating manual recharge:', error)
    return NextResponse.json(
      { error: error.message || '手動儲值失敗' },
      { status: 500 }
    )
  }
}
