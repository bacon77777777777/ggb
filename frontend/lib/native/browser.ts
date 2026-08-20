'use client'

import { native } from './bridge'

/**
 * Capacitor 的 Browser.open 只吃**絕對網址**，給相對路徑會直接失敗。
 * 這個坑踩過一次：儲值的交接頁傳了 `/payment/go?t=…`，開啟失敗後掉進退路
 * 用 form.submit() 導去綠界，而 Capacitor 把站外網址丟給 Safari 時是 GET ——
 * POST 的參數整包不見，綠界回 MobileErrorHandle。
 * 統一在這裡補齊，呼叫端就不必記得。
 */
function toAbsolute(url: string): string {
  try {
    return new URL(url, typeof window !== 'undefined' ? window.location.href : undefined).href
  } catch {
    return url
  }
}

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
    const r = await native.call('Browser', 'open', { url: toAbsolute(url), presentationStyle: 'popover' })
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
    /*
     * addListener 回傳的是一個 Promise，但 Capacitor 也在它身上掛了 `.remove`
     * （見 @capacitor/core 的 addListenerNative），所以直接取用是可行的。
     */
    const add = plugin.addListener as unknown as (
      event: string,
      cb: () => void
    ) => { remove?: () => void }

    const handle = add('browserFinished', () => {
      handle.remove?.()
      onClosed()
    })

    // popover（iOS 的 pageSheet）：付款頁像一張卡從底部滑上來、App 還看得到
    // 在後面，頂上有「完成」隨時關得掉 —— 老闆要的「彈窗方式」（2026-08-20）
    const opened = await native.call('Browser', 'open', { url: toAbsolute(url), presentationStyle: 'popover' })
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


/**
 * 關掉 in-app browser。
 *
 * LINE 登入用得到：授權完成後我們是靠輪詢拿到票的，
 * 這時瀏覽器還停在回呼頁，要主動收掉玩家才會「自動回到 App」。
 * 不在 App 裡、或外掛不在，就是 no-op。
 */
export async function closeInAppBrowser(): Promise<void> {
  if (!native.isNativePlatform()) return
  await native.call('Browser', 'close')
}

/**
 * 在 in-app browser 開一個網址，不等它關閉。
 *
 * 跟 openExternal 的差別：這支保證走 in-app browser（回得來、關得掉），
 * 不會退回 window.open。給 OAuth 這種「開出去、我自己輪詢結果」的流程用。
 */
export async function openInAppBrowser(url: string): Promise<boolean> {
  if (!native.isNativePlatform()) return false
  const r = await native.call('Browser', 'open', { url: toAbsolute(url), presentationStyle: 'popover' })
  return r !== null
}
