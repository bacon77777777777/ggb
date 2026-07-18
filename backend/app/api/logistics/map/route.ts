import { NextRequest, NextResponse } from 'next/server'
import { generateMapParams } from '@/lib/ecpay_logistics'

export async function POST(req: NextRequest) {
  try {
    let logisticsSubType = 'UNIMARTC2C'

    let requestId = ''
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      logisticsSubType = body.logisticsSubType || 'UNIMARTC2C'
      requestId = body.requestId || ''
    } else {
      const formData = await req.formData()
      logisticsSubType = (formData.get('logisticsSubType') as string) || 'UNIMARTC2C'
      requestId = (formData.get('requestId') as string) || ''
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (() => {
        try { return new URL(req.url).origin } catch { return 'http://localhost:3001' }
      })()

    const MerchantID = process.env.ECPAY_LOGISTICS_MERCHANT_ID || process.env.ECPAY_MERCHANT_ID!
    const HashKey    = process.env.ECPAY_LOGISTICS_HASH_KEY    || process.env.ECPAY_HASH_KEY!
    const HashIV     = process.env.ECPAY_LOGISTICS_HASH_IV     || process.env.ECPAY_HASH_IV!
    const MapUrl     = process.env.ECPAY_LOGISTICS_MAP_URL     || 'https://logistics-stage.ecpay.com.tw/Express/map'

    if (!MerchantID) return NextResponse.json({ error: '缺少 ECPAY_MERCHANT_ID' }, { status: 500 })

    const merchantTradeNo = 'M' + Date.now()
    const callbackUrl = requestId
      ? `${baseUrl}/api/logistics/map-callback?request_id=${encodeURIComponent(requestId)}`
      : `${baseUrl}/api/logistics/map-callback`

    const params = generateMapParams(merchantTradeNo, logisticsSubType, callbackUrl, MerchantID, HashKey, HashIV)

    const inputs = Object.entries(params)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}" />`)
      .join('\n')

    const html = `<!DOCTYPE html>
<html>
<head><title>選擇取貨門市...</title></head>
<body onload="document.forms[0].submit()">
  <form action="${MapUrl}" method="post">
    ${inputs}
  </form>
</body>
</html>`

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })

  } catch (error) {
    console.error('Map generation error:', error)
    return NextResponse.json({ error: 'Failed to generate map form' }, { status: 500 })
  }
}
