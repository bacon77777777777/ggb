import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: event, error } = await supabase
    .from('events').select('*').eq('slug', slug).eq('is_active', true).single()
  if (error || !event) return NextResponse.json(null, { status: 404 })

  const { data: sections } = await supabase
    .from('event_sections').select('*').eq('event_id', event.id).order('sort_order', { ascending: true })

  // Resolve product_ref sections
  const resolvedSections = await Promise.all((sections || []).map(async section => {
    if (section.type === 'product_ref' && section.content?.product_id) {
      const [{ data: product }, { data: prizes }] = await Promise.all([
        supabase.from('products').select('id, name, product_type').eq('id', section.content.product_id).single(),
        supabase.from('product_prizes')
          .select('id, level, name, image_url, total, remaining, probability, recycle_value')
          .eq('product_id', section.content.product_id)
          .order('level', { ascending: true }),
      ])
      return { ...section, resolved: { product, prizes: prizes || [] } }
    }
    return section
  }))

  return NextResponse.json({ event, sections: resolvedSections })
}
