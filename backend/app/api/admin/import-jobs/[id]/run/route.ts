import { NextResponse } from 'next/server'
import { requireAdminScope } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { runEnrichBatch } from '@/lib/importEnrichRunner'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 由頁面推進補齊
 *
 * 開著補齊結果那一頁時，前端每跑完一輪就再打一次，直到沒有待處理的列。
 * cron 只是沒人看著時的後備 —— pg_cron 排的是打正式站，
 * 本機與 STG 不會有人來處理，只靠它的話工作永遠停在 0/33。
 *
 * 兩邊同時跑不會重複：撈到的列會先被標成 enriching。
 */
/*
 * 這支刻意不寫 action_logs：它是背景批次的推進器，開著補齊頁面時每 3 秒
 * 就會被打一次，記進去會把稽核軌跡整個洗掉。人真的按下的動作
 *（建立工作、重新補齊、匯入商品）在各自的路由裡都有記。
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { data: job } = await supabase
    .from('import_jobs').select('supplier_id, status').eq('id', id).maybeSingle()
  if (!job) return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  if (scope.supplierScope !== undefined && job.supplier_id !== scope.supplierScope) {
    return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  }
  if (job.status !== 'enriching') return NextResponse.json({ ok: true, processed: 0, done: 0, failed: 0 })

  try {
    const r = await runEnrichBatch(id)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '補齊失敗' }, { status: 500 })
  }
}
