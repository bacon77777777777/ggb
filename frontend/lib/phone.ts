/** 台灣手機號碼正規化
 *  接受 0900123456 / 900123456 / 886900123456 / +886900123456
 *  統一輸出 09XXXXXXXX（10位）
 */
export const normalizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('886') && digits.length === 12) return '0' + digits.slice(3)
  if (digits.startsWith('0886') && digits.length === 13) return '0' + digits.slice(4)
  if (digits.startsWith('9') && digits.length === 9) return '0' + digits
  return digits
}

/** 驗證台灣手機號碼格式：09 開頭、共 10 位數 */
export const isValidPhone = (value: string): boolean =>
  /^09\d{8}$/.test(value.trim())

export const PHONE_PLACEHOLDER = '例：0900123456'
export const PHONE_PATTERN = '^09\\d{8}$'
export const PHONE_ERROR = '請輸入 09 開頭的 10 位手機號碼'
