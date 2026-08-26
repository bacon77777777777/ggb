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

/* ─────────────────────────────────────────────────────────────
 * 列印託運單
 *
 * 綠界沒有「回傳 PDF」的 API，只有幾支**必須用 POST 打過去、回傳一頁 HTML**
 * 的列印頁。所以做法是產生一張自動送出的表單，讓瀏覽器自己 POST 過去。
 *
 * 端點依物流方式不同（超商 C2C 每家一支，B2C 與宅配共用一支），
 * 需要的欄位也不同 —— C2C 要寄件編號與驗證碼，B2C／宅配只要交易編號。
 * ───────────────────────────────────────────────────────────── */

export interface PrintTarget {
  /** 完整的綠界列印網址 */
  url: string
  /** 要 POST 過去的欄位（已含 CheckMacValue） */
  params: Record<string, string>
}

/** C2C 各超商品牌對應的列印端點 */
const C2C_PRINT_PATH: Record<CvsBrand, string> = {
  UNIMART: 'Express/PrintUnimartC2CBill',
  FAMI:    'Express/PrintFAMIC2CBill',
  HILIFE:  'Express/PrintHILIFEC2CBill',
  OKMART:  'Express/PrintOKMARTC2CBill',
}

/**
 * @param logisticsSubType  我們自己存的代號（UNIMART／FAMI／TCAT…），不是綠界代號
 * @param ids               建立物流單時綠界回的三個編號
 */
export function generatePrintTarget(
  logisticsSubType: string,
  ids: { logisticsId?: string | null; cvsPaymentNo?: string | null; cvsValidationNo?: string | null },
  merchantID: string,
  hashKey: string,
  hashIV: string,
  apiUrl: string,
): PrintTarget {
  // 從 Create 的網址推出網域，才不會 stage 與正式各寫一份
  const origin = new URL(apiUrl).origin

  const ecpaySubType = toEcpayCvsSubType(logisticsSubType)
  const brand = cvsBrandOf(logisticsSubType)
  const isC2C = brand !== null && ecpaySubType.endsWith('C2C')

  if (!ids.logisticsId) {
    throw new Error('缺少綠界物流交易編號（AllPayLogisticsID），請重新生成配送單')
  }

  let url: string
  const params: Record<string, string> = {
    MerchantID:        merchantID,
    AllPayLogisticsID: String(ids.logisticsId),
  }

  if (isC2C && brand) {
    if (!ids.cvsPaymentNo) {
      throw new Error('缺少超商寄件編號（CVSPaymentNo），請重新生成配送單')
    }
    url = `${origin}/${C2C_PRINT_PATH[brand]}`
    params.CVSPaymentNo = String(ids.cvsPaymentNo)
    // 只有統一超商需要驗證碼，其餘三家送空字串
    params.CVSValidationNo = brand === 'UNIMART' ? String(ids.cvsValidationNo ?? '') : ''
    if (brand === 'UNIMART' && !ids.cvsValidationNo) {
      throw new Error('缺少統一超商驗證碼（CVSValidationNo），請重新生成配送單')
    }
  } else {
    // B2C 與宅配共用這一支，只要交易編號
    url = `${origin}/helper/printTradeDocument`
  }

  params.CheckMacValue = generateLogisticsCheckMacValue(params, hashKey, hashIV)
  return { url, params }
}

/* ─────────────────────────────────────────────────────────────
 * 作廢託運單（超商 C2C）
 *
 * 取消訂單時，綠界那張託運單如果不作廢會一直掛在對方後台。
 * 實務損失不大（C2C 是交寄時才計費，沒寄出不會扣錢），但單子堆著遲早對不上帳。
 *
 * ⚠️ 這支跟本檔其他 API 是**兩套不同的協定**：
 *   舊的（建單、地圖、列印）—— form-urlencoded ＋ MD5 CheckMacValue
 *   這支（v2 取消）      —— JSON ＋ AES-128-CBC 加密的 Data 欄位，沒有 CheckMacValue
 * 別把兩邊的簽章方式搞混。
 *
 * 加密規格（綠界「參數加密方式說明」）：
 *   加密：JSON → URLEncode → AES-128-CBC/PKCS7（key=HashKey, iv=HashIV）→ Base64
 *   解密：Base64 → AES 解密 → URLDecode → JSON
 *
 * 只支援**超商 C2C**。B2C 與宅配綠界沒有開放取消 API，要走客服。
 * ───────────────────────────────────────────────────────────── */

/** 綠界 v2 的 Data 欄位加密 */
export function encryptEcpayV2(payload: unknown, hashKey: string, hashIV: string): string {
  const plain = encodeURIComponent(JSON.stringify(payload))
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(hashKey), Buffer.from(hashIV))
  cipher.setAutoPadding(true)  // PKCS7
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64')
}

/** 綠界 v2 的 Data 欄位解密 */
export function decryptEcpayV2<T = any>(data: string, hashKey: string, hashIV: string): T {
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(hashKey), Buffer.from(hashIV))
  decipher.setAutoPadding(true)
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  return JSON.parse(decodeURIComponent(plain))
}

/** 這張單能不能用 API 作廢 —— 只有超商 C2C 可以，而且三個編號都要在 */
export function canVoidLogistics(order: {
  logistics_type?: string | null
  logistics_subtype?: string | null
  ecpay_logistics_id?: string | null
  cvs_payment_no?: string | null
  cvs_validation_no?: string | null
}): boolean {
  if (order.logistics_type !== 'CVS') return false
  // C2C 才有寄貨編號與驗證碼；B2C 這兩欄是空的
  return !!(order.ecpay_logistics_id && order.cvs_payment_no && order.cvs_validation_no)
}

export interface VoidResult {
  ok: boolean
  /** 沒打（不支援或缺欄位）時為 true —— 不算失敗 */
  skipped?: boolean
  code?: string
  message: string
}

export async function voidC2COrder(
  order: {
    logistics_type?: string | null
    logistics_subtype?: string | null
    ecpay_logistics_id?: string | null
    cvs_payment_no?: string | null
    cvs_validation_no?: string | null
  },
  merchantID: string,
  hashKey: string,
  hashIV: string,
  apiUrl: string,
): Promise<VoidResult> {
  if (!canVoidLogistics(order)) {
    return { ok: false, skipped: true, message: '非超商 C2C 或缺少寄貨編號，綠界沒有對應的作廢 API' }
  }

  // 從既有的 API 網址推出 origin，測試／正式環境跟著走
  const origin = new URL(apiUrl).origin
  const endpoint = `${origin}/Express/v2/CancelC2COrder`

  const body = {
    MerchantID: merchantID,
    RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
    Data: encryptEcpayV2({
      MerchantID:      merchantID,
      LogisticsID:     order.ecpay_logistics_id,
      CVSPaymentNo:    order.cvs_payment_no,
      CVSValidationNo: order.cvs_validation_no,
    }, hashKey, hashIV),
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // 綠界慢的時候不要把整個取消流程拖住
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { ok: false, message: `綠界回應 HTTP ${res.status}` }

    const json = await res.json() as { TransCode?: number; TransMsg?: string; Data?: string }
    if (json.TransCode !== 1) {
      return { ok: false, code: String(json.TransCode), message: json.TransMsg || '傳輸失敗' }
    }

    const inner = decryptEcpayV2<{ RtnCode?: number; RtnMsg?: string }>(json.Data ?? '', hashKey, hashIV)
    return inner.RtnCode === 1
      ? { ok: true, code: '1', message: inner.RtnMsg || '已作廢' }
      : { ok: false, code: String(inner.RtnCode), message: inner.RtnMsg || '作廢失敗' }
  } catch (err: any) {
    return { ok: false, message: err?.message || '呼叫綠界失敗' }
  }
}
