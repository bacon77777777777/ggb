import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: event } = await supabase
    .from('events').select('linked_tag').eq('slug', slug).eq('is_active', true).single()

  if (!event?.linked_tag) return NextResponse.json([])

  const { data: products } = await supabase
    .from('products')
    .select('id, name, image_url, type, remaining, price, special_price, is_active')
    .contains('tags', [event.linked_tag])
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(12)

  return NextResponse.json(products || [])
}
