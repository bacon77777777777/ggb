import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data } = await getSupabaseAdmin()
    .from('product_categories').select('category_id').eq('product_id', Number(id))
  return NextResponse.json((data || []).map((r: { category_id: string }) => r.category_id))
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const productId = Number(id)
  const { categoryIds } = await req.json() as { categoryIds: string[] }
  const supabase = getSupabaseAdmin()

  // Get current memberships
  const { data: existing } = await supabase
    .from('product_categories').select('category_id').eq('product_id', productId)
  const currentIds = new Set((existing || []).map((r: { category_id: string }) => r.category_id))
  const nextIds = new Set(categoryIds || [])

  // Remove categories no longer selected
  const toRemove = [...currentIds].filter(id => !nextIds.has(id))
  if (toRemove.length > 0) {
    await supabase.from('product_categories')
      .delete().eq('product_id', productId).in('category_id', toRemove)
  }

  // Add newly selected categories
  const toAdd = [...nextIds].filter(id => !currentIds.has(id))
  if (toAdd.length > 0) {
    await supabase.from('product_categories').insert(
      toAdd.map(category_id => ({ category_id, product_id: productId, sort_order: 0 }))
    )
  }

  return NextResponse.json({ success: true })
}
