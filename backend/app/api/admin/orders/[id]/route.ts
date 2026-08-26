import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { voidC2COrder, type VoidResult } from '@/lib/ecpay_logistics'

/**
 * 作廢綠界託運單。只有超商 C2C 有這支 API，其餘一律 skipped（不算失敗）。
 * 任何錯誤都吞掉、只回結果 —— 呼叫端要的是「記下來」，不是「中斷取消」。
 */
async function voidEcpayLogistics(orderId: number): Promise<VoidResult | null> {
  const merchantID = process.env.ECPAY_LOGISTICS_MERCHANT_ID
  const hashKey    = process.env.ECPAY_LOGISTICS_HASH_KEY
  const hashIV     = process.env.ECPAY_LOGISTICS_HASH_IV
  const apiUrl     = process.env.ECPAY_LOGISTICS_API_URL || 'https://logistics-stage.ecpay.com.tw/Express/Create'
  if (!merchantID || !hashKey || !hashIV) return null

  try {
    const { data: o } = await getSupabaseAdmin()
      .from('orders')
      .select('logistics_type, logistics_subtype, ecpay_logistics_id, cvs_payment_no, cvs_validation_no')
      .eq('id', orderId)
      .maybeSingle()
    if (!o) return null
    return await voidC2COrder(o, merchantID, hashKey, hashIV, apiUrl)
  } catch (e: any) {
    return { ok: false, message: e?.message || '作廢託運單時發生例外' }
  }
}

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
    const session = await requireAdminScope()
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

    // 廠商：只能看自己的單，且玩家個資遮罩（同列表 API 的規則）
    if (session.supplierScope !== undefined) {
      if (data.supplier_id !== session.supplierScope) {
        return NextResponse.json({ error: '找不到訂單' }, { status: 404 })
      }
      return NextResponse.json({
        ...data,
        recipient_name: data.recipient_name ? String(data.recipient_name).slice(0, 1) + '○○' : null,
        recipient_phone: data.recipient_phone ? '****' + String(data.recipient_phone).slice(-3) : null,
        address: null,
        user: null,
      })
    }

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
    const session = await requireAdminScope()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // 出貨/改單是平台的事 —— 廠商帳號僅供查看
    if (session.supplierScope !== undefined) {
      return NextResponse.json({ error: '廠商帳號僅供查看，出貨作業由平台處理' }, { status: 403 })
    }

    const { id } = await params
    const supabaseAdmin = getSupabaseAdmin()
    const body = await request.json()

    const orderId = Number(id)
    if (!Number.isFinite(orderId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
    }

    const patch: Record<string, any> = {}
    let voidResult: VoidResult | null = null
    if (body.status) patch.status = body.status
    if (body.tracking_number !== undefined) patch.tracking_number = body.tracking_number
    if (body.shipped_at !== undefined) patch.shipped_at = body.shipped_at
    // 切到 picked_up 時自動記錄出貨時間（若尚未設定）
    // 送達時間要留下來 —— updated_at 任何一次更新都會動，不能當送達時間用
    if (body.status === 'delivered' && body.delivered_at === undefined) {
      patch.delivered_at = new Date().toISOString()
    }
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
      /*
       * 取消一律走 cancel_delivery_order（migration 631）——
       * 原本這裡只把品項退回倉庫，**運費與抽籤價金一毛沒退**，玩家白付 60–65，
       * 對帳公式也少掉這一筆。退款與通知都在那支 function 裡，
       * 後台、批量、綠界退貨三個入口共用同一份邏輯。
       */
      await supabaseAdmin.rpc('cancel_delivery_order', {
        p_order_id: orderId,
        p_kind: 'admin',
        p_operator: `admin:${session.adminId}`,
      })

      /*
       * 順手把綠界那張託運單作廢，不然會一直掛在對方後台。
       *
       * ⚠️ 作廢失敗**不能讓取消訂單失敗** —— 玩家的貨與代幣已經退了，
       * 這時候回錯誤只會讓管理員以為沒取消成功、又按一次。
       * 失敗就記進稽核軌跡，人工去綠界後台處理。
       */
      voidResult = await voidEcpayLogistics(orderId)
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
        ...(voidResult ? { ecpay_void: voidResult } : {}),
      },
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true, order: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

