import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('tags')
      .select('id, name, is_pinned, pinned_order, is_hidden, created_at')
      .order('is_pinned', { ascending: false })
      .order('pinned_order', { ascending: false })
      .order('name', { ascending: true })

    if (error) throw error
    return NextResponse.json({ tags: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '讀取失敗' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const rawName = typeof body?.name === 'string' ? body.name : ''
    const name = rawName.replace(/^#/, '').trim()

    if (!name) return NextResponse.json({ error: '缺少標籤名稱' }, { status: 400 })
    if (name.length > 5) return NextResponse.json({ error: '標籤名稱最多 5 個字' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('tags')
      .insert({ name })
      .select('id, name, is_pinned, pinned_order, is_hidden, created_at')
      .single()

    if (error) {
      const msg = [error.message, (error as any).details, (error as any).hint].filter(Boolean).join(' | ')
      return NextResponse.json({ error: msg || '建立失敗' }, { status: 500 })
    }

    return NextResponse.json({ tag: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '建立失敗' }, { status: 500 })
  }
}

