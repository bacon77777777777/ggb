import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction } from '@/lib/logAdminAction'

/**
 * POST /api/admin/products/[id]/seal/seal-now
 *
 * 手動排籤封存。正常情況由 products 的 trigger 自動處理，
 * 這是給「trigger 沒觸發到」的漏網商品補的escape hatch。
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const productId = Number((await params).id)
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ error: '商品編號無效' }, { status: 400 })
    }

    const db = getSupabaseAdmin()
    const { data, error } = await db.rpc('seal_product_now', {
      p_product_id: productId,
      p_by: `admin:${session.adminId}`,
    })

    if (error) {
      const msg = error.message.includes('ALREADY_SEALED') ? '此商品已經封存過'
        : error.message.includes('ALREADY_SOLD') ? '此商品已有抽獎紀錄，不能再排籤'
        : error.message.includes('TYPE_NOT_APPLICABLE') ? '只有一番賞、抽卡、自製賞需要排籤'
        : error.message.includes('NO_PRIZES') ? '此商品還沒有賞項，無法排籤'
        : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    await logAdminAction({
      adminId: session.adminId,
      action: '手動排籤封存',
      targetType: 'product',
      targetId: String(productId),
      detail: { tickets: data?.tickets, commitment: data?.commitment },
    })

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '封存失敗' }, { status: 500 })
  }
}
