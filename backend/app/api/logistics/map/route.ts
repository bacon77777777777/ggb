import { NextRequest, NextResponse } from 'next/server'
import { generateMapParams, toEcpayCvsSubType } from '@/lib/ecpay_logistics'

/**
 * GET：給 App 用（老闆 2026-08-24：不要跳轉出去 Safari）。
 *
 * 原本只有 POST，前台是「動態建 form + target=_blank」送出 —— 在 Capacitor 裡
 * `_blank` 會被交給系統瀏覽器，玩家被丟到 Safari、選完店又停在一片空白，回不來。
 * 改成 App 端用 in-app browser 開一個**網址**（開得起來、關得掉、回得來），
 * 所以這支要能吃 query string。網頁端維持原本的 POST + _blank，不動。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  return buildMapPage(req, sp.get('logisticsSubType') || 'UNIMARTC2C', sp.get('requestId') || '')
}

export async function POST(req: NextRequest) {
  let logisticsSubType = 'UNIMARTC2C'
  let requestId = ''
  try {
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
  } catch {
    // 參數讀不到就用預設，讓玩家至少看得到 7-11 的地圖
  }
  return buildMapPage(req, logisticsSubType, requestId)
}

/** 產生「自動送出到綠界選店地圖」的中繼頁（GET／POST 共用） */
async function buildMapPage(req: NextRequest, logisticsSubType: string, requestId: string) {
  try {
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

    // 前台送品牌代號（UNIMART…），這裡才依廠商編號開通的是 B2C 還是 C2C 補後綴
    const ecpaySubType = toEcpayCvsSubType(logisticsSubType)

    const params = generateMapParams(merchantTradeNo, ecpaySubType, callbackUrl, MerchantID, HashKey, HashIV)

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
