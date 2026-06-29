import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/login',
          '/register',
          '/forgot-password',
          '/update-password',
          '/profile',
          '/topup',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}

