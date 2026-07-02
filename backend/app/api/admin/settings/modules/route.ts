import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('module_settings')
    .select('product_type, machine_theme')
    .order('product_type')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { product_type: string; machine_theme: string }[]
  if (!Array.isArray(body)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('module_settings')
    .upsert(
      body.map(({ product_type, machine_theme }) => ({
        product_type,
        machine_theme,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'product_type' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
