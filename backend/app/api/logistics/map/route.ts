import { NextRequest, NextResponse } from 'next/server';
import { generateMapForm } from '@/lib/newebpay_logistics';

export async function POST(req: NextRequest) {
  try {
    let logisticsSubType = 'UNIMART';
    
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      logisticsSubType = body.logisticsSubType || 'UNIMART';
    } else {
      const formData = await req.formData();
      logisticsSubType = (formData.get('logisticsSubType') as string) || 'UNIMART';
    }
    
    // The callback URL where NewebPay will post the store data
    // Must be absolute URL to the BACKEND
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
    const callbackUrl = `${baseUrl}/api/logistics/map-callback`;
    
    const form = generateMapForm(callbackUrl, logisticsSubType);
    if (!form.MerchantID) {
      return NextResponse.json({ error: '缺少 NEWEBPAY_MERCHANT_ID' }, { status: 500 });
    }
    if (!form.TradeInfo || !form.TradeSha) {
      return NextResponse.json({ error: '蓝新参数生成失败，请检查 NEWEBPAY_HASH_KEY / NEWEBPAY_HASH_IV' }, { status: 500 });
    }
    if (!form.ActionURL) {
      return NextResponse.json({ error: '缺少 NEWEBPAY_LOGISTICS_MAP_URL' }, { status: 500 });
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Redirecting to Map...</title>
        </head>
        <body onload="document.forms[0].submit()">
          <form action="${form.ActionURL}" method="post">
            <input type="hidden" name="MerchantID" value="${form.MerchantID}" />
            <input type="hidden" name="TradeInfo" value="${form.TradeInfo}" />
            <input type="hidden" name="TradeSha" value="${form.TradeSha}" />
            <input type="hidden" name="Version" value="${form.Version}" />
            <input type="hidden" name="LogisticsType" value="CVS" />
          </form>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Map generation error:', error);
    return NextResponse.json({ error: 'Failed to generate map form' }, { status: 500 });
  }
}
