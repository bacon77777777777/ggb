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
  const { data: { user } } = await ssrSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // 1) 回座：自己佔用且未過期 → 只刷新活躍窗（不延長期限）
  const { data: mine } = await supabase
    .from('slot_machines')
    .select('occupancy_expires_at')
    .eq('id', machineId)
    .eq('occupant_id', user.id)
    .gt('occupancy_expires_at', nowIso)
    .maybeSingle()

  if (mine?.occupancy_expires_at) {
    const deadline = new Date(mine.occupancy_expires_at).getTime()
    await supabase
      .from('slot_machines')
      .update({ occupant_active_until: new Date(Math.min(now + 30_000, deadline)).toISOString() })
      .eq('id', machineId)
      .eq('occupant_id', user.id)
    return NextResponse.json({ success: true, occupancy_expires_at: mine.occupancy_expires_at })
  }

  // 2) 原子認領：僅在「無人 / 已過期」時成立，同時搶台只有一人成功
  const newExpiresAt = new Date(now + 30_000).toISOString() // 初次上機 30 秒
  const { data: claimed } = await supabase
    .from('slot_machines')
    .update({
      occupant_id:           user.id,
      occupant_active_until: newExpiresAt,
      occupancy_expires_at:  newExpiresAt,
    })
    .eq('id', machineId)
    .or(`occupant_id.is.null,occupancy_expires_at.is.null,occupancy_expires_at.lt.${nowIso}`)
    .select('id')

  if (!claimed || claimed.length === 0) {
    const { data: cur } = await supabase
      .from('slot_machines').select('occupancy_expires_at').eq('id', machineId).single()
    return NextResponse.json(
      { error: '機台使用中', occupancy_expires_at: cur?.occupancy_expires_at ?? null },
      { status: 409 }
    )
  }

  return NextResponse.json({ success: true, occupancy_expires_at: newExpiresAt })
}
