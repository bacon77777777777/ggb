import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.rpc('admin_clear_market_and_recycle_pool')
    if (error) throw error

    await logAdminAction({ adminId: session.adminId, action: '清除市集資料', targetType: 'marketplace', ip: getClientIp(request) })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '清除失敗' }, { status: 500 })
  }
}

