import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

export const runtime = 'nodejs'

/**
 * 匯入工作
 *
 * 這個工具的定位是「格式轉換 + 資料補齊」，不是匯入器：
 * 輸入任何廠商格式，輸出我們的標準格式。完成後可以下載 CSV
 *（原封不動餵回手動批量匯入），或直接匯入商品。
 *
 * 建立工作的動作在 upload 那支，這裡只負責列出與刪除。
 */

export async function GET() {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let q = getSupabaseAdmin()
    .from('import_jobs')
    .select('id, filename, supplier_id, product_type, status, total_rows, done_rows, error, created_at, updated_at, suppliers(name)')
    .order('created_at', { ascending: false })
    .limit(50)

  // 廠商只看得到自己那幾份
  if (scope.supplierScope !== undefined) q = q.eq('supplier_id', scope.supplierScope)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function DELETE(request: Request) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  // 廠商不能刪別人的工作
  if (scope.supplierScope !== undefined) {
    const { data } = await supabase.from('import_jobs').select('supplier_id').eq('id', id).maybeSingle()
    if (!data || data.supplier_id !== scope.supplierScope) {
      return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
    }
  }

  // import_job_rows 是 CASCADE，不用另外清
  const { error } = await supabase.from('import_jobs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: scope.adminId,
    action: '刪除匯入工作',
    targetType: 'import_jobs',
    targetId: id,
    ip: getClientIp(request),
  })
  return NextResponse.json({ ok: true })
}
