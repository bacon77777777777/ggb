import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getSiteUrl } from '@/lib/site'
import type { Database } from '@/types/database.types'

type NewsRow = Database['public']['Tables']['news']['Row']

async function fetchNewsById(id: string): Promise<NewsRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const supabase = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.from('news').select('*').eq('id', id).single()
  if (error || !data) return null
  return data as NewsRow
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const siteUrl = getSiteUrl()
  const article = await fetchNewsById(id)

  if (!article) {
    return {
      title: '消息不存在',
      robots: { index: false, follow: false },
    }
  }

  const title = `${article.title}｜吉吉比轉蛋情報`
  const plainText = article.content
    ? article.content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    : ''
  const description = plainText.length > 10
    ? plainText.slice(0, 130).trim() + '… ｜ 吉吉比線上轉蛋・一番賞情報'
    : `吉吉比最新情報：${article.title}｜線上轉蛋・一番賞・盲盒・卡牌最新消息`

  const canonical = `${siteUrl}/news/${id}`
  const imageUrl = (article as any).image_url || `${siteUrl}/images/banner_defaulet.png`
  const ogImage = imageUrl.startsWith('http') ? imageUrl : `${siteUrl}${imageUrl}`

  const tags: string[] = (article as any).tags ?? []
  const keywords = [
    article.title,
    ...tags,
    '線上轉蛋情報', '一番賞情報', '轉蛋新品', '吉吉比', 'GGB',
  ].filter(Boolean).join(', ')

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      url: canonical,
      siteName: '吉吉比 GGB',
      locale: 'zh_TW',
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: article.title }],
      publishedTime: article.created_at ?? undefined,
      authors: ['吉吉比 GGB'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function NewsDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const siteUrl = getSiteUrl()
  const article = await fetchNewsById(id)

  const articleJsonLd = article
    ? {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description: article.content
          ? article.content.replace(/<[^>]*>/g, '').slice(0, 160).trim()
          : article.title,
        image: [(article as any).image_url || `${siteUrl}/images/banner_defaulet.png`],
        datePublished: article.created_at,
        dateModified: (article as any).updated_at ?? article.created_at,
        author: [{ '@type': 'Organization', name: '吉吉比 GGB', url: siteUrl }],
        publisher: {
          '@type': 'Organization',
          name: '吉吉比 GGB',
          logo: { '@type': 'ImageObject', url: `${siteUrl}/images/20260629/favicon.png` },
        },
        url: `${siteUrl}/news/${id}`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${siteUrl}/news/${id}` },
      }
    : null

  return (
    <>
      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      )}
      {children}
    </>
  )
}
