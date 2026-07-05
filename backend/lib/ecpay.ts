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
