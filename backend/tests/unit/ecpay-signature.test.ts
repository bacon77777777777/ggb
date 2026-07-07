import { describe, it, expect } from 'vitest'
import { generateCheckMacValue, verifyCheckMacValue } from '@/lib/ecpay'

// ECPay 官方測試 Hash 組
const KEY = '5294y06JbISpM5x9'
const IV  = 'v77hoKGq4kWxNNIS'

const BASE_PARAMS = {
  MerchantID:      '2000132',
  MerchantTradeNo: 'TP20260101001',
  TradeAmt:        '100',
  PaymentType:     'Credit_CreditCard',
  RtnCode:         '1',
  RtnMsg:          '交易成功',
  TradeDate:       '2026/01/01 00:00:00',
}

describe('generateCheckMacValue', () => {
  it('is deterministic for same input', () => {
    const a = generateCheckMacValue(BASE_PARAMS, KEY, IV)
    const b = generateCheckMacValue(BASE_PARAMS, KEY, IV)
    expect(a).toBe(b)
  })

  it('output is 64-char uppercase hex', () => {
    const mac = generateCheckMacValue(BASE_PARAMS, KEY, IV)
    expect(mac).toMatch(/^[0-9A-F]{64}$/)
  })

  it('different params produce different MAC', () => {
    const a = generateCheckMacValue({ ...BASE_PARAMS, TradeAmt: '100' }, KEY, IV)
    const b = generateCheckMacValue({ ...BASE_PARAMS, TradeAmt: '200' }, KEY, IV)
    expect(a).not.toBe(b)
  })

  it('CheckMacValue field is excluded from calculation', () => {
    const mac = generateCheckMacValue(BASE_PARAMS, KEY, IV)
    const withMac = generateCheckMacValue({ ...BASE_PARAMS, CheckMacValue: 'SOMETHINGELSE' }, KEY, IV)
    expect(mac).toBe(withMac)
  })
})

describe('verifyCheckMacValue', () => {
  it('verifies a freshly generated MAC', () => {
    const mac = generateCheckMacValue(BASE_PARAMS, KEY, IV)
    expect(verifyCheckMacValue({ ...BASE_PARAMS, CheckMacValue: mac }, KEY, IV)).toBe(true)
  })

  it('rejects tampered amount', () => {
    const mac = generateCheckMacValue(BASE_PARAMS, KEY, IV)
    expect(verifyCheckMacValue(
      { ...BASE_PARAMS, TradeAmt: '9999', CheckMacValue: mac },
      KEY, IV
    )).toBe(false)
  })

  it('rejects wrong key', () => {
    const mac = generateCheckMacValue(BASE_PARAMS, KEY, IV)
    expect(verifyCheckMacValue({ ...BASE_PARAMS, CheckMacValue: mac }, 'wrong-key', IV)).toBe(false)
  })

  it('rejects missing CheckMacValue', () => {
    expect(verifyCheckMacValue(BASE_PARAMS, KEY, IV)).toBe(false)
  })

  it('is case-insensitive for the received MAC', () => {
    const mac = generateCheckMacValue(BASE_PARAMS, KEY, IV)
    expect(verifyCheckMacValue({ ...BASE_PARAMS, CheckMacValue: mac.toLowerCase() }, KEY, IV)).toBe(true)
  })
})
