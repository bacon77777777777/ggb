import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCheckMacValue } from '@/lib/ecpay'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let FrontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'

  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((v, k) => { params[k] = String(v) })

    const HashKey = process.env.ECPAY_HASH_KEY!
    const HashIV = process.env.ECPAY_HASH_IV!

    if (!verifyCheckMacValue(params, HashKey, HashIV)) {
      return NextResponse.redirect(`${FrontendUrl}/topup?status=error`, 302)
    }

    const rtnCode = params.RtnCode
    const tradeNo = params.MerchantTradeNo || ''
    const paymentType = params.PaymentType || ''

    if (rtnCode === '1') {
      // 即時付款成功
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      if (tradeNo.startsWith('TP')) {
        await supabase.rpc('confirm_topup_order', { p_order_number: tradeNo })
        return NextResponse.redirect(`${FrontendUrl}/profile?tab=topup-history&status=success`, 302)
      }
      if (tradeNo.startsWith('SO')) {
        await supabase.rpc('confirm_sell_escrow_order', {
          p_order_number: tradeNo,
          p_payment_type: paymentType || null,
          p_trade_no: params.TradeNo || null,
          p_raw: params,
        })
        const { data: row } = await supabase
          .from('sell_orders')
          .select('id')
          .eq('order_number', tradeNo)
          .single()
        const orderId = String((row as any)?.id || '')
        return NextResponse.redirect(
          `${FrontendUrl}/purchases?tab=to_ship&order=${encodeURIComponent(orderId)}&status=success`,
          302
        )
      }
      return NextResponse.redirect(`${FrontendUrl}?status=success`, 302)
    }

    // ATM/CVS 取號成功（RtnCode=2 ATM, 10100073 CVS）
    const isCodeGenerated = rtnCode === '2' || rtnCode === '10100073'
    if (isCodeGenerated) {
      if (tradeNo.startsWith('TP')) {
        return NextResponse.redirect(`${FrontendUrl}/profile?tab=topup-history&status=waiting_payment`, 302)
      }
      if (tradeNo.startsWith('SO')) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: row } = await supabase
          .from('sell_orders')
          .select('id')
          .eq('order_number', tradeNo)
          .single()
        const orderId = String((row as any)?.id || '')
        return NextResponse.redirect(
          `${FrontendUrl}/purchases?tab=to_pay&order=${encodeURIComponent(orderId)}&status=waiting_payment`,
          302
        )
      }
    }

    // 付款失敗
    const msg = params.RtnMsg || 'Payment Failed'
    if (tradeNo.startsWith('SO')) {
      return NextResponse.redirect(
        `${FrontendUrl}/topup?status=failed&message=${encodeURIComponent(msg)}`,
        302
      )
    }
    return NextResponse.redirect(`${FrontendUrl}/topup?status=failed&message=${encodeURIComponent(msg)}`, 302)
  } catch (error) {
    console.error('ECPay Return Error:', error)
    return NextResponse.redirect(`${FrontendUrl}/topup?status=error`, 302)
  }
}
