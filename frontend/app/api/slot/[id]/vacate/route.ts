import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// 支援 fetch keepalive（頁面關閉時使用）
export async function POST(
  req: NextRequest,
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
  // 期限錨定最後動作 +90s：一般離開不延長也不縮短（維持原期限），僅標記非活躍；
  // 閒置踢出（immediate=1）立即釋出讓位
  const immediate = new URL(req.url).searchParams.get('immediate') === '1'
  const pastTime = new Date(now - 1000).toISOString()

  const updates: Record<string, string> = { occupant_active_until: pastTime }
  if (immediate) updates.occupancy_expires_at = pastTime

  await supabase
    .from('slot_machines')
    .update(updates)
    .eq('id', machineId)
    .eq('occupant_id', user.id)

  return NextResponse.json({ success: true })
}
