import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCheckMacValue } from '@/lib/ecpay'
import { isAlreadyProcessed, logWebhookEvent } from '@/lib/webhookIdempotency'

export const dynamic = 'force-dynamic'

// 即時付款方式（付完馬上確認）
const IMMEDIATE = ['Credit_CreditCard', 'WebATM', 'TWQR_TWQR']

function isImmediatePayment(paymentType: string): boolean {
  return IMMEDIATE.some(t => paymentType.startsWith(t.split('_')[0]))
}

function calcEcpayFee(paymentType: string, amount: number): number {
  const t = paymentType.toUpperCase()
  if (t.startsWith('WEBATM') || t.startsWith('ATM')) return Math.min(Math.round(amount * 0.01), 15)
  if (t.startsWith('CVS'))     return 31
  if (t.startsWith('BARCODE')) return 16
  // 信用卡 / Apple Pay / 銀聯：2.75% + 1元處理費
  return Math.round(amount * 0.0275) + 1
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((v, k) => { params[k] = String(v) })

    const HashKey = process.env.ECPAY_HASH_KEY!
    const HashIV = process.env.ECPAY_HASH_IV!

    if (!verifyCheckMacValue(params, HashKey, HashIV)) {
      console.error('ECPay callback CheckMacValue 驗證失敗')
      return new NextResponse('0|CheckMacValue Error', { status: 200 })
    }

    const rtnCode = params.RtnCode
    const tradeNo = params.MerchantTradeNo || ''
    const paymentType = params.PaymentType || ''

    if (rtnCode !== '1') {
      console.log(`ECPay callback: 非成功狀態 RtnCode=${rtnCode} tradeNo=${tradeNo}`)
      return new NextResponse('1|OK', { status: 200 })
    }

    if (!isImmediatePayment(paymentType)) {
      // ATM/CVS 取號完成，等實際繳費才真正 confirm
      return new NextResponse('1|OK', { status: 200 })
    }

    // 冪等性檢查：同一 ECPay TradeNo 只處理一次
    const ecpayTradeNo = params.TradeNo || tradeNo
    const idempotencyKey = ecpayTradeNo || tradeNo
    if (await isAlreadyProcessed('ecpay_payment', idempotencyKey)) {
      console.log(`[ECPay] 重複回調已略過 tradeNo=${idempotencyKey}`)
      await logWebhookEvent({ source: 'ecpay_payment', idempotencyKey, orderNumber: tradeNo, rawPayload: params, result: 'duplicate' })
      return new NextResponse('1|OK', { status: 200 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const amt = Number(params.TradeAmt || 0)
    const paymentFee = amt > 0 ? calcEcpayFee(paymentType, amt) : null
    const ecpayTradeNo = params.TradeNo || null

    if (tradeNo.startsWith('TP')) {
      const { error } = await supabase.rpc('confirm_topup_order', {
        p_order_number: tradeNo,
        p_trade_no: ecpayTradeNo,
        p_payment_type: paymentType || null,
        p_payment_fee: paymentFee,
      })
      if (error) {
        console.error('confirm_topup_order Error:', error)
        await logWebhookEvent({ source: 'ecpay_payment', idempotencyKey, orderNumber: tradeNo, rawPayload: params, result: 'failed', errorMessage: error.message })
        return new NextResponse('0|Internal Error', { status: 200 })
      }

      const { data: recharge } = await supabase
        .from('recharge_records')
        .select('user_id, amount')
        .eq('order_number', tradeNo)
        .single()
      if (recharge?.user_id) {
        await supabase.from('user_event_logs').insert({
          user_id: recharge.user_id,
          event_type: 'topup',
          detail: { order_number: tradeNo, amount: recharge.amount ?? amt, payment_type: paymentType },
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        })
      }
    } else if (tradeNo.startsWith('SO')) {
      const { error } = await supabase.rpc('confirm_sell_escrow_order', {
        p_order_number: tradeNo,
        p_payment_type: paymentType || null,
        p_trade_no: ecpayTradeNo,
        p_raw: params,
      })
      if (error) {
        console.error('confirm_sell_escrow_order Error:', error)
        await logWebhookEvent({ source: 'ecpay_payment', idempotencyKey, orderNumber: tradeNo, rawPayload: params, result: 'failed', errorMessage: error.message })
        return new NextResponse('0|Internal Error', { status: 200 })
      }
    }

    // 成功處理，寫入冪等 log
    await logWebhookEvent({ source: 'ecpay_payment', idempotencyKey, orderNumber: tradeNo, rawPayload: params, result: 'processed' })
    return new NextResponse('1|OK', { status: 200 })
  } catch (error) {
    console.error('ECPay Callback Error:', error)
    return new NextResponse('0|Internal Error', { status: 200 })
  }
}
