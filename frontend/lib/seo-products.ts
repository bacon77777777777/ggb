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

const TYPE_LABEL: Record<string, string> = {
  ichiban: '線上一番賞',
  blindbox: '線上盲盒',
  gacha: '線上轉蛋',
  card: '線上抽卡',
  custom: '線上抽獎',
}

const TYPE_KEYWORD: Record<string, string> = {
  ichiban: '線上一番賞 台灣一番賞 日本一番賞',
  blindbox: '線上盲盒 盲盒 盒玩',
  gacha: '線上轉蛋 轉蛋台灣 日本扭蛋',
  card: '線上抽卡 卡牌 集換式卡牌',
  custom: '線上抽獎',
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
  const typeLabel = TYPE_LABEL[product.type ?? ''] ?? '線上抽獎'
  const title = `${product.name}｜${typeLabel} 吉吉比`

  const series = (product as any).series?.trim()
  const price = product.price ?? 0
  const remaining = product.remaining
  const priceStr = price > 0 ? `${price} G／抽` : ''
  const remainStr = typeof remaining === 'number' && remaining > 0 ? `剩 ${remaining} 個` : ''

  const descriptionRaw = product.description?.trim()
  const autoDesc = [
    `立即在吉吉比線上抽「${product.name}」`,
    series ? `（${series}系列）` : '',
    priceStr && remainStr ? `，${priceStr}，${remainStr}。` : priceStr ? `，${priceStr}。` : '。',
    `公正透明、即抽即看、安全宅配到府。`,
    TYPE_KEYWORD[product.type ?? ''] ?? '',
  ].join('')

  const description = descriptionRaw ? `${descriptionRaw.slice(0, 100)} — ${typeLabel} | 吉吉比` : autoDesc

  const imagePath = product.image_url || '/images/item.png'
  const imageUrl = imagePath.startsWith('http') ? imagePath : `${siteUrl}${imagePath}`
  const images = [{ url: imageUrl, width: 800, height: 800, alt: `${product.name} ${typeLabel}` }]

  const noindexStatuses = new Set(['pending', 'inactive', 'archived'])
  const shouldIndex = !noindexStatuses.has(String(product.status || ''))

  const keywords = [
    product.name,
    series,
    typeLabel,
    TYPE_KEYWORD[product.type ?? ''],
    '吉吉比', 'GGB',
  ].filter(Boolean).join(', ')

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: '吉吉比 GGB',
      locale: 'zh_TW',
      title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
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

