import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/logAdminAction'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await getSupabaseAdmin().from('events').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { data, error } = await getSupabaseAdmin()
    .from('events').update({
      slug: body.slug?.trim(),
      title: body.title?.trim(),
      bg_color: body.bg_color,
      accent_color: body.accent_color,
      is_active: body.is_active,
      start_at: body.start_at || null,
      end_at: body.end_at || null,
      linked_category_id: body.linked_category_id ?? null,
      theme_mode: body.theme_mode === 'light' ? 'light' : 'dark',
      // 首屏獨立於內容區。沒帶就維持 dark —— 既有活動頁視覺不變
      hero_mode: ['dark','light','follow'].includes(body.hero_mode) ? body.hero_mode : 'dark',
      kind: body.kind ?? 'other',
    }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({ adminId: admin.adminId, action: '修改活動頁', targetType: 'event', targetId: String(id), detail: { id, slug: body.slug }, ip: req.headers.get('x-forwarded-for') ?? '' })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  // 抽獎公平性活動頁（slug='fairness'）不可刪除 —— 它是常駐的公平性說明頁、
  // 抽獎流程與清資料都依賴它存在（老闆 2026-08-21）
  const { data: ev } = await getSupabaseAdmin().from('events').select('slug').eq('id', id).maybeSingle()
  if (ev?.slug === 'fairness') {
    return NextResponse.json({ error: '抽獎公平性頁為系統常駐頁，不可刪除' }, { status: 403 })
  }
  const { error } = await getSupabaseAdmin().from('events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAdminAction({ adminId: admin.adminId, action: '刪除活動頁', targetType: 'event', targetId: String(id), detail: { id }, ip: req.headers.get('x-forwarded-for') ?? '' })
  return NextResponse.json({ ok: true })
}
