import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

// POST { order: [sectionId, ...] } — reassigns sort_order by index
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { order } = await req.json() as { order: string[] }
  const supabase = getSupabaseAdmin()
  await Promise.all(order.map((sectionId, idx) =>
    supabase.from('event_sections').update({ sort_order: idx }).eq('id', sectionId)
  ))
  await logAdminAction({
    adminId: admin.adminId,
    action: '調整活動區塊順序',
    targetType: 'event',
    targetId: String(id),
    detail: { count: order.length },
    ip: getClientIp(req),
  })

  return NextResponse.json({ ok: true })
}
