import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptTradeInfo } from '@/lib/newebpay';

// Helper to get supabase client
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  // Use Service Role Key if available to bypass RLS for callbacks
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    
    const formData = await req.formData();
    const TradeInfo = formData.get('TradeInfo') as string;

    if (!TradeInfo) {
      return NextResponse.json({ error: 'Missing TradeInfo' }, { status: 400 });
    }

    const HashKey = process.env.NEWEBPAY_HASH_KEY!;
    const HashIV = process.env.NEWEBPAY_HASH_IV!;
    const decryptedInfo = decryptTradeInfo(TradeInfo, HashKey, HashIV);

    console.log('Logistics Callback:', decryptedInfo);

    const orderNumber = decryptedInfo.MerchantOrderNo;
    const trackingNumber = decryptedInfo.ShipCode || decryptedInfo.LogisticCode;
    const logisticsStatus = decryptedInfo.LogisticsStatus;
    
    if (!orderNumber) {
      return NextResponse.json({ error: 'Missing Order Number' }, { status: 400 });
    }

    const statusPriority: Record<string, number> = {
      submitted: 1,
      processing: 2,
      picked_up: 3,
      shipping: 4,
      delivered: 5,
      cancelled: 6,
    };

    const toOurStatus = (codeLike: unknown): string | null => {
      if (codeLike === null || codeLike === undefined) return null;
      const code = typeof codeLike === 'number' ? codeLike : Number(String(codeLike).trim());
      if (!Number.isFinite(code)) return null;

      if (code >= 300 && code < 400) {
        if (code === 300) return 'processing';
        if (code === 301) return 'picked_up';
        if (code === 302) return 'shipping';
        if (code === 303) return 'delivered';
        if (code >= 304) return 'cancelled';
        return null;
      }

      if (code >= 200 && code < 300) {
        if (code === 200) return 'processing';
        if (code === 201 || code === 202) return 'picked_up';
        if (code === 203 || code === 204) return 'shipping';
        if (code === 205 || code === 206) return 'delivered';
        if (code >= 207) return 'cancelled';
        return null;
      }

      if (code === 0) return 'processing';
      if (code === 1) return 'picked_up';
      if (code === 2) return 'shipping';
      if (code === 3) return 'delivered';

      return null;
    };

    const nextStatus = toOurStatus(logisticsStatus);

    const { data: existingOrder, error: existingOrderError } = await supabase
      .from('orders')
      .select('id, status, shipped_at, tracking_number')
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (existingOrderError) {
      console.error('Error fetching order:', existingOrderError);
      return NextResponse.json({ error: 'Database read failed' }, { status: 500 });
    }

    if (!existingOrder) {
      return NextResponse.json({ status: 'success', skipped: 'order_not_found' });
    }

    const currentStatus = existingOrder.status as string;
    const currentPriority = statusPriority[currentStatus] ?? 999;
    const nextPriority = nextStatus ? (statusPriority[nextStatus] ?? 999) : 999;

    const shouldAdvanceStatus = (() => {
      if (!nextStatus) return false;
      if (currentStatus === 'cancelled') return false;
      if (currentStatus === 'delivered' && nextStatus !== 'delivered') return false;
      if (nextStatus === 'cancelled') return currentStatus !== 'delivered';
      return nextPriority > currentPriority;
    })();

    const updateData: Record<string, any> = {};

    if (trackingNumber && trackingNumber !== existingOrder.tracking_number) {
      updateData.tracking_number = trackingNumber;
    }

    if (shouldAdvanceStatus) {
      updateData.status = nextStatus;
      if (
        (nextStatus === 'picked_up' || nextStatus === 'shipping' || nextStatus === 'delivered') &&
        !existingOrder.shipped_at
      ) {
        updateData.shipped_at = new Date().toISOString();
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', existingOrder.id);

      if (updateError) {
        console.error('Error updating order:', updateError);
        return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
      }

      if (updateData.status && statusPriority[updateData.status] >= statusPriority.picked_up) {
        const { error: drError } = await supabase
          .from('draw_records')
          .update({ status: 'shipped' })
          .eq('order_id', existingOrder.id)
          .eq('status', 'pending_delivery');

        if (drError) {
          console.error('Error updating draw_records:', drError);
          return NextResponse.json({ error: 'Database update failed (draw_records)' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ status: 'success' });

  } catch (error: any) {
    console.error('Callback Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
