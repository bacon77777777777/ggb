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
      if (nextStatus === 'delivered') {
        updateData.delivered_at = new Date().toISOString()
      }
    }

    /*
     * 退貨／逾期未取（3006/3018 超商、3020/3022 宅配）要退貨退款，不是只改個狀態。
     *
     * 改版前這裡的條件是 `statusPriority[status] >= statusPriority.picked_up`，
     * 而 cancelled 的優先級是 6、picked_up 是 3 —— 6 >= 3 成立，
     * 於是退貨回來時訂單標成已取消，**玩家的品項卻被標成「已出貨」**：
     * 不在倉庫、也沒收到，這批貨就消失了，運費也沒退，玩家連通知都收不到。
     *
     * 現在交給 cancel_delivery_order（migration 631）：品項退回倉庫、
     * 退抽籤價金、發通知。運費不退 —— 那筆錢已經付給物流，逾期不取是玩家造成的。
     * 那支 function 本身是冪等的，綠界重送 callback 不會退兩次。
     */
    if (updateData.status === 'cancelled') {
      const { error: cancelErr } = await supabase.rpc('cancel_delivery_order', {
        p_order_id: existingOrder.id,
        p_kind: 'returned',
        p_operator: 'system:ecpay_logistics',
      })
      if (cancelErr) {
        console.error('cancel_delivery_order failed:', cancelErr)
        return new NextResponse('0|Cancel Error', { status: 200 })
      }
      // tracking_number 之類的其他欄位照樣寫回去，狀態由 function 負責
      const rest = { ...updateData }
      delete rest.status
      if (Object.keys(rest).length > 0) {
        await supabase.from('orders').update(rest).eq('id', existingOrder.id)
      }
      await logWebhookEvent({ source: 'ecpay_logistics', idempotencyKey, orderNumber, rawPayload: params, result: 'processed' })
      return new NextResponse('1|OK', { status: 200 })
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

      // 明確列舉，不要用優先級比大小 —— cancelled 的優先級最高，
      // 拿 `>= picked_up` 判斷會把「退貨」也算成「已出貨」
      if (updateData.status && ['picked_up', 'shipping', 'delivered'].includes(updateData.status)) {
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
