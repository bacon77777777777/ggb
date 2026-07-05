import * as crypto from 'crypto'

// 綠界物流 CheckMacValue：MD5（與金流 SHA256 不同）
function ecpayLogisticsUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/%21/g, '!')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
}

export function generateLogisticsCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string
): string {
  const sorted = Object.keys(params)
    .filter(k => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(k => `${k}=${params[k]}`)
    .join('&')
  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`
  const encoded = ecpayLogisticsUrlEncode(raw)
  return crypto.createHash('md5').update(encoded).digest('hex').toUpperCase()
}

export function verifyLogisticsCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string
): boolean {
  const received = params.CheckMacValue
  if (!received) return false
  const expected = generateLogisticsCheckMacValue(params, hashKey, hashIV)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(received.toUpperCase()),
      Buffer.from(expected)
    )
  } catch {
    return false
  }
}

function getTaiwanDateString(): string {
  const now = new Date()
  const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${tw.getFullYear()}/${pad(tw.getMonth() + 1)}/${pad(tw.getDate())} ${pad(tw.getHours())}:${pad(tw.getMinutes())}:${pad(tw.getSeconds())}`
}

export interface EcpayLogisticsOrder {
  MerchantTradeNo: string
  LogisticsType: 'CVS' | 'HOME'
  LogisticsSubType: string   // UNIMART/FAMI/HILIFE/FAMIC2C/UNIMARTC2C/HILIFEC2C/OKMARTC2C | TCAT/POST
  GoodsAmount: number
  GoodsName?: string
  SenderName: string
  SenderCellPhone: string
  SenderZipCode?: string
  SenderAddress?: string
  ReceiverName: string
  ReceiverCellPhone: string
  ReceiverStoreID?: string   // CVS 必填
  ReceiverZipCode?: string   // HOME 必填
  ReceiverAddress?: string   // HOME 必填
  ServerReplyURL: string
  ClientReplyURL?: string
}

export function generateLogisticsParams(
  order: EcpayLogisticsOrder,
  merchantID: string,
  hashKey: string,
  hashIV: string
): Record<string, string> {
  const params: Record<string, string> = {
    MerchantID:        merchantID,
    MerchantTradeNo:   order.MerchantTradeNo,
    MerchantTradeDate: getTaiwanDateString(),
    LogisticsType:     order.LogisticsType,
    LogisticsSubType:  order.LogisticsSubType,
    GoodsAmount:       String(Math.max(1, Math.floor(order.GoodsAmount))),
    GoodsName:         (order.GoodsName || 'GachaGO商品').slice(0, 50),
    SenderName:        order.SenderName,
    SenderCellPhone:   order.SenderCellPhone,
    ReceiverName:      order.ReceiverName,
    ReceiverCellPhone: order.ReceiverCellPhone,
    ServerReplyURL:    order.ServerReplyURL,
  }

  if (order.SenderZipCode)  params.SenderZipCode  = order.SenderZipCode
  if (order.SenderAddress)  params.SenderAddress  = order.SenderAddress
  if (order.ClientReplyURL) params.ClientReplyURL = order.ClientReplyURL

  if (order.LogisticsType === 'CVS') {
    params.ReceiverStoreID = order.ReceiverStoreID || ''
    params.IsCollection = 'N'
  } else {
    params.ReceiverZipCode  = order.ReceiverZipCode  || ''
    params.ReceiverAddress  = order.ReceiverAddress  || ''
  }

  params.CheckMacValue = generateLogisticsCheckMacValue(params, hashKey, hashIV)
  return params
}

export function generateMapParams(
  merchantTradeNo: string,
  logisticsSubType: string,
  serverReplyURL: string,
  merchantID: string,
  hashKey: string,
  hashIV: string
): Record<string, string> {
  const params: Record<string, string> = {
    MerchantID:      merchantID,
    MerchantTradeNo: merchantTradeNo,
    LogisticsType:   'CVS',
    LogisticsSubType: logisticsSubType,
    IsCollection:    'N',
    ServerReplyURL:  serverReplyURL,
  }
  params.CheckMacValue = generateLogisticsCheckMacValue(params, hashKey, hashIV)
  return params
}

// 綠界物流 callback 狀態碼 → 我們平台狀態
export function ecpayLogisticsStatusToOrder(rtnCode: string | number): string | null {
  const code = Number(rtnCode)
  if (!Number.isFinite(code)) return null
  // 通用：1 = 建立成功
  if (code === 1) return 'processing'
  // CVS B2C
  if (code === 300) return 'processing'   // 在途中
  if (code === 310) return 'shipping'     // 配達通報（到門市）
  if (code === 3024) return 'delivered'   // 消費者取貨
  if (code === 3006 || code === 3018) return 'cancelled' // 退貨/逾期
  // HOME
  if (code === 3001 || code === 3003) return 'processing' // 已收件/理貨中
  if (code === 3009 || code === 3011) return 'shipping'   // 配達中
  if (code === 3010) return 'delivered'   // 已配達
  if (code === 3020 || code === 3022) return 'cancelled'  // 退件
  // C2C
  if (code === 2030) return 'processing'  // 已收件
  if (code === 2073) return 'shipping'    // 到店待取
  if (code === 2067) return 'delivered'   // 消費者取貨
  return null
}
