import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const machineId = parseInt(id)
    if (isNaN(machineId)) return NextResponse.json({ error: '無效機台 ID' }, { status: 400 })

    const ssrSupabase = await createSsrClient()
    const { data: { session } } = await ssrSupabase.auth.getSession()
    if (!session?.user) return NextResponse.json({ session: null })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data } = await supabase
      .from('slot_sessions')
      .select('state, rush_hits_remaining, spins_since_rush, total_spins')
      .eq('user_id', session.user.id)
      .eq('machine_id', machineId)
      .single()

    return NextResponse.json({ session: data ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
