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
            __html: `document.getElementById('ecpay').submit();`,
          }}
        />
      </body>
    </html>
  )
}
