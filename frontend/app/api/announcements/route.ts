import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const limit = parseInt(searchParams.get('limit') || '50')

  if (id) {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, category, is_pinned, published_at')
      .eq('is_active', true)
      .eq('id', id)
      .single()
    if (error || !data) return NextResponse.json(null, { status: 404 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, category, is_pinned, published_at')
    .eq('is_active', true)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
