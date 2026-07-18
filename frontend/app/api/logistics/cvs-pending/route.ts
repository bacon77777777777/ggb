import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ found: false }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from('cvs_pending_selections')
    .select('store_id, store_name, store_address, logistics_subtype, created_at')
    .eq('token', token)
    .gt('created_at', new Date(Date.now() - 600_000).toISOString()) // 10-min TTL
    .maybeSingle()

  if (!data) return NextResponse.json({ found: false })

  // Clean up after retrieval
  await supabase.from('cvs_pending_selections').delete().eq('token', token)

  return NextResponse.json({
    found: true,
    storeId: data.store_id,
    storeName: data.store_name,
    storeAddress: data.store_address,
    logisticsSubType: data.logistics_subtype,
  })
}
