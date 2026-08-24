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
    GoodsName:         (order.GoodsName || 'GGB吉吉比商品').slice(0, 50),
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

/**
 * 超商代號的 B2C／C2C 兩套寫法（UNIMART vs UNIMARTC2C）
 *
 * 一組廠商編號只會開通其中一套，送錯那套綠界會回
 * 「找不到加密金鑰，請確認是否有申請開通此物流方式!」——
 * 2026-08-24 老闆在 App 點「選擇取貨門市」看到的白畫面就是這句：
 * 前台送的是 B2C 的 `UNIMART`，而 env 裡的是綠界 C2C 測試帳號（2000933）。
 *
 * 所以站內（前台 state、orders.logistics_subtype）一律只存**品牌代號**
 * UNIMART / FAMI / HILIFE，要送去綠界前才在這裡補後綴。
 * 之後申請到正式合約，是 B2C 就把 `ECPAY_LOGISTICS_MODE=B2C` 設上去，
 * DB 與前台都不用動。宅配（TCAT／POST）不經過轉換，原樣送出。
 */
const CVS_BRANDS = ['UNIMART', 'FAMI', 'HILIFE', 'OKMART'] as const
export type CvsBrand = (typeof CVS_BRANDS)[number]

/** 綠界回來的 `UNIMARTC2C` → 站內的 `UNIMART`；不是超商代號就回 null */
export function cvsBrandOf(subType: string): CvsBrand | null {
  const upper = (subType || '').trim().toUpperCase()
  const brand = upper.endsWith('C2C') ? upper.slice(0, -3) : upper
  return (CVS_BRANDS as readonly string[]).includes(brand) ? (brand as CvsBrand) : null
}

/** 站內的 `UNIMART` → 送給綠界的 `UNIMARTC2C`（或 B2C 模式下維持 `UNIMART`） */
export function toEcpayCvsSubType(subType: string): string {
  const brand = cvsBrandOf(subType)
  if (!brand) return subType    // TCAT／POST 等宅配代號原樣送出
  // OK超商只有店到店（C2C），沒有 B2C 版本
  const b2c = (process.env.ECPAY_LOGISTICS_MODE || 'C2C').toUpperCase() === 'B2C'
  return b2c && brand !== 'OKMART' ? brand : `${brand}C2C`
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
