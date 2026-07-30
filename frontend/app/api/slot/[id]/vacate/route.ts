import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// 支援 fetch keepalive（頁面關閉時使用）
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
  // active_until 設為過去（標記為非活躍），保留 99 秒寬限期
  const pastTime = new Date(now - 1000).toISOString()
  const graceEnd = new Date(now + 99_000).toISOString()

  await supabase
    .from('slot_machines')
    .update({
      occupant_active_until: pastTime,
      occupancy_expires_at:  graceEnd,
    })
    .eq('id', machineId)
    .eq('occupant_id', session.user.id)

  return NextResponse.json({ success: true })
}
