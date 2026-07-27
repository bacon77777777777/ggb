import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/logAdminAction'

export async function GET(req: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await getSupabaseAdmin()
    .from('events').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.slug || !body.title) return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('events').insert({
      slug: body.slug.trim(),
      title: body.title.trim(),
      bg_color: body.bg_color || '#0a0610',
      accent_color: body.accent_color || '#ffd24a',
      is_active: body.is_active ?? true,
      start_at: body.start_at || null,
      end_at: body.end_at || null,
    }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction(req, admin.username, 'create_event', { slug: body.slug, title: body.title })
  return NextResponse.json(data)
}
