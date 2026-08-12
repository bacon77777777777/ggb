/**
 * 綠界各支付方式的手續費 —— 單一事實來源
 *
 * 以前費率寫在兩個地方：callback 裡的 `calcEcpayFee()` 負責算出實際金額寫進
 * `recharge_records.payment_fee`，後台 `/recharges` 的「費率定義」欄位另外
 * 手寫一份字串給人看。兩份各自演化就漂了 —— 台灣 Pay QR 表上寫 1%，
 * 但 calc 沒有對應分支、掉進信用卡那條，實際存的是 2.75%+1，
 * 帳面手續費會比綠界實際帳單高。
 *
 * 所以算的跟顯示的都從這裡出，改費率只改一個地方。
 *
 * ⚠️ 費率是跟綠界談的商業條件，不是程式邏輯。調整前請對照合約，
 * 改完記得回頭看 `/reports/settlement` 的估算費率（那是另一套，用在
 * 撈不到實際 payment_fee 時的 fallback）。
 */

export type EcpayFeeKey = 'credit_card' | 'webatm' | 'vacc' | 'cvs' | 'barcode' | 'twqr'

interface EcpayFeeRule {
  /** 後台顯示用的名稱 */
  name: string
  /** 後台「費率定義」欄位顯示的文字 */
  formula: string
  /** 實際金額計算（回傳整數元） */
  calc: (amount: number) => number
}

export const ECPAY_FEE_RULES: Record<EcpayFeeKey, EcpayFeeRule> = {
  // 信用卡與其衍生（Apple Pay／Google Pay／銀聯經綠界都回 Credit_CreditCard）
  credit_card: {
    name: '信用卡 / 簽帳金融卡',
    formula: '2.75%+NT$1',
    calc: (a) => Math.round(a * 0.0275) + 1,
  },
  webatm: {
    name: '網路 ATM',
    formula: '1% max NT$15',
    calc: (a) => Math.min(Math.round(a * 0.01), 15),
  },
  vacc: {
    name: 'ATM 虛擬帳號',
    formula: '1% max NT$15',
    calc: (a) => Math.min(Math.round(a * 0.01), 15),
  },
  cvs: {
    name: '超商代碼',
    formula: 'NT$31/筆',
    calc: () => 31,
  },
  barcode: {
    name: '超商條碼',
    formula: 'NT$16/筆',
    calc: () => 16,
  },
  twqr: {
    name: '台灣 Pay QR',
    formula: '1%',
    calc: (a) => Math.round(a * 0.01),
  },
}

/**
 * 綠界回傳的 `PaymentType` → 費率 key
 *
 * 實際會收到的字串長這樣：`Credit_CreditCard`、`WebATM_TAISHIN`、
 * `ATM_TAISHIN`、`CVS_CVS`、`BARCODE_BARCODE`、`TWQR_TWQR`。
 * 認不出來的一律當信用卡 —— 綠界的即時付款絕大多數是信用卡衍生，
 * 少算比多算安全（多算會讓帳面成本虛高、廠商分潤被壓低）。
 */
export function ecpayFeeKey(paymentType: string): EcpayFeeKey {
  const t = String(paymentType || '').toUpperCase()
  if (t.startsWith('TWQR')) return 'twqr'
  if (t.startsWith('WEBATM')) return 'webatm'
  if (t.startsWith('ATM')) return 'vacc'
  if (t.startsWith('CVS')) return 'cvs'
  if (t.startsWith('BARCODE')) return 'barcode'
  return 'credit_card'
}

/** 依綠界 `PaymentType` 與金額算出這一筆的手續費（整數元） */
export function calcEcpayFee(paymentType: string, amount: number): number {
  return ECPAY_FEE_RULES[ecpayFeeKey(paymentType)].calc(amount)
}
