import { verifyHandoff } from '@/lib/paymentHandoff'

/**
 * 金流交接頁：驗簽後自動把表單送去綠界。
 *
 * 這頁只會在 App 的 in-app browser 裡被開啟（見 lib/paymentHandoff.ts）。
 * 它不需要登入 —— in-app browser 拿不到 webview 的 cookie，
 * 授權完全靠網址上的簽章。
 *
 * 為什麼是 server component：表單要在 HTML 送達的當下就存在，
 * 不能等 JS hydration，否則慢速網路下會先看到一片空白。
 */

export const dynamic = 'force-dynamic'

export default async function PaymentGoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>
}) {
  const { t } = await searchParams
  const payload = t ? verifyHandoff(t) : null

  if (!payload) {
    return (
      <main className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-[17px] font-black text-neutral-800 dark:text-neutral-100">
          這個付款連結已失效
        </h1>
        <p className="text-[14px] text-neutral-500 leading-relaxed max-w-xs">
          付款連結只在十分鐘內有效。請關閉這個視窗，回到吉吉比重新操作一次。
        </p>
      </main>
    )
  }

  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>
        <div style={{ padding: 32, textAlign: 'center', color: '#737373', fontSize: 14 }}>
          正在前往綠界付款頁…
        </div>
        <form id="ecpay" action={payload.action} method="POST">
          {Object.entries(payload.fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
        {/* 沒有 JS 也要能付款：按鈕是 <noscript> 的退路 */}
        <noscript>
          <div style={{ textAlign: 'center' }}>
            <button type="submit" form="ecpay">前往付款</button>
          </div>
        </noscript>
        <script
          dangerouslySetInnerHTML={{
            /*
             * 種一張標記再送出。
             *
             * 付款完成後綠界會把瀏覽器導回 `/profile?...&status=success`，
             * 但那是開在 in-app browser 裡 —— 玩家看到的是正確的頁面，
             * 人卻還在瀏覽器浮層，App 背後仍停在儲值頁（老闆回報「卡在這頁面」）。
             *
             * in-app browser（SFSafariViewController）跟 Safari 共用 cookie jar，
             * 整條付款流程都在同一個 jar 裡，所以這張 cookie 在回程頁讀得到，
             * 前台就知道要把玩家導回 ggbapp://。一般網頁付款不會有這張 cookie，
             * 行為完全不受影響。
             *
             * 30 分鐘後自動失效：付款流程不會比這更久，過期了也不該再彈回 App。
             */
            __html:
              "document.cookie='ggb_pay_app=1; path=/; max-age=1800; samesite=lax';" +
              "document.getElementById('ecpay').submit();",
          }}
        />
      </body>
    </html>
  )
}
