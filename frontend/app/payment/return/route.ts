/**
 * 付款回程的落地頁
 *
 * 綠界付款結束後（不管是付完、取號、失敗，還是按了「返回商店」），瀏覽器會被
 * 導到這裡，再由這裡決定下一步。
 *
 * 為什麼要多這一站：App 裡的付款是開在 in-app browser 的，那邊**沒有 webview
 * 的登入 cookie**。直接把玩家導去 `/profile?tab=topup-history` 只會看到「請先
 * 登入」——錢入帳了、畫面卻在叫他登入。所以先看一眼交接頁種的 `ggb_pay_app`
 * 標記：
 *
 *   有標記（從 App 出發）→ 導回 `ggbapp://`，人回到 App，餘額由 App 自己重讀
 *   沒有標記（一般網頁）→ 直接回原本的目的地，體驗完全不變
 *
 * ⚠️ **標記一定要在瀏覽器端用 `document.cookie` 讀，不能在伺服器端看
 * request 的 Cookie 標頭。**
 * 第一版就是栽在這裡（老闆 2026-08-20 回測仍卡在未登入頁）：這趟回程是
 * 綠界 POST 到 `admin.ggb.com.tw`、再 302 到 `www.ggb.com.tw` 的**跨站轉址鏈**，
 * 鏈上只要有一個跨站來源，瀏覽器算出來的 site-for-cookies 就是 null，
 * `SameSite=Lax` 的 cookie 一律不送 —— 伺服器永遠看不到它，於是每次都被
 * 判成「一般網頁」丟回 `/profile`。
 * 但 SameSite 管的是「送不送出去」，**不管 JS 讀不讀得到**，所以同一張 cookie
 * 在頁面裡用 `document.cookie` 是拿得到的。判斷因此整個搬到前端。
 *
 * 用 route handler 不用 page：page 會被 `app/layout.tsx` 包上 Navbar 與底部
 * 導航，在綠界的網址列底下再長一條自家的導航列很怪，而且這一站只是中繼，
 * 不該等 React 載入才動作 —— 判斷寫在 `<head>` 的同步 script 裡，
 * HTML 還沒畫到 body 就已經轉走了，網頁版看不到任何閃爍。
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
  const back = `${APP_SCHEME}?to=${encodeURIComponent(to)}`

  /*
   * `<head>` 裡的同步 script：不是從 App 來的就當場轉走，body 完全不會被畫出來。
   * 是從 App 來的才把 body 顯示出來（CSS 預設藏起來），並清掉標記 ——
   * 這趟已經處理完，留著會讓之後在同一個瀏覽器開的頁面誤判。
   *
   * 自動導向可能被 Safari 擋掉（沒有使用者手勢），所以畫面上同時放一顆按鈕當出路。
   */
  const decide =
    `(function(){` +
    `var to=${JSON.stringify(to)},back=${JSON.stringify(back)};` +
    // app=1（訂單自帶的記號，見後端 CustomField1）為準；
    // cookie／localStorage 是舊版流程的備援 —— SFSafariVC 的儲存讀不到
    // 曾讓玩家掉進未登入頁（2026-08-20），所以不能只靠它們
    `var fromApp=${JSON.stringify(url.searchParams.get('app') === '1')};` +
    `var ls=null;try{ls=localStorage.getItem('${COOKIE}')}catch(e){}` +
    `if(!fromApp&&document.cookie.indexOf('${COOKIE}=1')<0&&ls!=='1'){location.replace(to);return;}` +
    `try{document.cookie='${COOKIE}=; path=/; max-age=0; samesite=lax';` +
    `localStorage.removeItem('${COOKIE}')}catch(e){}` +
    // 立刻跳，不停留（老闆 2026-08-20：不要先看到一頁網頁再回 App）——
    // 這一頁只在跳轉失敗時才會被看見（下面 1.2 秒後才顯示的保險 UI）
    `location.href=back;` +
    /*
     * 自訂 scheme 打不開的退路。
     *
     * `ggbapp://` 是 2026-08-20 才寫進 Info.plist 的，比那天更早安裝的 App
     * 沒有註冊這個 scheme —— 按下去完全沒反應（老闆回報）。網頁這邊改不了，
     * 只能等新的原生版。
     *
     * 判斷方式：真的跳走的話這一頁會被隱藏（visibilitychange）或整個卸載；
     * 兩秒後還看得到自己，就是沒跳成功，這時候把文案換成「按左上角的 ✕」。
     * 那顆 ✕ 一樣回得去 —— App 端收到 in-app browser 關閉會自己重讀餘額。
     */
    `var gone=false;` +
    `document.addEventListener('visibilitychange',function(){if(document.hidden)gone=true});` +
    `window.addEventListener('pagehide',function(){gone=true});` +
    `setTimeout(function(){if(gone)return;` +
    // 1.2 秒還在這裡＝跳轉被擋（或舊版 App 沒註冊 scheme），這時才把畫面亮出來
    `document.documentElement.setAttribute('data-app','1');},1200);` +
    `setTimeout(function(){if(gone)return;` +
    `var t=document.getElementById('ptitle'),d=document.getElementById('pdesc'),h=document.getElementById('phint');` +
    `if(t)t.textContent='儲值完成了';` +
    `if(d)d.textContent='請按左上角的 ✕ 關掉這個視窗，就會回到吉吉比，代幣已經在你的餘額裡。';` +
    `if(h)h.textContent='下面那顆需要新版 App 才有作用';},3000);` +
    `})();`

  return new Response(
    `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>回到吉吉比</title>` +
      `<style>html:not([data-app]) body{visibility:hidden}</style>` +
      `<script>${decide}</script>` +
      // 沒有 JS 就直接回目的地，總比停在一個空白頁好
      `<noscript><meta http-equiv="refresh" content="0;url=${esc(to)}"></noscript>` +
      `</head>` +
      `<body style="margin:0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;` +
      `align-items:center;justify-content:center;padding:32px;box-sizing:border-box;background:#fff">` +
      `<div style="text-align:center;max-width:22rem;width:100%">` +
      `<p id="ptitle" style="font-size:15px;color:#404040;margin:0 0 4px;font-weight:800">付款流程已結束</p>` +
      `<p id="pdesc" style="font-size:13px;color:#a3a3a3;line-height:1.7;margin:0 0 24px">` +
      `正在帶你回到吉吉比，代幣入帳後會直接顯示在餘額裡。</p>` +
      `<a href="${esc(back)}" style="display:flex;height:48px;align-items:center;justify-content:center;` +
      `border-radius:12px;background:#ff4d2d;color:#fff;font-size:15px;font-weight:900;text-decoration:none">` +
      `回到吉吉比</a>` +
      `<p id="phint" style="margin:12px 0 0;font-size:12.5px;color:#a3a3a3">沒有自動跳回的話，按上面這顆</p>` +
      `</div>` +
      `</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )
}

/** 綠界某些付款方式會用 POST 把玩家送回來，行為跟 GET 一樣 */
export async function POST(req: Request) {
  return GET(req)
}
