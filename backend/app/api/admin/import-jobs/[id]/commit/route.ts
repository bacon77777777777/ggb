import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * 把工作裡選取的商品直接匯入
 *
 * 不重寫上架邏輯 —— 轉呼叫既有的 import/commit，那支已經處理好籤號封存、
 * 系列推斷、廠商欄位強制覆蓋、欄位白名單這些事。兩套並存遲早會有一套過時。
 *
 * 匯入成功的列標成 skipped（不是 done）—— done 代表「補齊完成」，
 * skipped 代表「這一列不用再處理了」。用同一個欄位表達兩件事會分不清楚，
 * 所以另外用 committed_at 記時間，畫面上據此顯示「已匯入」。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const rowIds: number[] = Array.isArray(body?.rowIds) ? body.rowIds.map(Number).filter(Boolean) : []
  if (!rowIds.length) return NextResponse.json({ error: '沒有選取任何商品' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: job } = await supabase
    .from('import_jobs').select('supplier_id, filename').eq('id', id).maybeSingle()
  if (!job) return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  if (scope.supplierScope !== undefined && job.supplier_id !== scope.supplierScope) {
    return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  }

  const { data: rows } = await supabase
    .from('import_job_rows').select('id, row_no, product, prizes')
    .eq('job_id', id).in('id', rowIds).order('row_no')

  if (!rows?.length) return NextResponse.json({ error: '選取的商品找不到' }, { status: 404 })

  // 轉呼叫既有的批量上架。帶著原本的 cookie，權限與廠商範圍照舊生效
  const origin = new URL(request.url).origin
  const res = await fetch(`${origin}/api/admin/products/import/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      products: rows.map(r => ({ row: r.row_no, product: r.product, prizes: r.prizes })),
    }),
  })
  const result = await res.json()
  if (!res.ok) return NextResponse.json({ error: result?.error ?? '匯入失敗' }, { status: res.status })

  // 成功的那幾列標記起來，避免重複匯入。
  // commit 回的是 results（每一列一筆，帶 ok 與 row），不是只有錯誤清單
  const okRows = new Set<number>(
    ((result?.results ?? []) as { row?: number; ok?: boolean }[])
      .filter(r => r.ok).map(r => Number(r.row)).filter(Boolean),
  )
  const okIds = rows.filter(r => okRows.has(r.row_no)).map(r => r.id)
  if (okIds.length) {
    await supabase.from('import_job_rows')
      .update({ status: 'skipped', updated_at: new Date().toISOString() })
      .in('id', okIds)
  }

  await logAdminAction({
    adminId: scope.adminId,
    action: '從補齊工作匯入商品',
    targetType: 'import_jobs',
    targetId: id,
    detail: { filename: job.filename, requested: rows.length, ok: result?.ok, fail: result?.fail },
    ip: getClientIp(request),
  })

  return NextResponse.json(result)
}
