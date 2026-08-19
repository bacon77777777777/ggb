'use client'

import { native } from './bridge'

/**
 * 開啟外部網址
 *
 * App 裡不能讓外部網站在主 webview 開 —— 那沒有網址列也沒有返回鍵，
 * 使用者會被困在一個白畫面裡出不來（Apple 也不喜歡這種）。
 * 一律走 in-app browser：iOS 是 SFSafariViewController、Android 是 Custom Tabs，
 * 兩者都自帶關閉鍵與網址列。
 *
 * 網頁版就是正常開新分頁。
 */
export async function openExternal(url: string): Promise<void> {
  if (native.isNativePlatform()) {
    const r = await native.call('Browser', 'open', { url, presentationStyle: 'popover' })
    if (r !== null) return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * 開啟付款頁，並在使用者關閉時回呼。
 *
 * 入帳靠的是綠界打到後端的 server-to-server callback（ReturnURL），
 * 跟使用者在哪個瀏覽器無關 —— 所以這裡不需要知道「付成功了沒」，
 * 只要知道「他回來了」，然後重新讀一次餘額即可。
 */
export async function openPayment(url: string, onClosed: () => void): Promise<boolean> {
  if (!native.isNativePlatform()) return false

  const plugin = native.plugin('Browser')
  if (!plugin || typeof plugin.addListener !== 'function') return false

  try {
    const add = plugin.addListener as unknown as (
      event: string,
      cb: () => void
    ) => { remove?: () => void }

    const handle = add('browserFinished', () => {
      handle.remove?.()
      onClosed()
    })

    const opened = await native.call('Browser', 'open', { url, presentationStyle: 'fullscreen' })
    if (opened === null) {
      handle.remove?.()
      return false
    }
    return true
  } catch (err) {
    console.warn('[payment] in-app browser 開啟失敗', err)
    return false
  }
}
