import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'

export const runtime = 'nodejs'

/**
 * 二次補齊
 *
 * 把選取的列退回佇列，交給同一支 cron 重跑 —— 不另外寫一條路徑。
 * attempts 歸零，否則第一次就用完重試次數的列會直接被跳過。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const rowIds: number[] = Array.isArray(body?.rowIds) ? body.rowIds.map(Number).filter(Boolean) : []
  if (!rowIds.length) return NextResponse.json({ error: '沒有選取任何商品' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: job } = await supabase.from('import_jobs').select('supplier_id').eq('id', id).maybeSingle()
  if (!job) return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  if (scope.supplierScope !== undefined && job.supplier_id !== scope.supplierScope) {
    return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  }

  const { error } = await supabase.from('import_job_rows')
    .update({ status: 'pending', attempts: 0, error: null, updated_at: new Date().toISOString() })
    .eq('job_id', id).in('id', rowIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 工作本身也要回到補齊中，否則 cron 那支的 inner join 撈不到
  await supabase.from('import_jobs')
    .update({ status: 'enriching', updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({ ok: true, queued: rowIds.length })
}
