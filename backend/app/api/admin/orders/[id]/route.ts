import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

type ShipmentStatus = 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled'

const statusTextMap: Record<ShipmentStatus, string> = {
  submitted: '已提交',
  processing: '處理中',
  picked_up: '物流已收取',
  shipping: '配送中',
  delivered: '已送達',
  cancelled: '已取消',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabaseAdmin = getSupabaseAdmin()

    let query = supabaseAdmin
      .from('orders')
      .select(
        `
          *,
          items:draw_records(
            *,
            product_prizes(name, level, image_url),
            products(name, image_url)
          ),
          user:users(email, name)
        `
      )

    if (id.startsWith('OD')) {
      query = query.eq('order_number', id)
    } else {
      const numericId = Number(id)
      if (Number.isFinite(numericId)) query = query.eq('id', numericId)
      else query = query.eq('order_number', id)
    }

    const { data, error } = await query.single()
    if (error) throw error
    return NextResponse.json(data)
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
    const supabaseAdmin = getSupabaseAdmin()
    const body = await request.json()

    const orderId = Number(id)
    if (!Number.isFinite(orderId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
    }

    const patch: Record<string, any> = {}
    if (body.status) patch.status = body.status
    if (body.tracking_number !== undefined) patch.tracking_number = body.tracking_number
    if (body.shipped_at !== undefined) patch.shipped_at = body.shipped_at
    // 切到 picked_up 時自動記錄出貨時間（若尚未設定）
    if (body.status === 'picked_up' && body.shipped_at === undefined) {
      patch.shipped_at = new Date().toISOString()
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('orders')
      .update(patch)
      .eq('id', orderId)
      .select('id, order_number, user_id, status, tracking_number')
      .single()

    if (updateError) throw updateError

    // Sync draw_records status based on order status change
    if (body.status === 'cancelled') {
      // Return items to warehouse
      await supabaseAdmin
        .from('draw_records')
        .update({ status: 'in_warehouse', order_id: null })
        .eq('order_id', orderId)
        .eq('status', 'pending_delivery')
    } else if (body.status === 'shipping' || body.status === 'delivered') {
      // Mark items as shipped
      await supabaseAdmin
        .from('draw_records')
        .update({ status: 'shipped' })
        .eq('order_id', orderId)
        .in('status', ['pending_delivery', 'in_warehouse'])
    }

    const status = updated?.status as ShipmentStatus | undefined
    if (status && updated?.user_id) {
      const statusText = statusTextMap[status] || status
      const title = body.notification_title || '配送訂單狀態更新'
      const baseBody =
        status === 'shipping' && updated?.tracking_number
          ? `您的配送訂單 ${updated.order_number} 已出貨，物流單號：${updated.tracking_number}`
          : `您的配送訂單 ${updated.order_number} 狀態已更新為：${statusText}`

      await supabaseAdmin.from('notifications').insert({
        user_id: updated.user_id,
        type: 'order_status',
        title,
        body: body.notification_body || baseBody,
        link: '/profile?tab=delivery',
        meta: {
          order_id: updated.id,
          order_number: updated.order_number,
          status,
          tracking_number: updated.tracking_number || null,
        },
      })
    }

    await logAdminAction({
      adminId: session.adminId,
      action: '更新訂單狀態',
      targetType: 'order',
      targetId: String(orderId),
      detail: {
        order_number: updated?.order_number,
        status: body.status,
        tracking_number: body.tracking_number,
      },
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true, order: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

