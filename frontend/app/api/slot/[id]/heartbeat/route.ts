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
  const activeUntil = new Date(now + 30_000).toISOString()
  const expiresAt = new Date(now + 90_000).toISOString()

  // 只更新自己佔用的機台，不影響他人
  await supabase
    .from('slot_machines')
    .update({
      occupant_active_until: activeUntil,
      occupancy_expires_at:  expiresAt,
    })
    .eq('id', machineId)
    .eq('occupant_id', session.user.id)

  return NextResponse.json({ success: true })
}
