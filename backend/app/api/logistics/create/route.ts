import { NextRequest, NextResponse } from 'next/server'
import { generateLogisticsParams } from '@/lib/ecpay_logistics'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function POST(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (() => {
        try { return new URL(req.url).origin } catch { return 'http://localhost:3001' }
      })()

    const body = await req.json()
    const { orderId } = body
    if (!orderId) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        items:draw_records(
          products(
            suppliers(sender_name, contact_name, contact_phone, sender_zip_code, sender_address, address)
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // 從第一筆明細品項撈廠商寄件資料
    const supplierInfo = (order as any).items?.[0]?.products?.suppliers ?? null

    const logisticsType: 'CVS' | 'HOME' = (order.logistics_type || 'HOME') as 'CVS' | 'HOME'
    const logisticsSubType: string = order.logistics_subtype || 'TCAT'

    if (logisticsType === 'CVS') {
      if (!order.store_id)
        return NextResponse.json({ error: '缺少門市資訊（store_id）' }, { status: 400 })
      if (!logisticsSubType || logisticsSubType === 'TCAT')
        return NextResponse.json({ error: '缺少門市類型（logistics_subtype）' }, { status: 400 })
    }
    if (logisticsType === 'HOME' && !order.address)
      return NextResponse.json({ error: '缺少收件地址（address）' }, { status: 400 })

    const MerchantID = process.env.ECPAY_LOGISTICS_MERCHANT_ID || process.env.ECPAY_MERCHANT_ID!
    const HashKey    = process.env.ECPAY_LOGISTICS_HASH_KEY    || process.env.ECPAY_HASH_KEY!
    const HashIV     = process.env.ECPAY_LOGISTICS_HASH_IV     || process.env.ECPAY_HASH_IV!
    const ApiUrl     = process.env.ECPAY_LOGISTICS_API_URL     || 'https://logistics-stage.ecpay.com.tw/Express/Create'

    // 寄件人：優先用廠商的 sender_name，其次 contact_name，最後 env var
    const senderName      = supplierInfo?.sender_name      || supplierInfo?.contact_name      || process.env.ECPAY_SENDER_NAME       || 'GGB吉吉比'
    const senderCellPhone = supplierInfo?.contact_phone                                        || process.env.ECPAY_SENDER_CELL_PHONE  || '0900000000'
    const senderZipCode   = supplierInfo?.sender_zip_code                                      || process.env.ECPAY_SENDER_ZIP_CODE    || ''
    const senderAddress   = supplierInfo?.sender_address   || supplierInfo?.address            || process.env.ECPAY_SENDER_ADDRESS     || ''

    const params = generateLogisticsParams(
      {
        MerchantTradeNo:   order.order_number,
        LogisticsType:     logisticsType,
        LogisticsSubType:  logisticsSubType,
        GoodsAmount:       Math.max(1, order.shipping_fee || 1),
        GoodsName:         'GGB吉吉比商品',
        SenderName:        senderName,
        SenderCellPhone:   senderCellPhone,
        SenderZipCode:     senderZipCode,
        SenderAddress:     senderAddress,
        ReceiverName:      order.recipient_name,
        ReceiverCellPhone: order.recipient_phone,
        ReceiverStoreID:   order.store_id  || undefined,
        ReceiverZipCode:   order.zip_code  || undefined,
        ReceiverAddress:   order.address   || undefined,
        ServerReplyURL:    `${baseUrl}/api/logistics/callback`,
      },
      MerchantID, HashKey, HashIV
    )

    const formBody = new URLSearchParams(params).toString()
    const response = await fetch(ApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    })

    const rawText = await response.text()

    if (!response.ok) {
      console.error('ECPay Logistics API Error:', rawText)
      return NextResponse.json({ error: 'ECPay 物流 API 呼叫失敗', details: rawText }, { status: 500 })
    }

    // ECPay 回傳格式：「1|key=value&key=value」或「0|錯誤訊息」
    const pipeIdx = rawText.indexOf('|')
    const rtnFlag = pipeIdx !== -1 ? rawText.slice(0, pipeIdx) : rawText
    const payload = pipeIdx !== -1 ? rawText.slice(pipeIdx + 1) : ''

    if (rtnFlag.trim() !== '1') {
      return NextResponse.json({ error: `ECPay 物流錯誤: ${payload || rawText}` }, { status: 400 })
    }

    // 解析回傳 key=value 字串
    const resultMap: Record<string, string> = {}
    for (const pair of payload.split('&')) {
      const [k, ...vs] = pair.split('=')
      if (k) resultMap[decodeURIComponent(k)] = decodeURIComponent(vs.join('='))
    }

    const logisticsId    = resultMap.AllPayLogisticsID || null
    const cvsPaymentNo   = resultMap.CVSPaymentNo      || null
    const cvsValidation  = resultMap.CVSValidationNo   || null
    const trackingNumber = logisticsId || cvsPaymentNo || null

    const update: Record<string, any> = { status: 'processing' }
    if (trackingNumber) update.tracking_number = trackingNumber

    const { error: updateError } = await supabase
      .from('orders')
      .update(update)
      .eq('id', orderId)

    if (updateError)
      return NextResponse.json({ error: '物流單建立成功，但寫入資料庫失敗', details: updateError.message }, { status: 500 })

    return NextResponse.json({ success: true, logisticsId, cvsPaymentNo, cvsValidation, trackingNumber })

  } catch (error: any) {
    console.error('Error creating logistics order:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
