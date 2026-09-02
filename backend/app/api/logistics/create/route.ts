import { NextRequest, NextResponse } from 'next/server'
import { generateLogisticsParams, toEcpayCvsSubType } from '@/lib/ecpay_logistics'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { zipFromAddress } from '@/lib/twZip'
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

    /*
     * 寄件人：廠商欄位 → 平台設定（運費設定頁，2026-09-02 新增）→ env。
     * 平台是「廠商供貨、平台出貨」，正常情況吃平台設定那組。
     * ⚠️ 郵遞區號／地址空著就送，綠界會回「SenderZipCode Is Null」拒單 ——
     * 這裡改成開單前先驗，把「去哪裡補」講清楚，不讓錯誤埋在綠界回覆裡。
     */
    const { data: senderRows } = await supabase
      .from('platform_settings').select('key, value')
      .in('key', ['shipping_sender_name', 'shipping_sender_phone', 'shipping_sender_zip', 'shipping_sender_address'])
    const sc = Object.fromEntries((senderRows ?? []).map((r: any) => [r.key, String(r.value ?? '').trim()]))

    const senderName      = supplierInfo?.sender_name    || supplierInfo?.contact_name || sc.shipping_sender_name    || process.env.ECPAY_SENDER_NAME      || 'GGB吉吉比'
    const senderCellPhone = supplierInfo?.contact_phone                                || sc.shipping_sender_phone   || process.env.ECPAY_SENDER_CELL_PHONE || '0900000000'
    const senderZipCode   = supplierInfo?.sender_zip_code                              || sc.shipping_sender_zip     || process.env.ECPAY_SENDER_ZIP_CODE   || ''
    const senderAddress   = supplierInfo?.sender_address || supplierInfo?.address      || sc.shipping_sender_address || process.env.ECPAY_SENDER_ADDRESS    || ''

    /* 收件人郵遞區號：玩家只填地址不填 zip（不該要求玩家背），從地址推（lib/twZip） */
    const receiverZip = order.zip_code || (logisticsType === 'HOME' ? zipFromAddress(order.address) : null)
    if (logisticsType === 'HOME' && !receiverZip) {
      return NextResponse.json(
        { error: `收件地址推不出郵遞區號（${order.address}），請確認地址含縣市與鄉鎮市區` },
        { status: 400 },
      )
    }

    if (logisticsType === 'HOME' && (!senderZipCode || !senderAddress)) {
      return NextResponse.json(
        { error: '寄件人郵遞區號／地址未設定，請到「設定 → 運費設定 → 寄件人資料」填寫後再開單' },
        { status: 400 },
      )
    }

    const params = generateLogisticsParams(
      {
        MerchantTradeNo:   order.order_number,
        LogisticsType:     logisticsType,
        LogisticsSubType:  toEcpayCvsSubType(logisticsSubType),   // 品牌代號 → 綠界的 B2C／C2C 代號
        GoodsAmount:       Math.max(1, order.shipping_fee || 1),
        GoodsName:         'GGB吉吉比商品',
        SenderName:        senderName,
        SenderCellPhone:   senderCellPhone,
        SenderZipCode:     senderZipCode,
        SenderAddress:     senderAddress,
        ReceiverName:      order.recipient_name,
        ReceiverCellPhone: order.recipient_phone,
        ReceiverStoreID:   order.store_id  || undefined,
        ReceiverZipCode:   receiverZip     || undefined,
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

    /*
     * 三個編號全部留下來（migration 628）。
     * 改版前只寫 tracking_number，另外兩個丟掉 —— 而超商 C2C 的列印託運單 API
     * 三個都要，等於單建好了卻永遠印不出來。
     */
    const update: Record<string, any> = { status: 'processing' }
    if (trackingNumber) update.tracking_number = trackingNumber
    if (logisticsId)   update.ecpay_logistics_id = logisticsId
    if (cvsPaymentNo)  update.cvs_payment_no     = cvsPaymentNo
    if (cvsValidation) update.cvs_validation_no  = cvsValidation

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
