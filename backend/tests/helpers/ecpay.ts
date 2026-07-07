import { generateCheckMacValue } from '@/lib/ecpay'

const TEST_HASH_KEY = process.env.ECPAY_HASH_KEY ?? '5294y06JbISpM5x9'
const TEST_HASH_IV  = process.env.ECPAY_HASH_IV  ?? 'v77hoKGq4kWxNNIS'

export interface EcpayCallbackParams {
  MerchantID?: string
  MerchantTradeNo: string
  TradeNo?: string
  TradeAmt?: string
  PaymentType?: string
  RtnCode?: string
  RtnMsg?: string
}

/**
 * 產生一組帶有正確 CheckMacValue 的 ECPay callback FormData
 */
export function makeEcpayCallback(overrides: EcpayCallbackParams = { MerchantTradeNo: 'TP20260101001' }): FormData {
  const params: Record<string, string> = {
    MerchantID:      overrides.MerchantID      ?? '2000132',
    MerchantTradeNo: overrides.MerchantTradeNo,
    TradeNo:         overrides.TradeNo          ?? 'ECPAY' + Date.now(),
    TradeAmt:        overrides.TradeAmt         ?? '100',
    PaymentType:     overrides.PaymentType      ?? 'Credit_CreditCard',
    RtnCode:         overrides.RtnCode          ?? '1',
    RtnMsg:          overrides.RtnMsg           ?? '交易成功',
    TradeDate:       '2026/01/01 00:00:00',
    SimulatePaid:    '0',
  }
  params.CheckMacValue = generateCheckMacValue(params, TEST_HASH_KEY, TEST_HASH_IV)

  const fd = new FormData()
  for (const [k, v] of Object.entries(params)) fd.append(k, v)
  return fd
}

/**
 * 產生一組 CheckMacValue 故意錯誤的 FormData（測試驗簽失敗）
 */
export function makeInvalidEcpayCallback(): FormData {
  const fd = makeEcpayCallback()
  fd.set('CheckMacValue', 'INVALID000000000000000000000000000000000000000000000000000000000000')
  return fd
}
