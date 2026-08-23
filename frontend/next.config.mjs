import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 驗證用的 production build 可以輸出到別的資料夾，避免打壞正在跑的 dev server。
  //   NEXT_DIST_DIR=.next-verify npm run build
  // 不設就是預設的 .next。
  //
  // 會有這個是因為：dev server 跑著的時候在同一個目錄執行 `npm run build`，
  // production 產物會覆蓋 .next，dev server 接著就會 500（找不到 chunk / manifest）。
  // 那不是 Next.js 需要重啟，是被自己人打壞的。
  distDir: process.env.NEXT_DIST_DIR || '.next',
  /*
   * 這次部署的識別碼，同時烤進 client bundle 與伺服器端。
   *
   * App 靠它判斷「網頁版有沒有新版本」（components/native/AppUpdateGate.tsx）：
   * webview 裡的 JS 帶的是**載入當下那次部署**的值，`/api/app-version` 回的是
   * **現在線上那次部署**的值，兩者不同就代表推過版了。
   *
   * 用 commit sha 而不是時間戳：同一個 commit 重新部署（例如只改 env）不該叫玩家更新。
   * 本機沒有 VERCEL_GIT_COMMIT_SHA，固定回 'dev'，兩邊永遠相等＝不會跳提示。
   */
  env: {
    NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12),
  },
  output: 'standalone',
  /*
   * 靜態資源快取：**只有帶 `?v=<內容雜湊>` 的網址**才給一年 immutable
   * （見 lib/asset.ts；雜湊表由 scripts/gen-asset-manifest.mjs 產生）。
   * 沒帶版本的維持 Next 預設的 must-revalidate —— 慢，但永遠不會拿到舊圖。
   * 不用 stale-while-revalidate：老闆 2026-08-22 明確不要舊圖（資訊不對等）。
   */
  async headers() {
    return [
      {
        source: '/:prefix(images|loading|icons|audio|videos)/:path*',
        has: [{ type: 'query', key: 'v' }],
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co',                      pathname: '/storage/v1/object/public/**' },
      // Cloudflare R2 public bucket
      { protocol: 'https', hostname: '**.r2.dev',                           pathname: '/**' },
      { protocol: 'https', hostname: 'img.slimetoy.com.tw',                 pathname: '/products/**' },
      { protocol: 'https', hostname: 'limitlesstcg.nyc3.cdn.digitaloceanspaces.com', pathname: '/**' },
      // Bandai / Gashapon
      { protocol: 'https', hostname: 'gashapon.jp',                         pathname: '/**' },
      { protocol: 'https', hostname: '**.gashapon.jp',                      pathname: '/**' },
      { protocol: 'https', hostname: 'bandai-gashapon.jp',                  pathname: '/**' },
      { protocol: 'https', hostname: '**.bandai-gashapon.jp',               pathname: '/**' },
      { protocol: 'https', hostname: 'p-bandai.jp',                         pathname: '/**' },
      { protocol: 'https', hostname: '**.bandai.co.jp',                     pathname: '/**' },
      // Hobby shops
      { protocol: 'https', hostname: 'amiami.com',                          pathname: '/**' },
      { protocol: 'https', hostname: '**.amiami.com',                       pathname: '/**' },
      { protocol: 'https', hostname: 'hlj.com',                             pathname: '/**' },
      { protocol: 'https', hostname: '**.hlj.com',                          pathname: '/**' },
      { protocol: 'https', hostname: '**.hobbylink.tv',                     pathname: '/**' },
      { protocol: 'https', hostname: 'www.goodsmile.info',                  pathname: '/**' },
      // General CDN / images
      { protocol: 'https', hostname: 'i.imgur.com',                         pathname: '/**' },
      { protocol: 'https', hostname: '**.cdnjoy.com',                       pathname: '/**' },
      { protocol: 'https', hostname: '**.toyspeople.com',                   pathname: '/**' },
      { protocol: 'https', hostname: 'toy-people.com',                      pathname: '/**' },
      // DuckDuckGo image search results (Bing CDN + Japanese hobby shops)
      { protocol: 'https', hostname: 'item-shopping.c.yimg.jp',             pathname: '/**' },
      { protocol: 'https', hostname: '**.yimg.jp',                          pathname: '/**' },
      { protocol: 'https', hostname: 'bandai-a.akamaihd.net',               pathname: '/**' },
      { protocol: 'https', hostname: '**.akamaihd.net',                     pathname: '/**' },
      { protocol: 'https', hostname: 'www.suruga-ya.jp',                    pathname: '/**' },
      { protocol: 'https', hostname: 'suruga-ya.jp',                        pathname: '/**' },
      { protocol: 'https', hostname: '**.hobbydigi.com',                    pathname: '/**' },
      { protocol: 'https', hostname: 'hobbydigi.com',                       pathname: '/**' },
      { protocol: 'https', hostname: 'i.ebayimg.com',                       pathname: '/**' },
      { protocol: 'https', hostname: '**.ebayimg.com',                      pathname: '/**' },
      { protocol: 'https', hostname: 'prtimes.jp',                          pathname: '/**' },
      { protocol: 'https', hostname: '**.prtimes.jp',                       pathname: '/**' },
    ],
  },
}

export default withSentryConfig(nextConfig, {
  org: 'ggb-wg',
  project: 'javascript-nextjs',
  silent: true,
  disableLogger: true,
  automaticVercelMonitors: false,
})
