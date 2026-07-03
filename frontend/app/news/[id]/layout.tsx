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

  const title = article.title
  const description =
    article.content
      ? article.content.replace(/<[^>]*>/g, '').slice(0, 120).trim() + '…'
      : `吉吉比最新消息：${article.title}`

  const canonical = `${siteUrl}/news/${id}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      url: canonical,
      siteName: '吉吉比',
      locale: 'zh_TW',
      title,
      description,
      publishedTime: article.created_at ?? undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function NewsDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
