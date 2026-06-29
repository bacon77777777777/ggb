import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : []
    const patch = body?.patch && typeof body.patch === 'object' ? body.patch : null

    if (ids.length === 0 || !patch) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('orders').update(patch).in('id', ids)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

