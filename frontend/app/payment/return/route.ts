/**
 * 付款回程的落地頁
 *
 * 綠界付款結束後（不管是付完、取號、失敗，還是按了「返回商店」），瀏覽器會被
 * 導到這裡，再由這裡決定下一步。
 *
 * 為什麼要多這一站：App 裡的付款是開在 in-app browser 的，那邊**沒有 webview
 * 的登入 cookie**。直接把玩家導去 `/profile?tab=topup-history` 只會看到「請先
 * 登入」——錢入帳了、畫面卻在叫他登入（老闆回報「儲值完最後一步跑到那一個
 * 未登錄頁面」）。所以先在這裡看一眼交接頁種的 `ggb_pay_app` 標記：
 *
 *   有標記（從 App 出發）→ 導回 `ggbapp://`，人回到 App，餘額由 App 自己重讀
 *   沒有標記（一般網頁）→ 直接 302 去原本的目的地，體驗完全不變
 *
 * 用 route handler 不用 page：page 會被 `app/layout.tsx` 包上 Navbar 與底部
 * 導航，在綠界的網址列底下再長一條自家的導航列很怪，而且這一站只是中繼，
 * 不該等 React 載入才動作。
 */

export const dynamic = 'force-dynamic'

const COOKIE = 'ggb_pay_app'
const APP_SCHEME = 'ggbapp://payment-return'

/** 只接受站內相對路徑，擋掉被拿來當跳板導去外站（open redirect） */
function safePath(raw: string | null): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function GET(req: Request) {
  const url = new URL(req.url)
  const to = safePath(url.searchParams.get('to'))
  const fromApp = (req.headers.get('cookie') || '').includes(`${COOKIE}=1`)

  if (!fromApp) {
    return Response.redirect(new URL(to, url.origin), 302)
  }

  const back = `${APP_SCHEME}?to=${encodeURIComponent(to)}`

  /*
   * 自動導向可能被 Safari 擋掉（沒有使用者手勢），所以畫面上同時放一顆按鈕當出路。
   * 標記在這裡就清掉：這趟已經處理完，留著會讓之後在同一個瀏覽器開的頁面誤判。
   */
  return new Response(
    `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>回到吉吉比</title></head>` +
      `<body style="margin:0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;` +
      `align-items:center;justify-content:center;padding:32px;box-sizing:border-box;background:#fff">` +
      `<div style="text-align:center;max-width:22rem;width:100%">` +
      `<p style="font-size:15px;color:#404040;margin:0 0 4px;font-weight:800">付款流程已結束</p>` +
      `<p style="font-size:13px;color:#a3a3a3;line-height:1.7;margin:0 0 24px">` +
      `正在帶你回到吉吉比，代幣入帳後會直接顯示在餘額裡。</p>` +
      `<a href="${esc(back)}" style="display:flex;height:48px;align-items:center;justify-content:center;` +
      `border-radius:12px;background:#ff4d2d;color:#fff;font-size:15px;font-weight:900;text-decoration:none">` +
      `回到吉吉比</a>` +
      `<p style="margin:12px 0 0;font-size:12.5px;color:#a3a3a3">沒有自動跳回的話，按上面這顆</p>` +
      `</div>` +
      `<script>document.cookie='${COOKIE}=; path=/; max-age=0; samesite=lax';` +
      // 延遲一拍：導向被擋掉時，玩家至少先看得到「付款流程已結束」
      `setTimeout(function(){location.href=${JSON.stringify(back)}},600);</script>` +
      `</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )
}

/** 綠界某些付款方式會用 POST 把玩家送回來，行為跟 GET 一樣 */
export async function POST(req: Request) {
  return GET(req)
}
