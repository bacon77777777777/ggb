'use client'

import { native } from './bridge'

/**
 * 推播註冊（Firebase Cloud Messaging）
 *
 * 流程：要權限 → 拿 FCM token → 送到後端存進 device_tokens。
 * 兩個平台拿到的都是 FCM token，後端因此只有一條發送路徑
 * （見 backend/lib/push.ts）。
 *
 * 只在 App 裡動作。網頁版直接回 'unsupported' —— 網頁推播是另一套
 * （VAPID + service worker），要做再說，不要混在同一支裡假裝支援。
 */

export type PushRegisterResult = 'registered' | 'denied' | 'unsupported' | 'failed'

export async function registerPush(): Promise<PushRegisterResult> {
  if (!native.isNativePlatform()) return 'unsupported'

  const perm = await native.call<{ receive?: string }>('FirebaseMessaging', 'requestPermissions')
  if (!perm) return 'unsupported'
  if (perm.receive !== 'granted') return 'denied'

  const res = await native.call<{ token?: string }>('FirebaseMessaging', 'getToken')
  const token = res?.token
  if (!token) return 'failed'

  return (await sendTokenToServer(token)) ? 'registered' : 'failed'
}

async function sendTokenToServer(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/user/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: native.nativePlatform() }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 掛上兩個監聽器：
 *   tokenReceived —— FCM 會不定期換發 token，換了沒回報就從此推不到那台
 *   notificationActionPerformed —— 使用者點開通知，帶 link 就導過去
 *
 * 回傳解除註冊用的函式。
 */
export function attachPushListeners(onNavigate: (path: string) => void): () => void {
  if (!native.isNativePlatform()) return () => {}

  native.call('FirebaseMessaging', 'addListener', {
    eventName: 'tokenReceived',
  })

  const plugin = native.plugin('FirebaseMessaging')
  if (!plugin || typeof plugin.addListener !== 'function') return () => {}

  const handles: Array<{ remove?: () => void }> = []

  try {
    const add = plugin.addListener as unknown as (
      event: string,
      cb: (payload: unknown) => void
    ) => { remove?: () => void }

    handles.push(
      add('tokenReceived', (payload) => {
        const t = (payload as { token?: string })?.token
        if (t) void sendTokenToServer(t)
      })
    )

    handles.push(
      add('notificationActionPerformed', (payload) => {
        const link = (payload as { notification?: { data?: { link?: string } } })?.notification?.data
          ?.link
        // 只接受站內相對路徑：通知內容若被竄改，不該把使用者導去外站
        if (link && link.startsWith('/')) onNavigate(link)
      })
    )
  } catch (err) {
    console.warn('[push] 監聽器掛載失敗', err)
  }

  return () => handles.forEach((h) => h.remove?.())
}
