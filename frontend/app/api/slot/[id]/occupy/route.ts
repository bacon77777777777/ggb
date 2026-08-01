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

  const { data: machine } = await supabase
    .from('slot_machines')
    .select('occupant_id, occupancy_expires_at')
    .eq('id', machineId)
    .single()

  if (!machine) return NextResponse.json({ error: '機台不存在' }, { status: 404 })

  const now = Date.now()
  const expiresAt = machine.occupancy_expires_at ? new Date(machine.occupancy_expires_at).getTime() : 0
  const isExpired = expiresAt <= now
  const isOccupiedByOther = machine.occupant_id && machine.occupant_id !== session.user.id && !isExpired

  if (isOccupiedByOther) {
    return NextResponse.json(
      { error: '機台使用中', occupancy_expires_at: machine.occupancy_expires_at },
      { status: 409 }
    )
  }

  const activeUntil = new Date(now + 30_000).toISOString()   // +30s
  const newExpiresAt = new Date(now + 90_000).toISOString() // +30s active + 60s grace

  await supabase
    .from('slot_machines')
    .update({
      occupant_id:           session.user.id,
      occupant_active_until: activeUntil,
      occupancy_expires_at:  newExpiresAt,
    })
    .eq('id', machineId)

  return NextResponse.json({ success: true })
}
