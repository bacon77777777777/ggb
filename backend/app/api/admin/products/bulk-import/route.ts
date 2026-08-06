import { NextResponse } from 'next/server'
import { requireAdminScope } from '@/lib/requireAdmin'
import { parseVendorFile } from '@/lib/vendorFileParse'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * 批量上架
 *
 * 吃「已經是標準格式」的檔案直接建立商品 —— 通常是「商品補齊」頁下載的那份 CSV。
 * 不查網路、不補齊，解析完就寫。
 *
 * 上架本身轉呼叫既有的 import/commit，不重寫 —— 那支已經處理好籤號封存、
 * 系列推斷、廠商欄位強制覆蓋、欄位白名單。兩套並存遲早會有一套過時。
 */
export async function POST(request: Request) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 })

    let supplierId = form.get('supplierId') ? Number(form.get('supplierId')) : null
    if (scope.supplierScope !== undefined) supplierId = scope.supplierScope
    if (!supplierId) return NextResponse.json({ error: '請先選擇廠商' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const parsed = parseVendorFile(buf, file.name)
    if (!parsed.rows.length) {
      return NextResponse.json({ error: '檔案裡讀不到資料，請確認第一列是欄位標題' }, { status: 400 })
    }

    const origin = new URL(request.url).origin
    const res = await fetch(`${origin}/api/admin/products/import/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({
        products: parsed.rows.map(r => ({
          row: r.rowNo,
          product: { ...r.product, supplier_id: supplierId },
          prizes: r.prizes,
        })),
      }),
    })
    const json = await res.json()
    if (!res.ok) return NextResponse.json({ error: json?.error ?? '上架失敗' }, { status: res.status })
    await logAdminAction({
    adminId: scope.adminId,
    action: '批量上架商品',
    targetType: 'product',
    detail: { result: json },
    ip: getClientIp(request),
  })

  return NextResponse.json(json)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '上架失敗' }, { status: 500 })
  }
}
