import { NextRequest, NextResponse } from 'next/server';
import { generateLogisticsForm } from '@/lib/newebpay_logistics';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function POST(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      (() => {
        try {
          return new URL(req.url).origin;
        } catch {
          return 'http://localhost:3001';
        }
      })();

    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const logisticsType = order.logistics_type || 'HOME';
    const logisticsSubType = order.logistics_subtype || 'TCAT'; // Default to TCAT for Home

    if (logisticsType === 'CVS') {
      if (!order.store_id) {
        return NextResponse.json({ error: '缺少門市資訊（store_id）' }, { status: 400 });
      }
      if (!logisticsSubType || logisticsSubType === 'TCAT') {
        return NextResponse.json({ error: '缺少門市類型（logistics_subtype）' }, { status: 400 });
      }
    }

    if (logisticsType === 'HOME') {
      if (!order.address) {
        return NextResponse.json({ error: '缺少收件地址（address）' }, { status: 400 });
      }
    }

    const logisticsOrder = {
      MerchantOrderNo: order.order_number,
      Amount: 0, // Shipping cost is usually prepaid or 0 for internal logic
      LogisticsType: logisticsType,
      LogisticsSubType: logisticsSubType,
      ReceiverName: order.recipient_name,
      ReceiverCellPhone: order.recipient_phone,
      ReceiverAddress: order.address,
      ReceiverEmail: '', // Optional
      ReceiverStoreID: order.store_id,
      ReturnURL: `${baseUrl}/api/logistics/callback`,
      ServerReplyURL: `${baseUrl}/api/logistics/callback`
    };

    const formData = generateLogisticsForm(logisticsOrder as any);

    const params = new URLSearchParams();
    params.append('MerchantID', formData.MerchantID);
    params.append('TradeInfo', formData.TradeInfo);
    params.append('TradeSha', formData.TradeSha);
    params.append('Version', formData.Version);

    const response = await fetch(formData.ActionURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('NewebPay API Error:', text);
      return NextResponse.json({ error: 'Failed to call NewebPay API', details: text }, { status: 500 });
    }

    const contentType = response.headers.get('content-type') || '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    const responseData = typeof responseBody === 'string'
      ? (() => {
          try {
            return JSON.parse(responseBody);
          } catch {
            return null;
          }
        })()
      : responseBody;

    if (!responseData || typeof responseData !== 'object') {
      return NextResponse.json({ error: 'NewebPay 回傳格式異常', details: responseBody }, { status: 502 });
    }

    const status = (responseData as any).Status;
    if (status === 'SUCCESS') {
      const result = (responseData as any).Result;
      const trackingNumber =
        result?.ShipCode ||
        result?.LogisticCode ||
        (responseData as any).ShipCode ||
        (responseData as any).LogisticCode ||
        null;

      const update: Record<string, any> = { status: 'processing' };
      if (trackingNumber) update.tracking_number = trackingNumber;

      const { error: updateError } = await supabase
        .from('orders')
        .update(update)
        .eq('id', orderId);

      if (updateError) {
        return NextResponse.json({ error: '物流單建立成功，但寫入資料庫失敗', details: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: responseData, trackingNumber });
    }

    return NextResponse.json(
      { error: 'NewebPay Error', details: (responseData as any).Message || (responseData as any).Status || responseBody },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Error creating logistics order:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
