import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('recharge_records')
      .select(
        `
        *,
        user:users (id, name, email)
      `
      )
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json(data ?? [])
  } catch (error: any) {
    console.error('Error fetching admin recharge records:', error)
    return NextResponse.json(
      { error: error.message || '載入儲值紀錄失敗' },
      { status: 500 }
    )
  }
}
