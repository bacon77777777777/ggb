import { supabase } from '@/lib/supabaseClient'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET() {
  try {
    // Select fields consistent with the new schema
    // Note: Admin uses 'is_active', schema migration ensures 'is_active' exists.
    const { data, error } = await supabase
      .from('news')
      .select('id, title, content, created_at, view_count, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching news:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { title, content, is_active } = body

    // Simple validation
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Generate ID similar to admin page logic if not provided
    // (Admin page generates 8-digit string)
    const id = body.id || Math.floor(10000000 + Math.random() * 90000000).toString()

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('news')
      .insert([{ id, title, content, is_active }])
      .select()
      .single()

    if (error) throw error

    await logAdminAction({ adminId: session.adminId, action: '後台新增文章', targetType: 'news', targetId: String(data.id), detail: { title }, ip: getClientIp(request) })
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error creating news:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
