import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 賣家停權 / 解除停權。
 *
 * 停權後這個人：
 *   · 不能上架（trigger `sell_guard_listing` 擋）
 *   · 現有商品不能被下單（`create_sell_order` 擋）
 * 已經成立的訂單**不受影響** —— 那些交易錢可能已經付了，強制中斷只會讓買家更難處理。
 *
 * 停權是針對商城的，不是全站封鎖：`users.status` 不動。
 * 玩家照樣可以抽獎、儲值、逛站，只是不能再賣東西。
 */

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as null | {
      sellerId?: string
      suspended?: boolean
      reason?: string
    }
    const sellerId = String(body?.sellerId || '').trim()
    const suspended = Boolean(body?.suspended)
    const reason = String(body?.reason || '').trim()

    if (!sellerId) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    if (suspended && !reason) {
      // 停權是會被申訴的動作，沒寫原因之後沒人講得出當初為什麼停
      return NextResponse.json({ error: '停權必須填寫原因' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('sell_seller_profiles').upsert(
      {
        seller_id: sellerId,
        suspended_at: suspended ? new Date().toISOString() : null,
        suspend_reason: suspended ? reason : null,
        suspended_by: suspended ? session.adminId : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'seller_id' }
    )
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: suspended ? '停權商城賣家' : '解除商城賣家停權',
      targetType: 'sell_seller',
      targetId: sellerId,
      detail: suspended ? { reason } : {},
      ip: getClientIp(req),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
