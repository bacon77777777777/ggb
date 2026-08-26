const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 驗證用的 production build 可以輸出到別的資料夾，避免打壞正在跑的 dev server。
  //   NEXT_DIST_DIR=.next-verify npm run build
  // 不設就是預設的 .next。
  //
  // 會有這個是因為：dev server 跑著的時候在同一個目錄執行 `npm run build`，
  // production 產物會覆蓋 .next，dev server 接著就會 500（找不到 chunk / manifest）。
  // 那不是 Next.js 需要重啟，是被自己人打壞的。
  // ⚠️ 跑完記得 `git checkout -- tsconfig.json next-env.d.ts`：
  //    Next.js build 會把這兩個檔改成指向 NEXT_DIST_DIR，驗證完那個目錄就刪了，
  //    帶著這種改動 commit 上去，Vercel 會找不到型別檔而建置失敗。
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "false" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ]
      }
    ]
  }
}

module.exports = withSentryConfig(nextConfig, {
  org: 'ggb-wg',
  project: 'javascript-nextjs',
  silent: true,
  disableLogger: true,
  automaticVercelMonitors: false,
})
