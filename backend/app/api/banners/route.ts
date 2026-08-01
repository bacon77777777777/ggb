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

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('banners')
      .select('id, name, image_url, link_url, sort_order, is_active, created_at, start_at, end_at, event_id')
      .order('sort_order', { ascending: true })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching banners:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, image_url, link_url, sort_order, is_active, page, start_at, end_at, event_id } = body

    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('banners')
      .insert([
        {
          name,
          image_url,
          link_url: await resolveBannerLink(event_id, link_url),
          sort_order,
          is_active,
          page: page || 'home',
          start_at: start_at || null,
          end_at: end_at || null,
          event_id: event_id || null,
        },
      ])
      .select()
      .single()

    if (error) throw error

    await logAdminAction({ adminId: session.adminId, action: '新增輪播圖', targetType: 'banners', targetId: String(data.id), detail: { name }, ip: getClientIp(request) })
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error creating banner:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
