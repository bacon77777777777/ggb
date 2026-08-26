import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function POST(request: Request) {
  try {
    const session = await requireAdminScope()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // 出貨/改單是平台的事 —— 廠商帳號僅供查看
    if (session.supplierScope !== undefined) {
      return NextResponse.json({ error: '廠商帳號僅供查看，出貨作業由平台處理' }, { status: 403 })
    }

    const body = await request.json()
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : []
    const patch = body?.patch && typeof body.patch === 'object' ? body.patch : null

    if (ids.length === 0 || !patch) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    /*
     * 取消要退代幣、退品項、發通知，不是單純改 status ——
     * 走 cancel_delivery_order（migration 631），跟單筆取消同一套。
     */
    if (patch.status === 'cancelled') {
      const results = []
      for (const id of ids) {
        const { data, error: rpcErr } = await supabaseAdmin.rpc('cancel_delivery_order', {
          p_order_id: id,
          p_kind: 'admin',
          p_operator: `admin:${session.adminId}`,
        })
        if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
        results.push(data)
      }
      await logAdminAction({
        adminId: session.adminId, action: '批次取消訂單', targetType: 'orders',
        detail: { ids, results }, ip: getClientIp(request),
      })
      return NextResponse.json({ success: true, results })
    }

    const { error } = await supabaseAdmin.from('orders').update(patch).in('id', ids)
    if (error) throw error

    await logAdminAction({ adminId: session.adminId, action: '批次更新訂單', targetType: 'orders', detail: { ids, patch }, ip: getClientIp(request) })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

