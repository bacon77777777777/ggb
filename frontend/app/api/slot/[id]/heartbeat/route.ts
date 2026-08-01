import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const machineId = parseInt(id)
  if (isNaN(machineId)) return NextResponse.json({ error: '無效機台 ID' }, { status: 400 })

  const ssrSupabase = await createSsrClient()
  const { data: { session } } = await ssrSupabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = Date.now()

  // 期限錨定最後動作 +90s，心跳不延長，只刷新活躍窗（上限 = 期限）
  const { data: machine } = await supabase
    .from('slot_machines')
    .select('occupant_id, occupancy_expires_at')
    .eq('id', machineId)
    .single()

  if (!machine || machine.occupant_id !== session.user.id) {
    return NextResponse.json({ success: false })
  }
  const expiresAt = machine.occupancy_expires_at ? new Date(machine.occupancy_expires_at).getTime() : 0
  if (expiresAt <= now) return NextResponse.json({ success: false })

  const activeUntil = new Date(Math.min(now + 30_000, expiresAt)).toISOString()
  await supabase
    .from('slot_machines')
    .update({ occupant_active_until: activeUntil })
    .eq('id', machineId)
    .eq('occupant_id', session.user.id)

  return NextResponse.json({ success: true, occupancy_expires_at: machine.occupancy_expires_at })
}
