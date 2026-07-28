import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const machineId = parseInt(id)
    if (isNaN(machineId)) return NextResponse.json({ error: '無效 ID' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const [machineRes, poolRes] = await Promise.all([
      supabase
        .from('slot_machines')
        .select('*')
        .eq('id', machineId)
        .eq('is_active', true)
        .single(),
      supabase
        .from('slot_pool_items')
        .select(`
          id, min_bet, is_floor, rush_only, normal_only, remaining,
          product_prizes (id, name, level, image_url, recycle_value)
        `)
        .eq('machine_id', machineId)
        .order('id', { ascending: true }),
    ])

    if (machineRes.error || !machineRes.data) {
      return NextResponse.json({ error: '機台不存在' }, { status: 404 })
    }

    return NextResponse.json({
      machine: machineRes.data,
      pool: poolRes.data ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
