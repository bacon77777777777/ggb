import type { Metadata } from 'next'
import { fetchProductById, buildProductMetadata, buildProductJsonLd } from '@/lib/seo-products'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const productId = Number(id)
  const product = Number.isFinite(productId) ? await fetchProductById(productId) : null
  return buildProductMetadata(product)
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const productId = Number(id)
  const product = Number.isFinite(productId) ? await fetchProductById(productId) : null
  const jsonLd = buildProductJsonLd(product)

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      {children}
    </>
  )
}

