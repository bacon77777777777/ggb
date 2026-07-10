import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('sell_listings').delete().not('id', 'is', null)
    if (error) throw error

    await logAdminAction({ adminId: session.adminId, action: '清除寄賣列表', targetType: 'sell_listings', ip: getClientIp(request) })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '清除失敗' }, { status: 500 })
  }
}

