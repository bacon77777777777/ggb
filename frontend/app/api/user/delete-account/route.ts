import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * 帳號刪除（Apple App Store Review Guideline 5.1.1(v) 強制要求）
 *
 * GET  → 前置檢查：能不能刪、刪了會失去什麼（代幣餘額、在售商品）
 * POST → 執行刪除
 *
 * 實際動作在 DB function `delete_user_account`（migration 594）。
 * 那裡做的是「匿名化 + 斷登入」而不是 DELETE：
 * public.users → auth.users 是 ON DELETE CASCADE，真的刪會連 token_adjustments、
 * recharge_records、draw_records 的歸屬一起帶走，財務對帳與公平性驗證都會斷鏈。
 */

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

const admin = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await admin().rpc('account_deletion_preflight', { p_user_id: user.id })
  if (error) {
    console.error('[delete-account] preflight failed', error)
    return NextResponse.json({ error: '檢查失敗，請稍後再試' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 前台要先勾「我已閱讀並了解刪除帳號後的須知」才會帶 acknowledged，
  // 讓「已充分告知」這件事在伺服器端也留下依據
  let acknowledged = false
  let reason = ''
  try {
    const body = await request.json()
    acknowledged = body?.acknowledged === true
    reason = String(body?.reason ?? '').slice(0, 200)
  } catch {
    /* 空 body 當作沒確認 */
  }
  if (!acknowledged) {
    return NextResponse.json({ error: '請先確認刪除帳號須知' }, { status: 400 })
  }

  const { data, error } = await admin().rpc('delete_user_account', {
    p_user_id: user.id,
    p_reason: reason || '使用者自行於帳號設定刪除',
  })

  if (error) {
    console.error('[delete-account] delete failed', error)
    return NextResponse.json({ error: '刪除失敗，請聯繫客服' }, { status: 500 })
  }

  const result = data as { ok: boolean; error?: string; tokens_forfeited?: number }

  if (!result?.ok) {
    const message =
      result?.error === 'pending_orders'
        ? '你還有未完成的訂單，請等訂單全部完成後再刪除帳號'
        : result?.error === 'warehouse_prizes'
          ? '你的倉庫還有尚未申請出貨的獎品，請先申請出貨或處理完畢再刪除帳號'
        : result?.error === 'tokens_remaining'
          ? '你還有未使用的代幣，請先使用完畢，或聯繫客服協助處理'
        : result?.error === 'already_deleted'
          ? '此帳號已刪除'
          : '刪除失敗，請聯繫客服'
    return NextResponse.json({ error: message, detail: result }, { status: 409 })
  }

  return NextResponse.json({ ok: true, tokens_forfeited: result.tokens_forfeited ?? 0 })
}
