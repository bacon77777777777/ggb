/**
 * 站內連結判定 —— PWA 防彈窗用
 *
 * 後台輸入的連結（輪播圖、活動頁 CTA 等）可能是相對路徑，也可能是完整網址。
 * 若一律用 <a target="_blank">，PWA（加到主畫面）會把使用者踢出去開系統瀏覽器，
 * 等於離開 App。故站內連結一律改用 next/link 做前端換頁，只有真正的站外連結才開新分頁。
 *
 * 網域判定除了固定白名單，另外把「目前所在網域」也視為站內，
 * 這樣 localhost、Vercel 預覽站、未來換域名都不必改碼。
 */
const INTERNAL_HOSTS = ['www.ggb.com.tw', 'ggb.com.tw', 'staging.ggb.com.tw']

export function isInternalUrl(url: string): boolean {
  if (!url || url === '#') return true
  if (url.startsWith('/')) return true
  // 錨點、query-only 連結也留在站內
  if (url.startsWith('#') || url.startsWith('?')) return true
  try {
    const host = new URL(url, typeof window !== 'undefined' ? window.location.href : 'https://www.ggb.com.tw').hostname
    if (INTERNAL_HOSTS.includes(host)) return true
    if (typeof window !== 'undefined' && host === window.location.hostname) return true
    return false
  } catch {
    return false
  }
}

/** 把站內的完整網址轉成路徑，供 next/link 使用 */
export function toInternalPath(url: string): string {
  if (!url) return '#'
  if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?')) return url
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'https://www.ggb.com.tw')
    return u.pathname + u.search + u.hash
  } catch {
    return url
  }
}
