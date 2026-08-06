import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'

export const runtime = 'nodejs'

/** 一份工作的所有商品列。前端輪詢這支看補齊進度，所以要輕 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, filename, supplier_id, product_type, status, total_rows, done_rows, mapping, headers, created_at')
    .eq('id', id).maybeSingle()
  if (!job) return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  if (scope.supplierScope !== undefined && job.supplier_id !== scope.supplierScope) {
    return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  }

  const { data: rows, error } = await supabase
    .from('import_job_rows')
    .select('id, row_no, product, prizes, status, filled, warnings, error')
    .eq('job_id', id)
    .order('row_no', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job, rows: rows ?? [] })
}
