import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getSiteUrl } from '@/lib/site'
import type { Database } from '@/types/database.types'

type DbProduct = Database['public']['Tables']['products']['Row']

function productPath(p: Pick<DbProduct, 'id' | 'type'>) {
  if (p.type === 'blindbox') return `/blindbox/${p.id}`
  if (p.type === 'gacha') return `/gacha/${p.id}`
  if (p.type === 'card') return `/card/${p.id}`
  return `/item/${p.id}`
}

async function fetchProductsForSitemap(limitTotal = 5000): Promise<DbProduct[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return []

  const supabase = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const pageSize = 1000
  const rows: DbProduct[] = []

  for (let offset = 0; offset < limitTotal; offset += pageSize) {
    const { data, error } = await supabase
      .from('products')
      .select('id,type,status,created_at')
      .range(offset, offset + pageSize - 1)
      .order('id', { ascending: true })

    if (error || !data || data.length === 0) break
    rows.push(...(data as DbProduct[]))
    if (data.length < pageSize) break
  }

  return rows
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/exchange`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${siteUrl}/ranking`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${siteUrl}/news`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${siteUrl}/search`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${siteUrl}/faq`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/return-policy`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  const products = await fetchProductsForSitemap(5000)
  const allowStatuses = new Set(['active', 'ended', 'selling', 'soldout', 'coming_soon'])

  const productRoutes: MetadataRoute.Sitemap = products
    .filter((p) => allowStatuses.has(String(p.status || '')))
    .map((p) => {
      const lastModified = p.created_at ? new Date(p.created_at) : new Date()
      return {
        url: `${siteUrl}${productPath(p)}`,
        lastModified,
        changeFrequency: 'daily',
        priority: 0.7,
      }
    })

  return [...staticRoutes, ...productRoutes]
}
