import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptTradeInfo } from '@/lib/newebpay';

export const dynamic = 'force-dynamic';

const isImmediatePayment = (paymentType: string) =>
  ['CREDIT', 'LINEPAY', 'WEBATM', 'ANDROIDPAY', 'SAMSUNGPAY'].includes(paymentType);

// 依藍新付款方式計算手續費
function calcNewebpayFee(paymentType: string, amount: number): number {
  switch (paymentType?.toUpperCase()) {
    case 'WEBATM':
    case 'VACC':       // ATM 轉帳
      return Math.min(Math.round(amount * 0.01), 20)
    case 'CVS':        // 超商代碼
      return 28
    case 'BARCODE':    // 超商條碼
      return 20
    case 'CREDIT':
    case 'LINEPAY':
    case 'ANDROIDPAY':
    case 'SAMSUNGPAY':
    default:
      return Math.round(amount * 0.02) // 信用卡類預設 2%（依合約）
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const MerchantID = formData.get('MerchantID') as string;
    const TradeInfo = formData.get('TradeInfo') as string;
    
    if (!MerchantID || !TradeInfo) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    
    const HashKey = process.env.NEWEBPAY_HASH_KEY!;
    const HashIV = process.env.NEWEBPAY_HASH_IV!;
    
    // Decrypt
    const data = decryptTradeInfo(TradeInfo, HashKey, HashIV);
    console.log('NewebPay Callback Data:', JSON.stringify(data, null, 2));
    
    // Check Status
    if (data.Status === 'SUCCESS') {
        const result = data.Result || {};
        const orderNumber = String(result.MerchantOrderNo || data.MerchantOrderNo || '');
        const paymentType = String(result.PaymentType || data.PaymentType || '');
        if (!orderNumber) return new NextResponse('OK', { status: 200 });
        if (paymentType && !isImmediatePayment(paymentType)) {
          return new NextResponse('OK', { status: 200 });
        }
        
        // Confirm Order
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        if (orderNumber.startsWith('TP')) {
          const amt = Number(result.Amt || 0)
          const paymentFee = amt > 0 ? calcNewebpayFee(paymentType, amt) : null
          const { error } = await supabaseAdmin.rpc('confirm_topup_order', {
              p_order_number: orderNumber,
              p_trade_no: String(result.TradeNo || '') || null,
              p_payment_type: paymentType || null,
              p_payment_fee: paymentFee,
          });
          if (error) {
              console.error('Confirm Order Error:', error);
              return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
          }
        } else if (orderNumber.startsWith('SO')) {
          const { error } = await supabaseAdmin.rpc('confirm_sell_escrow_order', {
            p_order_number: orderNumber,
            p_payment_type: paymentType || null,
            p_trade_no: String(result.TradeNo || '') || null,
            p_raw: result || null,
          });
          if (error) {
              console.error('Confirm Sell Escrow Error:', error);
              return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
          }
        }
        
    }
    
    return new NextResponse('OK', { status: 200 });
    
  } catch (error) {
    console.error('Callback Error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
