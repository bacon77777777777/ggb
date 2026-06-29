import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptTradeInfo } from '@/lib/newebpay';

export const dynamic = 'force-dynamic';

const isImmediatePayment = (paymentType: string) =>
  ['CREDIT', 'LINEPAY', 'WEBATM', 'ANDROIDPAY', 'SAMSUNGPAY'].includes(paymentType);

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const TradeInfo = formData.get('TradeInfo') as string;
        
        const HashKey = process.env.NEWEBPAY_HASH_KEY!;
        const HashIV = process.env.NEWEBPAY_HASH_IV!;
        
        const data = decryptTradeInfo(TradeInfo, HashKey, HashIV);
        // Frontend URL should be configured. Assuming localhost:3000 for dev if not set.
        let FrontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

        if (!FrontendUrl) {
            // Try to infer from request URL
            try {
                const url = new URL(req.url);
                FrontendUrl = url.origin;
            } catch (e) {
                FrontendUrl = 'http://localhost:3000';
            }
        }
        
        // Ensure localhost is used instead of 127.0.0.1 if it's localhost
        FrontendUrl = FrontendUrl.replace('127.0.0.1', 'localhost');

        if (data.Status === 'SUCCESS') {
            const result = data.Result;
            const orderNumber = result?.MerchantOrderNo || data.MerchantOrderNo;
            const paymentType = result?.PaymentType || data.PaymentType; // e.g., CREDIT, VACC, LINEPAY

            // For offline payments (VACC, CVS, BARCODE), Status=SUCCESS usually means "Code Generated".
            // We should NOT confirm the order (grant points) yet.
            // Only confirm for immediate payments (CREDIT, LINEPAY, WEBATM).
            const immediate = isImmediatePayment(String(paymentType || ''));

            if (orderNumber && immediate) {
                const supabaseAdmin = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                );
                
                // We ignore errors here because it might have been confirmed by NotifyURL already
                // and the function handles idempotency (checks if already success).
                const orderNoStr = String(orderNumber || '');
                if (orderNoStr.startsWith('TP')) {
                  await supabaseAdmin.rpc('confirm_topup_order', { p_order_number: orderNoStr });
                  return NextResponse.redirect(`${FrontendUrl}/profile?tab=topup-history&status=success`, 302);
                }
                if (orderNoStr.startsWith('SO')) {
                  await supabaseAdmin.rpc('confirm_sell_escrow_order', {
                    p_order_number: orderNoStr,
                    p_payment_type: String(paymentType || '') || null,
                    p_trade_no: String((result as any)?.TradeNo || '') || null,
                    p_raw: result || null,
                  });
                  const { data: row } = await supabaseAdmin
                    .from('sell_orders')
                    .select('id')
                    .eq('order_number', orderNoStr)
                    .single();
                  const orderId = String((row as any)?.id || '');
                  return NextResponse.redirect(`${FrontendUrl}/purchases?tab=to_ship&order=${encodeURIComponent(orderId)}&status=success`, 302);
                }
                return NextResponse.redirect(`${FrontendUrl}?status=success`, 302);
            } else if (orderNumber && !immediate) {
                // Offline payment (ATM/CVS) - Code generated but not paid
                // Redirect to history with "pending" status
                // Ideally we should store the payment code (CodeNo/PayCode) here, but for now we just prevent auto-confirm.
                const orderNoStr = String(orderNumber || '');
                if (orderNoStr.startsWith('TP')) {
                  return NextResponse.redirect(`${FrontendUrl}/profile?tab=topup-history&status=waiting_payment`, 302);
                }
                if (orderNoStr.startsWith('SO')) {
                  const supabaseAdmin = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                  );
                  const { data: row } = await supabaseAdmin
                    .from('sell_orders')
                    .select('id')
                    .eq('order_number', orderNoStr)
                    .single();
                  const orderId = String((row as any)?.id || '');
                  return NextResponse.redirect(`${FrontendUrl}/purchases?tab=to_pay&order=${encodeURIComponent(orderId)}&status=waiting_payment`, 302);
                }
                return NextResponse.redirect(`${FrontendUrl}?status=waiting_payment`, 302);
            }
            
            // Fallback if no order number (should not happen)
             return NextResponse.redirect(`${FrontendUrl}/profile?tab=topup-history&status=success`, 302);
        } else {
            const msg = data.Message || 'Payment Failed';
            const result = data.Result || {};
            const orderNumber = String(result?.MerchantOrderNo || data.MerchantOrderNo || '');
            if (orderNumber.startsWith('SO')) {
              const supabaseAdmin = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
              );
              const { data: row } = await supabaseAdmin
                .from('sell_orders')
                .select('id')
                .eq('order_number', orderNumber)
                .single();
              const orderId = String((row as any)?.id || '');
              return NextResponse.redirect(
                `${FrontendUrl}/purchases?tab=to_pay&order=${encodeURIComponent(orderId)}&status=failed&message=${encodeURIComponent(msg)}`,
                302
              );
            }
            return NextResponse.redirect(`${FrontendUrl}/topup?status=failed&message=${encodeURIComponent(msg)}`, 302);
        }
    } catch (error) {
        console.error('Return URL Error:', error);
        let FrontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
        FrontendUrl = FrontendUrl.replace('127.0.0.1', 'localhost');
        return NextResponse.redirect(`${FrontendUrl}/topup?status=error`, 302);
    }
}
