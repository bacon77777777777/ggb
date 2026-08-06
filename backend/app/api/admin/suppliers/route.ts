import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession, requireAdminScope, scopeToSupplier } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET() {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  // 廠商帳號只會拿到自己那一家。結算頁的廠商下拉因此只有一個選項，
  // 也就沒辦法切去看別家的數字
  let query = supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true })
  query = scopeToSupplier(query, scope, 'id')

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, contact_name, contact_phone, contact_email, address, notes, is_active, tax_id, sender_name, sender_zip_code, sender_address } = body

  if (!name?.trim()) return NextResponse.json({ error: '廠商名稱為必填' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ name: name.trim(), contact_name, contact_phone, contact_email, address, notes, is_active: is_active ?? true, tax_id: tax_id || null, sender_name: sender_name || null, sender_zip_code: sender_zip_code || null, sender_address: sender_address || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId,
    action: '新增廠商',
    targetType: 'supplier',
    targetId: String(data?.id ?? ''),
    detail: { name: data?.name },
    ip: getClientIp(request),
  })
  return NextResponse.json(data, { status: 201 })
}
