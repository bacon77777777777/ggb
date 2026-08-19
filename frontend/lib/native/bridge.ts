'use client'

/**
 * 原生能力橋接層
 *
 * 為什麼用 `window.Capacitor.Plugins` 而不是 npm import：
 * App 走 remote URL 模式（webview 直接載入 www.ggb.com.tw），原生殼在
 * `mobile/` 是獨立的 package。Capacitor 會把 `window.Capacitor` 注入到 webview，
 * 所以網頁端只要讀那個全域就好 —— 前台的 bundle 不必背 Capacitor 的相依，
 * 一般瀏覽器也完全不受影響。
 *
 * 每支包裝都遵守同一個原則：**不在 App 裡就安靜地回退**。
 * 網頁版按下「分享」要走 Web Share API，按下「掃碼」要看得到提示，
 * 不能整個壞掉或跳錯誤。
 */

type PluginCall = (...args: unknown[]) => Promise<unknown>
type CapacitorGlobal = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: Record<string, Record<string, PluginCall> | undefined>
}

function cap(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

export function isNativePlatform(): boolean {
  return cap()?.isNativePlatform?.() === true
}

/** 'ios' | 'android' | 'web' */
export function nativePlatform(): string {
  return cap()?.getPlatform?.() ?? 'web'
}

function plugin(name: string): Record<string, PluginCall> | undefined {
  return cap()?.Plugins?.[name]
}

/** 呼叫外掛；沒有原生殼、外掛沒裝、或呼叫失敗，一律回 null 由呼叫端決定退路 */
async function call<T>(pluginName: string, method: string, options?: unknown): Promise<T | null> {
  const p = plugin(pluginName)
  const fn = p?.[method]
  if (typeof fn !== 'function') return null
  try {
    return (await fn(options ?? {})) as T
  } catch (err) {
    console.warn(`[native] ${pluginName}.${method} 失敗`, err)
    return null
  }
}

export const native = { isNativePlatform, nativePlatform, call, plugin }
