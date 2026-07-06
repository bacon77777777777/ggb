import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { status, note } = body
  const allowed = ['draft', 'confirmed', 'paid']
  if (status && !allowed.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (status) update.status = status
  if (note !== undefined) update.note = note
  if (status === 'confirmed') update.confirmed_at = new Date().toISOString()
  if (status === 'paid') update.paid_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('settlement_snapshots')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
