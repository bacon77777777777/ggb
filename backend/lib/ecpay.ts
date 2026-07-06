import crypto from 'crypto'

// ECPay 專用 URL Encode：urlencode → 全小寫 → .NET 特殊字元還原
function ecpayUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .toLowerCase()
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
}

export function generateCheckMacValue(
  params: Record<string, string | number>,
  hashKey: string,
  hashIV: string
): string {
  const sorted = Object.entries(params)
    .filter(([k]) => k !== 'CheckMacValue')
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))

  const raw =
    `HashKey=${hashKey}&` +
    sorted.map(([k, v]) => `${k}=${v}`).join('&') +
    `&HashIV=${hashIV}`

  return crypto.createHash('sha256').update(ecpayUrlEncode(raw)).digest('hex').toUpperCase()
}

// ECPay QueryTradeInfo — returns TradeStatus: '1' = paid, '0' = unpaid/failed
export async function queryEcpayTrade(merchantTradeNo: string): Promise<{
  tradeStatus: string   // '1' = paid
  tradeAmt: string
  paymentDate: string
  raw: Record<string, string>
} | null> {
  const merchantId = process.env.ECPAY_MERCHANT_ID
  const hashKey    = process.env.ECPAY_HASH_KEY
  const hashIV     = process.env.ECPAY_HASH_IV
  if (!merchantId || !hashKey || !hashIV) return null

  const baseUrl = (process.env.ECPAY_API_URL ?? '')
    .replace('/Cashier/AioCheckOut/V5', '')

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const params: Record<string, string> = {
    MerchantID:       merchantId,
    MerchantTradeNo:  merchantTradeNo,
    TimeStamp:        timestamp,
  }
  params.CheckMacValue = generateCheckMacValue(params, hashKey, hashIV)

  const body = new URLSearchParams(params).toString()
  const res = await fetch(`${baseUrl}/Cashier/QueryTradeInfo/V5`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const text = await res.text()
  const result: Record<string, string> = {}
  for (const part of text.split('&')) {
    const eq = part.indexOf('=')
    if (eq > -1) result[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1))
  }

  return {
    tradeStatus: result.TradeStatus ?? '',
    tradeAmt:    result.TradeAmt ?? '',
    paymentDate: result.PaymentDate ?? '',
    raw:         result,
  }
}

export function verifyCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string
): boolean {
  const received = params.CheckMacValue
  if (!received) return false
  const calculated = generateCheckMacValue(params, hashKey, hashIV)
  const a = Buffer.from(received.toUpperCase())
  const b = Buffer.from(calculated)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
