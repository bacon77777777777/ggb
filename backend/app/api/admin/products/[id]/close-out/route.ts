import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction } from '@/lib/logAdminAction'

/**
 * POST /api/admin/products/[id]/close-out
 *
 * 結束檔期：未售出的籤由平台回收，商品標為已完抽但仍可上架。
 * 刻意不用機器人帳號去抽掉 —— 機器人存在的理由就是「不影響報表」，
 * 拿它吃庫存等於把庫存損耗記成有人真的抽了，報表會被污染。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const productId = Number((await params).id)
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ error: '商品編號無效' }, { status: 400 })
    }

    const reason = await req.json().then(b => b?.reason).catch(() => null)

    const db = getSupabaseAdmin()
    const { data, error } = await db.rpc('close_out_product', {
      p_product_id: productId,
      p_reason: reason ?? '後台手動結檔',
      p_closed_by: `admin:${session.adminId}`,
    })

    if (error) {
      const msg = error.message.includes('ALREADY_CLOSED')
        ? '此商品已經結過檔'
        : error.message.includes('NOTHING_TO_CLOSE')
          ? '此商品已完抽或尚未封存，沒有可回收的籤'
          : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    await logAdminAction({
      adminId: session.adminId,
      action: '結束檔期',
      targetType: 'product',
      targetId: String(productId),
      detail: {
        closed_tickets: data?.closed_tickets ?? 0,
        prize_summary: data?.prize_summary ?? {},
        reason: reason ?? '後台手動結檔',
      },
    })

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '結檔失敗' }, { status: 500 })
  }
}
