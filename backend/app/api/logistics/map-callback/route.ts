import { NextRequest, NextResponse } from 'next/server';
import { decryptTradeInfo } from '@/lib/newebpay';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const TradeInfo = formData.get('TradeInfo') as string;
    
    if (!TradeInfo) {
      return NextResponse.redirect(new URL('/profile?error=missing_trade_info', req.url));
    }

    const HashKey = process.env.NEWEBPAY_HASH_KEY || '';
    const HashIV = process.env.NEWEBPAY_HASH_IV || '';
    
    const decrypted = decryptTradeInfo(TradeInfo, HashKey, HashIV);
    console.log('Map Callback Decrypted:', decrypted);
    
    // Decrypted data format example:
    // {
    //   MerchantID: '...',
    //   LogisticsSubType: 'UNIMART',
    //   CVSStoreID: '123456',
    //   CVSStoreName: 'Store Name',
    //   CVSAddress: 'Address...',
    //   CVSTelephone: '...',
    //   ExtraData: '...'
    // }

    const storeId = decrypted.CVSStoreID || '';
    const storeName = decrypted.CVSStoreName || '';
    const storeAddress = decrypted.CVSAddress || '';
    const logisticsSubType = decrypted.LogisticsSubType || 'UNIMART';

    // Redirect back to profile with data
    // Must redirect to FRONTEND
    let frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

    if (!frontendUrl) {
      try {
        const url = new URL(req.url);
        frontendUrl = url.origin;
      } catch (e) {
        frontendUrl = 'http://localhost:3000';
      }
    }

    // Ensure localhost is used instead of 127.0.0.1
    frontendUrl = frontendUrl.replace('127.0.0.1', 'localhost');
    
    const redirectUrl = new URL(`${frontendUrl}/profile`);
    redirectUrl.searchParams.set('tab', 'delivery');
    redirectUrl.searchParams.set('store_id', storeId);
    redirectUrl.searchParams.set('store_name', storeName);
    redirectUrl.searchParams.set('store_address', storeAddress);
    redirectUrl.searchParams.set('logistics_subtype', logisticsSubType);
    redirectUrl.searchParams.set('action', 'open_delivery_modal');

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Map callback error:', error);
    return NextResponse.redirect(new URL('/profile?error=map_callback_failed', req.url));
  }
}
