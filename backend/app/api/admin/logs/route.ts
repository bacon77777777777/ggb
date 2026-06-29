import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const payload = {
      username: String(body?.username || ''),
      role: String(body?.role || ''),
      action: String(body?.action || ''),
      target: String(body?.target || ''),
      details: String(body?.details || ''),
      ip: String(body?.ip || ''),
      status: String(body?.status || 'success'),
    }

    if (!payload.username || !payload.action) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('action_logs').insert(payload)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '寫入失敗' }, { status: 500 })
  }
}
