import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// POST { order: [sectionId, ...] } — reassigns sort_order by index
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { order } = await req.json() as { order: string[] }
  const supabase = getSupabaseAdmin()
  await Promise.all(order.map((sectionId, idx) =>
    supabase.from('event_sections').update({ sort_order: idx }).eq('id', sectionId)
  ))
  return NextResponse.json({ ok: true })
}
