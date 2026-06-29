import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encryptTradeInfo, generateTradeSha } from '@/lib/newebpay';

// Allow this route to be called
export const dynamic = 'force-dynamic';

const PLANS: Record<number, number> = {
    100: 0,
    500: 25,
    1000: 80,
    3000: 300,
    5000: 600,
    100000: 15000
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const kind = String(body?.kind || 'topup');
    const paymentMethod = String(body?.paymentMethod || '');
    const amountRaw = body?.amount;
    const orderIdRaw = body?.orderId;
    
    // Auth check
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize Supabase client with the user's auth token
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolveBaseUrl = () => {
      let BaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      if (!BaseUrl) {
        const host = req.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        BaseUrl = `${protocol}://${host}`;
      }
      return BaseUrl;
    };
    
    // Prepare NewebPay data
    const MerchantID = process.env.NEWEBPAY_MERCHANT_ID!;
    const HashKey = process.env.NEWEBPAY_HASH_KEY!;
    const HashIV = process.env.NEWEBPAY_HASH_IV!;
    const Version = process.env.NEWEBPAY_VERSION || '2.0';
    
    const BaseUrl = resolveBaseUrl();
    
    // Determine Frontend URL
    const FrontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

    // NewebPay Fixes:
    // 1. Replace 127.0.0.1 with localhost (NewebPay rejects 127.0.0.1)
    const NewebPayBaseUrl = BaseUrl.replace('127.0.0.1', 'localhost');
    const NewebPayFrontendUrl = FrontendUrl.replace('127.0.0.1', 'localhost');

    // 2. NotifyURL must be public (port 80/443). If using localhost/private IP or non-standard port, omit it to avoid errors.
    // This means callbacks won't work locally without ngrok, but at least the payment page will load.
    const isLocalDev = NewebPayBaseUrl.includes('localhost') || NewebPayBaseUrl.includes('127.0.0.1') || NewebPayBaseUrl.includes(':300');
    const NotifyURL = isLocalDev ? undefined : `${NewebPayBaseUrl}/api/payment/newebpay/callback`;

    const buildFlags = () => ({
      CREDIT: paymentMethod === 'credit_card' ? 1 : 0,
      WEBATM: paymentMethod === 'webatm' ? 1 : 0,
      VACC: paymentMethod === 'vacc' || paymentMethod === 'bank_transfer' ? 1 : 0,
      CVS: paymentMethod === 'cvs' ? 1 : 0,
      BARCODE: paymentMethod === 'barcode' ? 1 : 0,
      LINEPAY: paymentMethod === 'line_pay' ? 1 : 0,
      ANDROIDPAY: paymentMethod === 'android_pay' ? 1 : 0,
      SAMSUNGPAY: paymentMethod === 'samsung_pay' ? 1 : 0,
    });

    let orderNumber = '';
    let amt = 0;
    let itemDesc = '';
    let clientBackPath = '/';

    if (kind === 'topup') {
      const amount = Math.max(0, Math.floor(Number(amountRaw) || 0));
      if (!amount) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

      const bonus = PLANS[amount] || 0;
      const { data: orderData, error: orderError } = await supabase.rpc('create_topup_order', {
          p_amount: amount,
          p_bonus: bonus,
          p_payment_method: paymentMethod
      });
      if (orderError) throw orderError;
      orderNumber = String((orderData as any)?.order_number || '');
      amt = amount;
      itemDesc = `Gachapon Points Topup (${amount})`;
      clientBackPath = '/topup';
    } else if (kind === 'sell_escrow') {
      const orderId = Math.max(0, Math.floor(Number(orderIdRaw) || 0));
      if (!orderId) return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 });

      const { data: order, error: orderErr } = await supabase
        .from('sell_orders')
        .select('id, buyer_id, quantity, unit_price, payment_method, payment_status, cancelled, order_number')
        .eq('id', orderId)
        .single();
      if (orderErr) throw orderErr;

      const method = String((order as any)?.payment_method || '');
      if (method !== 'escrow') return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
      if ((order as any)?.cancelled) return NextResponse.json({ error: 'Order cancelled' }, { status: 400 });
      if (String((order as any)?.payment_status || '') === 'paid') return NextResponse.json({ error: 'Order already paid' }, { status: 400 });

      orderNumber = String((order as any)?.order_number || '');
      if (!orderNumber) {
        const { data: ensured, error: ensureErr } = await supabase.rpc('ensure_sell_order_number', { p_order_id: orderId });
        if (ensureErr) throw ensureErr;
        const ok = Boolean((ensured as any)?.success);
        if (!ok) return NextResponse.json({ error: String((ensured as any)?.message || 'Failed to init order number') }, { status: 400 });
        orderNumber = String((ensured as any)?.order_number || '');
      }

      const qty = Math.max(1, Math.floor(Number((order as any)?.quantity) || 1));
      const unitPrice = Math.max(0, Math.floor(Number((order as any)?.unit_price) || 0));
      amt = Math.max(0, qty * unitPrice);
      if (!amt) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

      itemDesc = `GachaGO 販售訂單 (${orderNumber})`;
      clientBackPath = `/sell-orders/${orderId}`;
    } else {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    }
    
    // Trade Info
    const tradeInfo = {
        MerchantID,
        RespondType: 'JSON' as const,
        TimeStamp: Math.floor(Date.now() / 1000).toString(),
        Version,
        MerchantOrderNo: orderNumber,
        Amt: amt,
        ItemDesc: itemDesc,
        Email: user.email || '',
        LoginType: 0 as const, // No login required
        ReturnURL: `${NewebPayBaseUrl}/api/payment/newebpay/return`, // Backend redirect
        NotifyURL: NotifyURL, // Backend webhook (optional, omitted in local dev)
        ClientBackURL: `${NewebPayFrontendUrl}${clientBackPath}`, // User clicks "Back to Shop" -> Frontend
        ...buildFlags(),
    };
    
    const TradeInfo = encryptTradeInfo(tradeInfo, HashKey, HashIV);
    const TradeSha = generateTradeSha(TradeInfo, HashKey, HashIV);
    const ApiUrl = process.env.NEWEBPAY_API_URL || 'https://ccore.newebpay.com/MPG/mpg_gateway';
    
    return NextResponse.json({
        MerchantID,
        TradeInfo,
        TradeSha,
        Version,
        ApiUrl
    });
    
  } catch (error: any) {
    console.error('Payment Init Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
