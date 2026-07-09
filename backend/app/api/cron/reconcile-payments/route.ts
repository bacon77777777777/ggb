import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateCheckMacValue } from '@/lib/ecpay'
import { createLinePusher } from '@/lib/linePush'
const pushLine = createLinePusher('line_push_finance')

export const dynamic = 'force-dynamic'

const CRON_SECRET    = process.env.CRON_SECRET ?? ''
const MERCHANT_ID    = process.env.ECPAY_MERCHANT_ID ?? ''
const HASH_KEY       = process.env.ECPAY_HASH_KEY ?? ''
const HASH_IV        = process.env.ECPAY_HASH_IV ?? ''

// 從 AioCheckOut URL 推算 QueryTradeInfo URL
function getQueryUrl(): string {
  const base = process.env.ECPAY_API_URL ?? ''
  if (base.includes('payment-stage')) return 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5'
  return 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5'
}

async function queryEcpayTrade(merchantTradeNo: string): Promise<{ status: string; tradeNo: string | null; amt: number } | null> {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const params = { MerchantID: MERCHANT_ID, MerchantTradeNo: merchantTradeNo, TimeStamp: timestamp }
  const checkValue = generateCheckMacValue(params, HASH_KEY, HASH_IV)

  const form = new URLSearchParams({ ...params, CheckValue: checkValue })
  try {
    const res = await fetch(getQueryUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    const text = await res.text()
    // ECPay 回傳 key=value& 格式
    const result: Record<string, string> = {}
    text.split('&').forEach(pair => {
      const [k, v] = pair.split('=')
      if (k) result[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
    })
    return {
      status: result.TradeStatus ?? '',          // '1' = 付款成功
      tradeNo: result.TradeNo ?? null,
      amt: Number(result.TradeAmt ?? 0),
    }
  } catch {
    return null
  }
}


export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 找 pending 超過 2 小時的儲值單（排除無 order_number 的資料）
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString()
  const { data: stuckRecords } = await supabase
    .from('recharge_records')
    .select('id, order_number, amount')
    .eq('status', 'pending')
    .not('order_number', 'is', null)
    .like('order_number', 'TP%')
    .lt('created_at', twoHoursAgo)
    .limit(50)

  const records = stuckRecords ?? []
  let fixed = 0
  let failed = 0
  const fixedOrders: string[] = []

  for (const rec of records) {
    const ecpay = await queryEcpayTrade(rec.order_number)
    if (!ecpay) continue

    if (ecpay.status === '1') {
      // ECPay 確認付款成功 → 補 confirm
      const { error } = await supabase.rpc('confirm_topup_order', {
        p_order_number: rec.order_number,
        p_trade_no: ecpay.tradeNo,
        p_payment_type: 'reconcile',
        p_payment_fee: null,
      })
      if (!error) {
        fixed++
        fixedOrders.push(rec.order_number)
      }
    } else if (['10200047', '10200048', '10200041'].includes(ecpay.status)) {
      // 過期/取消/失敗 → 標記 failed
      await supabase.from('recharge_records').update({ status: 'failed' }).eq('order_number', rec.order_number)
      failed++
    }
    // 其他狀態（0=未付款但未過期）保持 pending
  }

  // 有補單或 stuck 數量過多才推 LINE
  if (fixed > 0 || records.length >= 10) {
    const lines = [
      `🔍 ECPay 對帳完成`,
      ``,
      `📋 稽核範圍：${records.length} 筆 pending > 2h`,
      `✅ 補確認：${fixed} 筆${fixedOrders.length > 0 ? `（${fixedOrders.join('、')}）` : ''}`,
      `❌ 標記失敗：${failed} 筆`,
    ]
    if (records.length >= 10) lines.push(`⚠️ pending 積壓較多，請確認 callback 是否正常`)
    await pushLine(lines.join('\n'))
  }

  return NextResponse.json({ checked: records.length, fixed, failed, fixedOrders })
}
