import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 商城檢舉。
 *
 * 玩家商城的錢不經過平台，出事時平台能做的只有「查得到、停得掉」——
 * 這支就是那個「查得到」：誰檢舉了誰、為什麼、後台怎麼處理，全部留軌跡。
 *
 * ⚠️ 這裡是玩家商城 sell_*，不是交易所 marketplace_* 也不是卡牌交換 exchange_*。
 */

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('sell_reports')
      .select(
        `
          id, target_type, listing_id, order_id, seller_id,
          reason, detail, images, status, admin_note,
          handled_at, handled_by, created_at,
          reporter:users!sell_reports_reporter_id_fkey ( id, name, email, member_no ),
          seller:users!sell_reports_seller_id_fkey ( id, name, email, member_no ),
          listing:sell_listings ( id, title, status )
        `
      )
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error

    // 被檢舉賣家目前是不是停權中 —— 後台要一眼看出「這個人已經處理過了」
    const sellerIds = Array.from(
      new Set((data ?? []).map((r: any) => String(r?.seller_id || '')).filter(Boolean))
    )
    const suspended = new Set<string>()
    if (sellerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('sell_seller_profiles')
        .select('seller_id, suspended_at')
        .in('seller_id', sellerIds)
      for (const p of profiles ?? []) {
        if ((p as any)?.suspended_at) suspended.add(String((p as any).seller_id))
      }
    }

    return NextResponse.json(
      (data ?? []).map((r: any) => ({ ...r, seller_suspended: suspended.has(String(r?.seller_id || '')) }))
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

/** 結案 / 駁回檢舉 */
export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as null | {
      id?: number | string
      status?: string
      adminNote?: string
    }
    const id = Number(body?.id)
    const status = String(body?.status || '').trim()
    const adminNote = String(body?.adminNote || '').trim()

    if (!Number.isFinite(id) || !['open', 'resolved', 'dismissed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('sell_reports')
      .update({
        status,
        admin_note: adminNote || null,
        // 重新開啟就把處理紀錄清掉，不然會顯示成「已處理但還開著」
        handled_at: status === 'open' ? null : new Date().toISOString(),
        handled_by: status === 'open' ? null : session.adminId,
      })
      .eq('id', id)
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: status === 'resolved' ? '處理商城檢舉' : status === 'dismissed' ? '駁回商城檢舉' : '重啟商城檢舉',
      targetType: 'sell_report',
      targetId: String(id),
      detail: { status, note: adminNote || null },
      ip: getClientIp(req),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
