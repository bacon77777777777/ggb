// Auth error codes and Chinese translations
// Format: [AXXX] description

const ERROR_MAP: Array<{ match: RegExp | string; code: string; msg: string }> = [
  // 登入
  { match: /invalid login credentials/i,      code: 'A001', msg: '帳號或密碼不正確' },
  { match: /invalid credentials/i,            code: 'A001', msg: '帳號或密碼不正確' },
  { match: /email not confirmed/i,            code: 'A002', msg: '電子郵件尚未驗證，請先完成驗證流程' },
  { match: /user not found/i,                 code: 'A003', msg: '找不到此帳號，請確認信箱是否正確' },
  { match: /already registered/i,             code: 'A004', msg: '此信箱已被註冊，請直接登入' },
  { match: /user already exists/i,            code: 'A004', msg: '此信箱已被註冊，請直接登入' },
  // OTP / 驗證碼
  { match: /token has expired/i,              code: 'A011', msg: '驗證碼已過期，請重新取得' },
  { match: /invalid token/i,                  code: 'A012', msg: '驗證碼無效，請確認後重試' },
  { match: /otp/i,                            code: 'A013', msg: '驗證碼錯誤或已過期，請重新取得' },
  // 密碼
  { match: /password should be at least/i,    code: 'A021', msg: '密碼長度至少需 6 個字元' },
  { match: /password should be/i,             code: 'A021', msg: '密碼格式不符要求（至少 6 個字元）' },
  { match: /new password should be different/i, code: 'A022', msg: '新密碼不能與舊密碼相同' },
  { match: /same password/i,                  code: 'A022', msg: '新密碼不能與舊密碼相同' },
  // 頻率限制
  { match: /too many requests/i,              code: 'A031', msg: '嘗試次數過多，請稍後再試' },
  { match: /rate limit/i,                     code: 'A031', msg: '請求過於頻繁，請稍後再試' },
  { match: /email rate limit/i,               code: 'A032', msg: '發送次數已達上限，請稍後再試' },
  // 網路 / 系統
  { match: /network/i,                        code: 'A091', msg: '網路連線錯誤，請稍後再試' },
  { match: /fetch/i,                          code: 'A091', msg: '網路連線錯誤，請稍後再試' },
]

export function translateAuthError(raw?: string | null): string {
  if (!raw) return '[A099] 發生未知錯誤，請稍後再試'
  for (const { match, code, msg } of ERROR_MAP) {
    const hit = typeof match === 'string' ? raw.includes(match) : match.test(raw)
    if (hit) return `[${code}] ${msg}`
  }
  // fallback: return original wrapped in code
  return `[A099] ${raw}`
}
