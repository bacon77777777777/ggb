import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('module_settings')
    .select('product_type, machine_theme')

  if (error) return NextResponse.json({}, { status: 500 })

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.product_type] = row.machine_theme
  }
  return NextResponse.json(map, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  })
}
