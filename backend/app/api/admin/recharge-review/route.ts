import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const includeResolved = searchParams.get('resolved') === '1'

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('recharge_records')
    .select(`
      id,
      order_number,
      amount,
      status,
      needs_review,
      needs_review_at,
      review_note,
      created_at,
      user_id,
      user:users(id, name, email, tokens)
    `)
    .order('created_at', { ascending: true })
    .limit(100)

  if (!includeResolved) {
    query = query.eq('needs_review', true).eq('status', 'pending')
  } else {
    query = query.eq('needs_review', true)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
