import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co',                      pathname: '/storage/v1/object/public/**' },
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
