import { verifyHandoff } from '@/lib/paymentHandoff'

/**
 * 金流交接頁：驗簽後自動把表單送去綠界。
 *
 * 這頁只會在 App 的 in-app browser 裡被開啟（見 lib/paymentHandoff.ts）。
 * 它不需要登入 —— in-app browser 拿不到 webview 的 cookie，
 * 授權完全靠網址上的簽章。
 *
 * ⚠️ 為什麼是 route handler 而不是 page.tsx：
 * App Router 的 page 一定會被 `app/layout.tsx` 包起來，於是這一頁在
 * in-app browser 裡連 Navbar、底部導航、Footer 一起長出來 —— 玩家在綠界的
 * 網址列底下又看到一條自家的返回列，還按得下去（老闆回報「奇怪的頂部導航」，
 * 2026-08-20 附圖）。route handler 不吃任何 layout，回什麼就是什麼。
 *
 * 同理，HTML 直接組字串而不是 JSX：表單要在 HTML 送達的當下就存在，
 * 不能等 hydration，否則慢速網路下會先看到一片空白。
 */

export const dynamic = 'force-dynamic'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function html(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>前往付款</title></head>${body}</html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t')
  const payload = t ? verifyHandoff(t) : null

  if (!payload) {
    return html(
      `<body style="margin:0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;` +
        `align-items:center;justify-content:center;text-align:center;padding:32px;box-sizing:border-box">` +
        `<div><h1 style="font-size:17px;color:#262626;margin:0 0 12px">這個付款連結已失效</h1>` +
        `<p style="font-size:14px;color:#737373;line-height:1.7;max-width:20rem;margin:0">` +
        `付款連結只在十分鐘內有效。請關閉這個視窗，回到吉吉比重新操作一次。</p></div></body>`,
      410,
    )
  }

  const inputs = Object.entries(payload.fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(String(v))}">`)
    .join('')

  /*
   * 種一張標記再送出。
   *
   * 付款完成後綠界會把瀏覽器導回前台的 `/payment/return`，但那是開在
   * in-app browser 裡 —— 那邊沒有 webview 的登入 cookie，導去需要登入的頁面
   * 只會看到「請先登入」（老闆回報「跑到那一個未登錄頁面」）。
   *
   * 整條付款流程（交接頁 → 綠界 → 3D 驗證 → 回程）都在**同一個
   * SFSafariViewController**裡跑完，儲存空間從頭到尾是同一份，所以這張標記
   * 在回程頁讀得到，前台就知道要把玩家導回 ggbapp://。
   * 一般網頁付款不會有這張標記，行為完全不受影響。
   *
   * ⚠️ 回程頁只能用 `document.cookie` 讀它，不能在伺服器端看 Cookie 標頭 ——
   * 那趟是跨站轉址鏈，`SameSite=Lax` 的 cookie 不會被送出去（見
   * app/payment/return/route.ts 的說明）。
   *
   * 30 分鐘後自動失效：付款流程不會比這更久，過期了也不該再彈回 App。
   */
  return html(
    `<body style="margin:0;font-family:system-ui,sans-serif">` +
      `<div style="padding:32px;text-align:center;color:#737373;font-size:14px">正在前往綠界付款頁…</div>` +
      `<form id="ecpay" action="${esc(payload.action)}" method="POST">${inputs}</form>` +
      // 沒有 JS 也要能付款：按鈕是 <noscript> 的退路
      `<noscript><div style="text-align:center"><button type="submit" form="ecpay">前往付款</button></div></noscript>` +
      // localStorage 是保險：cookie 若被隱私設定擋掉，回程頁還有第二個依據可看
      `<script>try{document.cookie='ggb_pay_app=1; path=/; max-age=1800; samesite=lax';` +
      `localStorage.setItem('ggb_pay_app','1')}catch(e){}` +
      `document.getElementById('ecpay').submit();</script>` +
      `</body>`,
  )
}
