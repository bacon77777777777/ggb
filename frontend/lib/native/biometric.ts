'use client'

import { native } from './bridge'

/**
 * 生物辨識登入（Face ID / Touch ID / Android 指紋）
 *
 * 定位要講清楚：這**不是**另一套身分驗證，只是「本機解鎖」。
 * 真正的登入狀態仍然是 Supabase 的 session；生物辨識通過只是讓使用者
 * 不必重打密碼。所以它絕不能被用來取代伺服器端的權限檢查。
 */

export type BiometryAvailability = { available: boolean; type: string }

export async function checkBiometry(): Promise<BiometryAvailability> {
  const r = await native.call<{ isAvailable?: boolean; biometryType?: number | string }>(
    'BiometricAuth',
    'checkBiometry'
  )
  if (!r) return { available: false, type: 'none' }
  return {
    available: r.isAvailable === true,
    type: String(r.biometryType ?? 'unknown'),
  }
}

/** 通過回 true。使用者取消、驗證失敗、或不在 App 裡都回 false。 */
export async function authenticateBiometric(reason = '驗證後即可登入吉吉比'): Promise<boolean> {
  if (!native.isNativePlatform()) return false
  const r = await native.call('BiometricAuth', 'authenticate', {
    reason,
    cancelTitle: '取消',
    allowDeviceCredential: true,
    iosFallbackTitle: '改用密碼',
    androidTitle: '生物辨識登入',
    androidSubtitle: '吉吉比',
  })
  // 外掛驗證失敗會 throw，被 bridge 接住轉成 null
  return r !== null
}
