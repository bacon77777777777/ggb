import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('platform_monitor_logs')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(48)  // 最近 48 筆（6h × 48 = 12 天）

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// 手動觸發一次監控
export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const secret = process.env.CRON_SECRET ?? ''
  const base   = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

  const res = await fetch(`${base}/api/cron/platform-monitor`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' },
    body: '{}',
  })

  const data = await res.json()
  if (res.ok) {
    await logAdminAction({ adminId: session.adminId, action: '手動觸發平台監控', targetType: 'platform_monitor', ip: getClientIp(req) })
  }
  return NextResponse.json(data, { status: res.status })
}
