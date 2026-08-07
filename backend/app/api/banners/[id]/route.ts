import { supabase } from '@/lib/supabaseClient'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/** 關聯活動時連結一律由系統產生，避免後台手打錯字或活動改 slug 後變死連結 */
async function resolveBannerLink(eventId: string | null | undefined, fallback: string | null | undefined) {
  if (!eventId) return fallback ?? null
  const { data } = await getSupabaseAdmin().from('events').select('slug').eq('id', eventId).single()
  return data?.slug ? `/events/${data.slug}` : (fallback ?? null)
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const { name, image_url, link_url, sort_order, is_active, page, start_at, end_at, event_id } = body

    const supabaseAdmin = getSupabaseAdmin()

    const updateData: Record<string, unknown> = {
      name, image_url, sort_order, is_active,
      link_url: await resolveBannerLink(event_id, link_url),
    }
    if (page !== undefined) updateData.page = page
    if (start_at !== undefined) updateData.start_at = start_at || null
    if (end_at !== undefined) updateData.end_at = end_at || null
    if (event_id !== undefined) updateData.event_id = event_id || null

    const { data, error } = await supabaseAdmin
      .from('banners')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: '編輯輪播圖',
      targetType: 'banners',
      targetId: String(id),
      detail: { name: data?.name, is_active: data?.is_active },
      ip: getClientIp(request),
    })

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error updating banner:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const supabaseAdmin = getSupabaseAdmin()

    const { error } = await supabaseAdmin
      .from('banners')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: '刪除輪播圖',
      targetType: 'banners',
      targetId: String(id),
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting banner:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
