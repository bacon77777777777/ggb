'use client'

import { native } from './bridge'

/**
 * 條碼掃描（超商取貨條碼）
 *
 * 只在 App 裡可用。網頁版回 null，呼叫端要顯示「請改用 App 掃描，或手動輸入」，
 * 不要讓按鈕按下去沒反應。
 */
export async function scanBarcode(): Promise<string | null> {
  if (!native.isNativePlatform()) return null

  // Android 的 ML Kit 掃描模組是安裝後才下載的，第一次要先確認裝好了沒
  if (native.nativePlatform() === 'android') {
    const avail = await native.call<{ available?: boolean }>(
      'BarcodeScanner',
      'isGoogleBarcodeScannerModuleAvailable'
    )
    if (avail && avail.available === false) {
      await native.call('BarcodeScanner', 'installGoogleBarcodeScannerModule')
      return null // 安裝是非同步的，請使用者裝好後再掃一次
    }
  }

  const perm = await native.call<{ camera?: string }>('BarcodeScanner', 'requestPermissions')
  if (perm && perm.camera !== 'granted' && perm.camera !== 'limited') return null

  const r = await native.call<{ barcodes?: Array<{ rawValue?: string }> }>('BarcodeScanner', 'scan')
  return r?.barcodes?.[0]?.rawValue ?? null
}
