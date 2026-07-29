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
      .order('prize_type', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase.from('suppliers').select('id, name').order('name'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicate by name — keep the entry with the highest id (most recently seeded/created)
  const seenNames = new Set<string>()
  const deduped = (data ?? [])
    .sort((a, b) => b.id - a.id) // highest id first so it survives the Set filter
    .filter(p => {
      if (seenNames.has(p.name)) return false
      seenNames.add(p.name)
      return true
    })
    .sort((a, b) => {
      // Restore sort order: prize_type asc, then created_at desc
      if (a.prize_type !== b.prize_type) return a.prize_type < b.prize_type ? -1 : 1
      return b.created_at < a.created_at ? -1 : 1
    })

  return NextResponse.json({ prizes: deduped, suppliers: suppliersData ?? [] })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, level, image_url, remaining, supplier_id } = body

  if (!name) return NextResponse.json({ error: '缺少品項名稱' }, { status: 400 })
  if (!supplier_id) return NextResponse.json({ error: '缺少廠商' }, { status: 400 })
  if (remaining == null || remaining === '') return NextResponse.json({ error: '缺少庫存數量' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('slot_prizes')
    .insert({
      name,
      level: level ?? '一等獎',
      image_url: image_url ?? null,
      remaining: parseInt(remaining),
      supplier_id: parseInt(supplier_id),
      is_active: true,
    })
    .select('*, suppliers(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prize: data })
}
