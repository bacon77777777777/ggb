import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { parseVendorFile } from '@/lib/vendorFileParse'
import type { ProductType } from '@/lib/productSchema'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 上傳廠商的 list，建立補齊工作
 *
 * 這一支只做「解析」—— 快，一秒內完成，人可以馬上離開。
 * 補圖與查款式交給 cron 在背景分批跑（見 /api/cron/import-enrich）。
 *
 * 原本這整條在一個 modal 裡做完，但 33 筆商品每筆要爬網站查款式，
 * 10~30 秒跑不掉，整批 5~15 分鐘 —— 關掉分頁就全部白做。
 */

export async function POST(request: Request) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    const supplierIdRaw = form.get('supplierId')
    const typeRaw = form.get('type')

    if (!file) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 })

    // 廠商是上傳時從「廠商管理」的清單裡選的。廠商帳號只能選自己
    let supplierId = supplierIdRaw ? Number(supplierIdRaw) : null
    if (scope.supplierScope !== undefined) supplierId = scope.supplierScope
    if (!supplierId) return NextResponse.json({ error: '請先選擇廠商' }, { status: 400 })

    const forcedType = typeRaw ? (String(typeRaw) as ProductType) : null

    const buf = Buffer.from(await file.arrayBuffer())
    const parsed = parseVendorFile(buf, file.name, { forcedType })

    if (!parsed.rows.length) {
      return NextResponse.json(
        { error: '檔案裡讀不到資料，請確認第一列是欄位標題' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdmin()
    const { data: job, error: jobErr } = await supabase
      .from('import_jobs')
      .insert({
        filename: file.name,
        supplier_id: supplierId,
        product_type: forcedType,
        status: 'enriching',
        total_rows: parsed.rows.length,
        mapping: parsed.mapping,
        headers: parsed.headers,
        created_by: String(scope.adminId ?? ''),
      })
      .select('id')
      .single()

    if (jobErr || !job) {
      return NextResponse.json({ error: jobErr?.message ?? '建立工作失敗' }, { status: 500 })
    }

    const rows = parsed.rows.map(r => ({
      job_id: job.id,
      row_no: r.rowNo,
      // supplier_id 在這裡就寫進去，之後匯入時不用再猜
      product: { ...r.product, supplier_id: supplierId },
      prizes: r.prizes,
      filled: r.filled,
      warnings: r.warnings,
      status: 'pending',
    }))

    // 一次塞完。100 筆商品的 payload 大約幾百 KB，不需要分批
    const { error: rowErr } = await supabase.from('import_job_rows').insert(rows)
    if (rowErr) {
      await supabase.from('import_jobs')
        .update({ status: 'failed', error: rowErr.message }).eq('id', job.id)
      return NextResponse.json({ error: rowErr.message }, { status: 500 })
    }

    await logAdminAction({
      adminId: scope.adminId,
      action: '建立商品補齊工作',
      targetType: 'import_jobs',
      targetId: String(job.id),
      detail: { filename: file.name, rows: rows.length, supplierId, type: forcedType },
      ip: getClientIp(request),
    })

    return NextResponse.json({
      id: job.id,
      total: rows.length,
      mapping: parsed.mapping,
      headers: parsed.headers,
      prizeLayout: parsed.prizeLayout,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '上傳失敗' }, { status: 500 })
  }
}
