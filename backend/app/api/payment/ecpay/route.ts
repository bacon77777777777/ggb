import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateCheckMacValue } from '@/lib/ecpay'
import { paymentLimiter } from '@/lib/ratelimit'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const PLANS: Record<number, number> = {
  100: 0,
  500: 25,
  1000: 80,
  3000: 300,
  5000: 600,
  100000: 15000,
}

function getTaiwanDateString(): string {
  const now = new Date()
  const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${tw.getFullYear()}/${pad(tw.getMonth() + 1)}/${pad(tw.getDate())} ${pad(tw.getHours())}:${pad(tw.getMinutes())}:${pad(tw.getSeconds())}`
}

function toEcpayPayment(method: string): string {
  switch (method) {
    case 'credit_card': return 'Credit'
    case 'webatm':      return 'WebATM'
    case 'vacc':        return 'ATM'
    case 'cvs':         return 'CVS'
    case 'barcode':     return 'BARCODE'
    default:            return 'ALL'
  }
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { success } = await paymentLimiter.limit(ip)
    if (!success) return NextResponse.json({ error: '操作太頻繁，請稍候再試' }, { status: 429 })

    const body = await req.json()
    const kind = String(body?.kind || 'topup')

    // 儲值開關關掉時直接斷開綠界。
    // 只在前台隱藏按鈕是不夠的 —— 這支是公開端點，直接打就繞過去了。
    // 出貨付款（kind='delivery'）不受影響：那是玩家已經抽到東西要付運費，
    // 把它一起關掉等於扣著人家的獎品。
    if (kind === 'topup') {
      const { data: flag } = await getSupabaseAdmin()
        .from('feature_flags').select('enabled').eq('key', 'recharge').maybeSingle()
      if (flag && flag.enabled === false) {
        return NextResponse.json(
          { error: '儲值功能維護中，稍後再試。已購買的代幣不受影響。' },
          { status: 503 },
        )
      }
    }
    const paymentMethod = String(body?.paymentMethod || '')
    // App 出發的訂單：寫進 CustomField1（簽章涵蓋、綠界會原樣送回），
    // 回程路由靠它判斷要不要把玩家導回 App，不依賴任何瀏覽器儲存
    const fromApp = String(body?.client || '') === 'app'
    const amountRaw = body?.amount
    const orderIdRaw = body?.orderId

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const resolveBaseUrl = () => {
      let base = process.env.NEXT_PUBLIC_BASE_URL
      if (!base) {
        const host = req.headers.get('host') || 'localhost:3001'
        const protocol = host.includes('localhost') ? 'http' : 'https'
        base = `${protocol}://${host}`
      }
      return base
    }

    const MerchantID = process.env.ECPAY_MERCHANT_ID!
    const HashKey = process.env.ECPAY_HASH_KEY!
    const HashIV = process.env.ECPAY_HASH_IV!
    const BaseUrl = resolveBaseUrl()
    const FrontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'
    const isLocalDev = BaseUrl.includes('localhost') || BaseUrl.includes('127.0.0.1')
    const ApiUrl = process.env.ECPAY_API_URL || 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'

    let orderNumber = ''
    let amt = 0
    let itemName = ''
    let clientBackUrl = FrontendUrl

    if (kind === 'topup') {
      const amount = Math.max(0, Math.floor(Number(amountRaw) || 0))
      if (!amount) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

      const bonus = PLANS[amount] || 0
      const { data: orderData, error: orderError } = await supabase.rpc('create_topup_order', {
        p_amount: amount,
        p_bonus: bonus,
        p_payment_method: paymentMethod,
      })
      if (orderError) throw orderError
      orderNumber = String((orderData as any)?.order_number || '')
      amt = amount
      itemName = `吉吉比代幣 ${amount}點`
      /*
       * 綠界付款頁上的「返回商店」也要走前台的 `/payment/return` 落地。
       * App 的付款開在 in-app browser，那邊沒有登入 cookie —— 直接回 `/topup`
       * 會叫玩家登入（老闆 2026-08-20 附圖）。落地頁會判斷是不是從 App 出發，
       * 是就導回 ggbapp://，不是就 302 回 `/topup`，網頁版行為不變。
       */
      clientBackUrl = `${FrontendUrl}/payment/return?to=${encodeURIComponent('/topup')}${fromApp ? '&app=1' : ''}`
    } else if (kind === 'shop') {
      // 官方商城（B2C）。跟 sell_escrow 不同：這筆錢是收進平台的，
      // 訂單在 shop_orders，付款成功由 callback 呼叫 shop_order_mark_paid 入帳
      const orderId = Math.max(0, Math.floor(Number(orderIdRaw) || 0))
      if (!orderId) return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 })

      const { data: order, error: orderErr } = await supabase
        .from('shop_orders')
        .select('id, buyer_id, total_amount, payment_status, order_number')
        .eq('id', orderId)
        .single()
      if (orderErr) throw orderErr

      // 只能替自己的訂單產生付款表單
      if (String((order as any)?.buyer_id || '') !== user.id)
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      if (String((order as any)?.payment_status || '') === 'paid')
        return NextResponse.json({ error: '這筆訂單已經付款了' }, { status: 400 })

      orderNumber = String((order as any)?.order_number || '')
      if (!orderNumber) return NextResponse.json({ error: 'Order number missing' }, { status: 400 })

      amt = Math.max(0, Math.floor(Number((order as any)?.total_amount) || 0))
      if (!amt) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

      itemName = `吉吉比官方商城 ${orderNumber}`
      clientBackUrl = `${FrontendUrl}/shop-orders/${orderId}`
    } else if (kind === 'sell_escrow') {
      const orderId = Math.max(0, Math.floor(Number(orderIdRaw) || 0))
      if (!orderId) return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 })

      const { data: order, error: orderErr } = await supabase
        .from('sell_orders')
        .select('id, buyer_id, quantity, unit_price, payment_method, payment_status, cancelled, order_number')
        .eq('id', orderId)
        .single()
      if (orderErr) throw orderErr

      if (String((order as any)?.payment_method || '') !== 'escrow')
        return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
      if ((order as any)?.cancelled)
        return NextResponse.json({ error: 'Order cancelled' }, { status: 400 })
      if (String((order as any)?.payment_status || '') === 'paid')
        return NextResponse.json({ error: 'Order already paid' }, { status: 400 })

      orderNumber = String((order as any)?.order_number || '')
      if (!orderNumber) {
        const { data: ensured, error: ensureErr } = await supabase.rpc('ensure_sell_order_number', { p_order_id: orderId })
        if (ensureErr) throw ensureErr
        if (!(ensured as any)?.success)
          return NextResponse.json({ error: String((ensured as any)?.message || 'Failed to init order number') }, { status: 400 })
        orderNumber = String((ensured as any)?.order_number || '')
      }

      const qty = Math.max(1, Math.floor(Number((order as any)?.quantity) || 1))
      const unitPrice = Math.max(0, Math.floor(Number((order as any)?.unit_price) || 0))
      amt = Math.max(0, qty * unitPrice)
      if (!amt) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

      itemName = `吉吉比商城訂單 ${orderNumber}`
      clientBackUrl = `${FrontendUrl}/sell-orders/${orderId}`
    } else {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }

    // ECPay MerchantTradeNo: 最長 20 碼英數字
    const tradeNo = orderNumber.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)

    const choosePayment = toEcpayPayment(paymentMethod)
    // ATM/CVS/BARCODE 不支援 OrderResultURL
    const isOffline = ['ATM', 'CVS', 'BARCODE'].includes(choosePayment)

    const params: Record<string, string> = {
      MerchantID,
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: getTaiwanDateString(),
      PaymentType: 'aio',
      TotalAmount: String(amt),
      TradeDesc: 'GGB',
      ItemName: itemName.slice(0, 200),
      ReturnURL: isLocalDev ? 'https://localhost/api/payment/ecpay/callback' : `${BaseUrl}/api/payment/ecpay/callback`,
      ChoosePayment: choosePayment,
      EncryptType: '1',
      ClientBackURL: clientBackUrl,
    }
    if (fromApp) params.CustomField1 = 'app'

    if (!isOffline) {
      params.OrderResultURL = isLocalDev
        ? 'https://localhost/api/payment/ecpay/return'
        : `${BaseUrl}/api/payment/ecpay/return`
    }

    params.CheckMacValue = generateCheckMacValue(params, HashKey, HashIV)

    return NextResponse.json({ action: ApiUrl, fields: params })
  } catch (error: any) {
    console.error('ECPay Payment Init Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
