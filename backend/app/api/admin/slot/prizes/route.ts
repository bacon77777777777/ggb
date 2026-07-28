import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const [{ data, error }, { data: suppliersData }] = await Promise.all([
    supabase
      .from('slot_prizes')
      .select('*, suppliers(id, name)')
      .order('created_at', { ascending: false }),
    supabase.from('suppliers').select('id, name').order('name'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prizes: data ?? [], suppliers: suppliersData ?? [] })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, level, image_url, description, remaining, supplier_id } = body

  if (!name) return NextResponse.json({ error: '缺少品項名稱' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_prizes')
    .insert({
      name,
      level: level ?? 'normal',
      image_url: image_url ?? null,
      description: description ?? null,
      remaining: remaining != null && remaining !== '' ? parseInt(remaining) : null,
      supplier_id: supplier_id ? parseInt(supplier_id) : null,
      is_active: true,
    })
    .select('*, suppliers(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prize: data })
}
