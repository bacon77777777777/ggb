import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: event } = await supabase
    .from('events').select('linked_category_id').eq('slug', slug).eq('is_active', true).single()

  if (!event?.linked_category_id) return NextResponse.json([])

  const { data: rows } = await supabase
    .from('product_categories')
    .select('products(id, name, image_url, type, remaining, price, special_price, is_active)')
    .eq('category_id', event.linked_category_id)
    .order('sort_order', { ascending: false })
    .limit(12)

  const products = (rows || [])
    .map((r: Record<string, unknown>) => r.products)
    .filter((p): p is NonNullable<typeof p> => !!p && (p as Record<string, unknown>).is_active === true)

  return NextResponse.json(products)
}
