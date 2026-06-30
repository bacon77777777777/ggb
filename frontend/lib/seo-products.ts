import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import type { Database } from '@/types/database.types'
import { getSiteUrl } from '@/lib/site'

type DbProduct = Database['public']['Tables']['products']['Row']

export type ProductRouteType = 'item' | 'blindbox' | 'gacha' | 'card'

export function productRoutePath(product: Pick<DbProduct, 'id' | 'type'>): { path: string; routeType: ProductRouteType } {
  if (product.type === 'blindbox') return { path: `/blindbox/${product.id}`, routeType: 'blindbox' }
  if (product.type === 'gacha') return { path: `/gacha/${product.id}`, routeType: 'gacha' }
  if (product.type === 'card') return { path: `/card/${product.id}`, routeType: 'card' }
  return { path: `/item/${product.id}`, routeType: 'item' }
}

function getSupabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function fetchProductById(productId: number): Promise<DbProduct | null> {
  const supabase = getSupabasePublicClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (error || !data) return null
  return data as DbProduct
}

export function buildProductMetadata(product: DbProduct | null): Metadata {
  const siteUrl = getSiteUrl()

  if (!product) {
    return {
      title: '商品不存在',
      robots: { index: false, follow: false },
      alternates: { canonical: '/' },
    }
  }

  const { path } = productRoutePath(product)
  const canonical = `${siteUrl}${path}`
  const title = `${product.name}｜${product.type === 'ichiban' ? '一番賞' : product.type === 'blindbox' ? '盲盒' : product.type === 'gacha' ? '轉蛋' : product.type === 'card' ? '卡包' : '商品'}`

  const descriptionRaw = product.description?.trim()
  const description =
    descriptionRaw ||
    `立即查看「${product.name}」資訊：價格、剩餘數量、獎池內容與抽獎玩法。`

  const imagePath = product.image_url || '/images/item.png'
  const images = imagePath.startsWith('http') ? [imagePath] : [`${siteUrl}${imagePath}`]

  const noindexStatuses = new Set(['pending', 'inactive', 'archived'])
  const shouldIndex = !noindexStatuses.has(String(product.status || ''))

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: '吉吉比',
      locale: 'zh_TW',
      title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images,
    },
    robots: {
      index: shouldIndex,
      follow: shouldIndex,
    },
  }
}

export function buildProductJsonLd(product: DbProduct | null) {
  const siteUrl = getSiteUrl()
  if (!product) return null

  const { path } = productRoutePath(product)
  const url = `${siteUrl}${path}`
  const image = product.image_url || `${siteUrl}/images/item.png`

  const availability =
    product.status === 'active' && (product.remaining ?? 0) > 0
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock'

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || undefined,
    image: [image],
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'TWD',
      price: String(product.price ?? 0),
      availability,
    },
  }
}

