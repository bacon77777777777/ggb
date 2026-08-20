import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCheckMacValue } from '@/lib/ecpay'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  /*
   * NEXT_PUBLIC_FRONTEND_URL 是玩家付款完被轉回前台的目的地 ——
   * Vercel 環境變數漏設這顆時，玩家會被丟到 localhost 死頁
   * （錢照樣入帳：入帳走 ReturnURL 那條 server-to-server 路）。
   * 2026-08-08 PROD 就是這樣炸的：Preview 有設、Production 漏了。
   */
  let FrontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'

  /**
   * 一律經由前台的 `/payment/return` 落地，不要直接導去目的頁。
   *
   * App 的付款是開在 in-app browser 的，那邊沒有 webview 的登入 cookie ——
   * 直接導去 `/profile` 只會看到「請先登入」，錢明明入帳了畫面卻在叫他登入
   * （老闆回報「儲值完最後一步跑到那一個未登錄頁面」，2026-08-20）。
   * 落地頁會判斷這趟是不是從 App 出發，是就把人導回 ggbapp://，
   * 不是就 302 去原本的目的地 —— 網頁版的體驗完全不變。
   */
  let fromApp = false
  const landing = (path: string) =>
    `${FrontendUrl}/payment/return?to=${encodeURIComponent(path)}${fromApp ? '&app=1' : ''}`

  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((v, k) => { params[k] = String(v) })
    // 建單時寫進 CustomField1 的「來自 App」記號（簽章涵蓋），
    // 落地頁看到 app=1 就直接把玩家導回 ggbapp://，不再靠瀏覽器儲存
    fromApp = params.CustomField1 === 'app'

    const HashKey = process.env.ECPAY_HASH_KEY!
    const HashIV = process.env.ECPAY_HASH_IV!

    if (!verifyCheckMacValue(params, HashKey, HashIV)) {
      return NextResponse.redirect(landing('/topup?status=error'), 302)
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
        return NextResponse.redirect(landing('/profile?tab=topup-history&status=success'), 302)
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
          landing(`/purchases?tab=to_ship&order=${encodeURIComponent(orderId)}&status=success`),
          302
        )
      }
      return NextResponse.redirect(landing('/?status=success'), 302)
    }

    // ATM/CVS 取號成功（RtnCode=2 ATM, 10100073 CVS）
    const isCodeGenerated = rtnCode === '2' || rtnCode === '10100073'
    if (isCodeGenerated) {
      if (tradeNo.startsWith('TP')) {
        return NextResponse.redirect(landing('/profile?tab=topup-history&status=waiting_payment'), 302)
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
          landing(`/purchases?tab=to_pay&order=${encodeURIComponent(orderId)}&status=waiting_payment`),
          302
        )
      }
    }

    // 付款失敗
    const msg = params.RtnMsg || 'Payment Failed'
    if (tradeNo.startsWith('SO')) {
      return NextResponse.redirect(
        landing(`/topup?status=failed&message=${encodeURIComponent(msg)}`),
        302
      )
    }
    return NextResponse.redirect(landing(`/topup?status=failed&message=${encodeURIComponent(msg)}`), 302)
  } catch (error) {
    console.error('ECPay Return Error:', error)
    return NextResponse.redirect(landing('/topup?status=error'), 302)
  }
}
