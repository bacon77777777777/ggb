import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Unnest all tags arrays and return distinct values
  const { data, error } = await getSupabaseAdmin()
    .rpc('get_distinct_product_tags' as never)

  if (error) {
    // Fallback: manual distinct query
    const { data: rows } = await getSupabaseAdmin()
      .from('products').select('tags').not('tags', 'eq', '{}')
    const tagSet = new Set<string>()
    ;(rows || []).forEach((r: { tags: string[] }) => (r.tags || []).forEach(t => tagSet.add(t)))
    return NextResponse.json(Array.from(tagSet).sort())
  }

  return NextResponse.json(data || [])
}
