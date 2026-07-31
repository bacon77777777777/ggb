import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start') ?? ''
  const end = searchParams.get('end') ?? ''
  const machineId = searchParams.get('machine_id')

  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: '日期格式錯誤（YYYY-MM-DD）' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 帶 machine_id → 單機每日明細；不帶 → 全機台彙總
  if (machineId) {
    const { data, error } = await supabase.rpc('get_slot_machine_daily', {
      p_machine_id: parseInt(machineId),
      p_start: start,
      p_end: end,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ daily: data ?? [] })
  }

  const { data, error } = await supabase.rpc('get_slot_machine_report', {
    p_start: start,
    p_end: end,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report: data ?? [] })
}
