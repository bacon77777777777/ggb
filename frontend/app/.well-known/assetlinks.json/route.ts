import { NextResponse } from 'next/server'

/**
 * Digital Asset Links —— Android TWA（Trusted Web Activity）的驗證檔。
 *
 * Play Console 會用它確認「這個 App 真的屬於這個網域」，驗證過了網址列才會消失；
 * 沒過的話 TWA 會退化成一般的 Custom Tab（上面掛著網址列），看起來就不像 App。
 *
 * 指紋來源：Play App Signing 頁面的 SHA-256 憑證指紋（不是本機 keystore 的，
 * 上架後 Google 會用自己的金鑰重簽）。拿到之後填進環境變數就好，不用改程式：
 *   TWA_PACKAGE_NAME=tw.com.ggb.app
 *   TWA_SHA256_FINGERPRINTS=AA:BB:CC:...   （多把用逗號分隔）
 *
 * 還沒設定時回傳空陣列 —— 這是合法的 JSON，Google 只會驗證失敗，不會壞掉。
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const packageName = process.env.TWA_PACKAGE_NAME || ''
  const fingerprints = (process.env.TWA_SHA256_FINGERPRINTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const statements =
    packageName && fingerprints.length
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : []

  return NextResponse.json(statements, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
