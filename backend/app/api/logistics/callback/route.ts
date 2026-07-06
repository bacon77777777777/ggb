import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLogisticsCheckMacValue, ecpayLogisticsStatusToOrder } from '@/lib/ecpay_logistics'
import { isAlreadyProcessed, logWebhookEvent } from '@/lib/webhookIdempotency'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const formData = await req.formData()

    const params: Record<string, string> = {}
    formData.forEach((v, k) => { params[k] = String(v) })

    console.log('ECPay Logistics Callback:', params)

    // 驗證 CheckMacValue
    const HashKey = process.env.ECPAY_LOGISTICS_HASH_KEY || process.env.ECPAY_HASH_KEY!
    const HashIV  = process.env.ECPAY_LOGISTICS_HASH_IV  || process.env.ECPAY_HASH_IV!
    if (!verifyLogisticsCheckMacValue(params, HashKey, HashIV)) {
      console.error('ECPay Logistics Callback CheckMacValue 驗證失敗')
      return new NextResponse('0|CheckMacValue Error', { status: 200 })
    }

    const orderNumber    = params.MerchantTradeNo  || ''
    const rtnCode        = params.RtnCode          || ''
    const logisticsStatus = params.LogisticsStatus || rtnCode
    const allPayId       = params.AllPayLogisticsID || ''
    const cvsPaymentNo   = params.CVSPaymentNo      || ''

    if (!orderNumber) {
      console.error('ECPay Logistics Callback: 缺少 MerchantTradeNo')
      return new NextResponse('0|Missing MerchantTradeNo', { status: 200 })
    }

    // 物流冪等 key = AllPayLogisticsID + LogisticsStatus（允許同訂單多次狀態更新）
    const idempotencyKey = `${allPayId || orderNumber}_${logisticsStatus}`
    if (await isAlreadyProcessed('ecpay_logistics', idempotencyKey)) {
      console.log(`[Logistics] 重複回調已略過 key=${idempotencyKey}`)
      await logWebhookEvent({ source: 'ecpay_logistics', idempotencyKey, orderNumber, rawPayload: params, result: 'duplicate' })
      return new NextResponse('1|OK', { status: 200 })
    }

    const { data: existingOrder, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, shipped_at, tracking_number')
      .eq('order_number', orderNumber)
      .maybeSingle()

    if (fetchError) {
      console.error('Error fetching order:', fetchError)
      return new NextResponse('0|DB Error', { status: 200 })
    }
    if (!existingOrder) return new NextResponse('1|OK', { status: 200 })

    const statusPriority: Record<string, number> = {
      submitted: 1, processing: 2, picked_up: 3, shipping: 4, delivered: 5, cancelled: 6,
    }

    const nextStatus = ecpayLogisticsStatusToOrder(logisticsStatus)
    const currentStatus = existingOrder.status as string
    const currentPriority = statusPriority[currentStatus] ?? 999
    const nextPriority = nextStatus ? (statusPriority[nextStatus] ?? 999) : 999

    const shouldAdvanceStatus = (() => {
      if (!nextStatus) return false
      if (currentStatus === 'cancelled') return false
      if (currentStatus === 'delivered' && nextStatus !== 'delivered') return false
      if (nextStatus === 'cancelled') return currentStatus !== 'delivered'
      return nextPriority > currentPriority
    })()

    const updateData: Record<string, any> = {}

    const trackingNumber = allPayId || cvsPaymentNo || null
    if (trackingNumber && trackingNumber !== existingOrder.tracking_number) {
      updateData.tracking_number = trackingNumber
    }

    if (shouldAdvanceStatus) {
      updateData.status = nextStatus
      if (
        (nextStatus === 'picked_up' || nextStatus === 'shipping' || nextStatus === 'delivered') &&
        !existingOrder.shipped_at
      ) {
        updateData.shipped_at = new Date().toISOString()
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', existingOrder.id)

      if (updateError) {
        console.error('Error updating order:', updateError)
        return new NextResponse('0|DB Update Error', { status: 200 })
      }

      if (updateData.status && statusPriority[updateData.status] >= statusPriority.picked_up) {
        await supabase
          .from('draw_records')
          .update({ status: 'shipped' })
          .eq('order_id', existingOrder.id)
          .eq('status', 'pending_delivery')
      }
    }

    // 成功處理，寫入冪等 log
    await logWebhookEvent({ source: 'ecpay_logistics', idempotencyKey, orderNumber, rawPayload: params, result: 'processed' })
    return new NextResponse('1|OK', { status: 200 })

  } catch (error: any) {
    console.error('ECPay Logistics Callback Error:', error)
    return new NextResponse('0|Internal Error', { status: 200 })
  }
}
