import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const date   = searchParams.get('date')
  const limit  = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const offset = Number(searchParams.get('offset') ?? 0)

  const supabase = getSupabaseAdmin()
  let q = supabase
    .from('content_drafts')
    .select('*', { count: 'exact' })
    .order('draft_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) q = q.eq('status', status)
  if (date)   q = q.eq('draft_date', date)

  const { data, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 補 image_url（從 storage 取公開 URL）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const drafts = (data ?? []).map((d: any) => ({
    ...d,
    image_url: d.image_path
      ? `${supabaseUrl}/storage/v1/object/public/content-drafts/${d.image_path}`
      : null,
  }))

  return NextResponse.json({ drafts, total: count ?? 0 })
}
