import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { generatePrintTarget } from '@/lib/ecpay_logistics'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 列印綠界託運單
 *
 * 改版前那顆「列印物流單」只是 `window.print()` —— 把整個後台頁面（含左側選單）
 * 送進印表機，從來沒有真的去印綠界的託運單。
 *
 * 綠界沒有「回傳 PDF」的 API，只有幾支必須 POST 過去、回傳一頁 HTML 的列印頁。
 * 所以這裡回一張**自動送出的表單**，瀏覽器開了就會自己 POST 到綠界並顯示託運單。
 *
 * 支援多筆：綠界的列印頁一次只吃一筆，所以多筆時逐一開新分頁。
 */
export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId) return NextResponse.json({ error: '缺少訂單 ID' }, { status: 400 })

  const merchantID = process.env.ECPAY_LOGISTICS_MERCHANT_ID
  const hashKey    = process.env.ECPAY_LOGISTICS_HASH_KEY
  const hashIV     = process.env.ECPAY_LOGISTICS_HASH_IV
  const apiUrl     = process.env.ECPAY_LOGISTICS_API_URL || 'https://logistics-stage.ecpay.com.tw/Express/Create'
  if (!merchantID || !hashKey || !hashIV) {
    return NextResponse.json({ error: '綠界物流金鑰未設定' }, { status: 500 })
  }

  const supabase = getSupabaseAdmin()
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, logistics_type, logistics_subtype, tracking_number, ecpay_logistics_id, cvs_payment_no, cvs_validation_no')
    .eq('id', Number(orderId))
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 })

  let target
  try {
    target = generatePrintTarget(
      order.logistics_subtype || order.logistics_type || 'TCAT',
      {
        // 舊資料只有 tracking_number，退而求其次當成交易編號用
        logisticsId:     order.ecpay_logistics_id || order.tracking_number,
        cvsPaymentNo:    order.cvs_payment_no,
        cvsValidationNo: order.cvs_validation_no,
      },
      merchantID, hashKey, hashIV, apiUrl,
    )
  } catch (err: any) {
    // 缺欄位是可預期的（改版前建立的單沒存），要講得出下一步怎麼辦
    return NextResponse.json(
      { error: `${err?.message ?? '無法列印'}（訂單 ${order.order_number}）` },
      { status: 400 },
    )
  }

  await logAdminAction({
    adminId: session.adminId,
    action: '列印物流單',
    targetType: 'order',
    targetId: String(order.id),
    detail: { order_number: order.order_number, subtype: order.logistics_subtype },
    ip: getClientIp(req),
  })

  const esc = (v: string) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const fields = Object.entries(target.params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('\n    ')

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>列印託運單 ${esc(order.order_number ?? '')}</title>
</head>
<body style="font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;padding:24px;color:#525252">
  正在向綠界取得託運單…
  <form id="f" method="POST" action="${esc(target.url)}">
    ${fields}
  </form>
  <script>document.getElementById('f').submit()</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
