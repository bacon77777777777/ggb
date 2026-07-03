import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'img.slimetoy.com.tw',
        pathname: '/products/**',
      },
      {
        protocol: 'https',
        hostname: 'limitlesstcg.nyc3.cdn.digitaloceanspaces.com',
        pathname: '/**',
      },
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
