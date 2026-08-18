import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { nanoid } from 'nanoid'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

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

    // 手動補幣只剩四種：行銷贈點／補償／測試（寫 recharge_records，行銷費用）、
    // 帳務更正（寫 token_adjustments，category=correction，可正可負）。
    // 銀行轉帳／現金／LINE Pay 已停用 —— 用戶儲值一律走綠界；這三種以前寫進
    // token_adjustments，儲值明細頁又只讀 recharge_records，實收會從銷售額報表消失。
    const REAL_PAYMENT_METHODS = ['manual_transfer', 'cash', 'line_pay']
    if (REAL_PAYMENT_METHODS.includes(payment_method ?? '')) {
      return NextResponse.json(
        { error: '銀行轉帳／現金／LINE Pay 手動入帳已停用，用戶儲值一律走綠界；帳務調整請選「帳務更正」' },
        { status: 400 },
      )
    }
    const isCorrection = payment_method === 'correction'
    const amountNum = Number(amount)

    if (!user_id || !Number.isFinite(amountNum) || amountNum === 0 || (!isCorrection && amountNum <= 0)) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }
    if (isCorrection && !String(note ?? '').trim()) {
      return NextResponse.json({ error: '帳務更正必須填寫原因' }, { status: 400 })
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

    const newTokens = Math.max(0, (userData.tokens ?? 0) + amountNum)
    if (isCorrection && (userData.tokens ?? 0) + amountNum < 0) {
      return NextResponse.json({ error: `扣回超過餘額（目前 ${userData.tokens ?? 0} G）` }, { status: 400 })
    }
    const tradeNo = `MANUAL-${nanoid(10).toUpperCase()}`

    const MARKETING_METHODS = ['promotion', 'compensation', 'test']
    const isMarketing = MARKETING_METHODS.includes(payment_method ?? '')
    if (!isMarketing && !isCorrection) {
      return NextResponse.json({ error: '不支援的補幣類別' }, { status: 400 })
    }

    if (isCorrection) {
      // 帳務更正寫 token_adjustments（不污染 ECPay 對帳基礎），category 明確帶 correction
      const { error: insertErr } = await supabaseAdmin.from('token_adjustments').insert({
        user_id,
        delta: amountNum,
        reason: `帳務更正：${String(note).trim()}`,
        created_by: 'admin',
        category: 'correction',
        created_at: new Date().toISOString(),
      })
      if (insertErr) throw insertErr
    } else {
      // 行銷類型：amount=0（無真實收款），bonus=tokens（贈出的 G幣）
      const { error: insertErr } = await supabaseAdmin.from('recharge_records').insert({
        user_id,
        amount: 0,
        bonus: amountNum,
        status: 'success',
        payment_method: payment_method,
        order_number: tradeNo,
        trade_no: tradeNo,
        review_note: note ?? null,
        created_at: new Date().toISOString(),
      })
      if (insertErr) throw insertErr
    }

    // 更新 users.tokens
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ tokens: newTokens })
      .eq('id', user_id)
      .select('id')

    if (updateErr) throw updateErr
    if (!updated?.length) return NextResponse.json({ error: '更新代幣失敗（0 rows affected）' }, { status: 500 })

    // 手動補幣直接動到玩家餘額，對帳時一定要查得到是誰、補了多少、為什麼
    await logAdminAction({
      adminId: session.adminId,
      action: '手動儲值',
      targetType: 'user',
      targetId: String(user_id),
      detail: { trade_no: tradeNo, tokens_after: newTokens, body },
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true, trade_no: tradeNo, new_tokens: newTokens })
  } catch (error: any) {
    console.error('Error creating manual recharge:', error)
    return NextResponse.json(
      { error: error.message || '手動儲值失敗' },
      { status: 500 }
    )
  }
}
