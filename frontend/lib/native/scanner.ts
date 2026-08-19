'use client'

import { native } from './bridge'

/**
 * 條碼掃描（超商取貨條碼）
 *
 * 用官方的 @capacitor/barcode-scanner。
 * 原本選的 @capacitor-mlkit/barcode-scanning **不支援 SPM**，而 Capacitor 8 的
 * iOS 專案預設就是 SPM —— `cap sync` 會靜默把它從 Package.swift 排除掉，
 * 外掛看起來裝好了、實際上 iOS 端根本沒編進去。
 *
 * 只在 App 裡可用。網頁版回 null，呼叫端要顯示「請改用 App 掃描，或手動輸入」，
 * 不要讓按鈕按下去沒反應。
 */

/** CapacitorBarcodeScannerTypeHintALLOption.ALL —— 不限條碼類型 */
const HINT_ALL = 17

export async function scanBarcode(): Promise<string | null> {
  if (!native.isNativePlatform()) return null

  const r = await native.call<{ ScanResult?: string }>('CapacitorBarcodeScanner', 'scanBarcode', {
    hint: HINT_ALL,
    scanInstructions: '把超商取貨條碼對準框內',
    scanText: '掃描條碼',
    cameraDirection: 1, // BACK
    scanOrientation: 1, // PORTRAIT
    cancelButtonAccessibilityLabel: '取消掃描',
  })

  // 使用者按取消時外掛會 throw，被 bridge 接住轉成 null
  return r?.ScanResult ?? null
}
