import { supabase } from '@/lib/supabaseClient'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('banners')
      .select('id, name, image_url, link_url, sort_order, is_active, created_at')
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
    const { name, image_url, link_url, sort_order, is_active } = body

    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('banners')
      .insert([
        {
          name,
          image_url,
          link_url,
          sort_order,
          is_active,
        },
      ])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error creating banner:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
