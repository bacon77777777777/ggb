import { NextResponse } from 'next/server'
import { requireAdminScope } from '@/lib/requireAdmin'
import { parseVendorFile } from '@/lib/vendorFileParse'
import { buildImageResolver } from '@/lib/vendorImageResolve'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * 批量新增（一次建立多筆商品）
 *
 * 吃「已經是標準格式」的檔案直接建立商品 —— 通常是「商品補齊」頁下載的那份 CSV，
 * 或廠商自己照範本填的表。不查網路、不補齊。
 *
 * 上架本身轉呼叫既有的 import/commit，不重寫 —— 那支已經處理好籤號封存、
 * 系列推斷、廠商欄位強制覆蓋、欄位白名單。兩套並存遲早會有一套過時。
 *
 * ## 圖片欄位一定要在這裡解掉
 *
 * `parseVendorFile` 刻意把圖片欄位原樣留著（它不往外查）。在補上這段之前，
 * 廠商寫 `1.jpg` 就會**原字串寫進 image_url**，前台直接破圖，而且沒有任何警告
 * —— 只有「商品補齊」那條路徑會呼叫 resolveVendorImage，批量新增從來沒有。
 *
 * 對不上的處理方式：
 *   主圖對不上   → 整列擋下來（沒有主圖的商品不該進資料庫）
 *   品項圖對不上 → 那張設 null 並回報，不擋整列
 *     （commit 本來就刻意不做全有全無：一百筆裡三筆壞掉，
 *       應該是那三筆留下來給人修，不是九十七筆一起退回去）
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

    // 同一次交付上傳的那包圖。沒有也能跑（CSV 裡本來就是完整網址的情況）
    const batch = form.get('batch') ? String(form.get('batch')) : null

    const buf = Buffer.from(await file.arrayBuffer())
    const parsed = parseVendorFile(buf, file.name)
    if (!parsed.rows.length) {
      return NextResponse.json({ error: '檔案裡讀不到資料，請確認第一列是欄位標題' }, { status: 400 })
    }

    const resolver = await buildImageResolver(supplierId, batch)

    const products: unknown[] = []
    const imageErrors: { row?: number; name: string; error: string }[] = []
    let prizeImagesDropped = 0

    for (const r of parsed.rows) {
      const name = String(r.product?.name ?? '').trim() || `第 ${r.rowNo} 列`

      const main = resolver.resolve(r.product?.image_url as string | undefined)
      if (main.error) {
        imageErrors.push({ row: r.rowNo, name, error: `主圖 ${main.error}` })
        continue
      }

      const prizes = (r.prizes ?? []).map(p => {
        const got = resolver.resolve(p.image_url as string | undefined)
        if (got.error) {
          prizeImagesDropped++
          imageErrors.push({ row: r.rowNo, name, error: `品項「${p.name ?? ''}」的 ${got.error}` })
        }
        return { ...p, image_url: got.url }
      })

      products.push({
        row: r.rowNo,
        product: { ...r.product, image_url: main.url, supplier_id: supplierId },
        prizes,
      })
    }

    if (products.length === 0) {
      return NextResponse.json({
        error: '每一列的主圖都對不回圖庫，沒有東西可以新增',
        imageErrors: imageErrors.slice(0, 10),
      }, { status: 400 })
    }

    const origin = new URL(request.url).origin
    const res = await fetch(`${origin}/api/admin/products/import/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({ products }),
    })
    const json = await res.json()
    if (!res.ok) return NextResponse.json({ error: json?.error ?? '新增失敗' }, { status: res.status })

    await logAdminAction({
      adminId: scope.adminId,
      action: '批量新增商品',
      targetType: 'product',
      detail: { supplierId, batch, result: json, imageErrors: imageErrors.length },
      ip: getClientIp(request),
    })

    return NextResponse.json({
      ...json,
      // 主圖對不上被擋掉的列
      skipped: parsed.rows.length - products.length,
      prizeImagesDropped,
      imageErrors: imageErrors.slice(0, 10),
      imageLibrary: resolver.stats,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '新增失敗' }, { status: 500 })
  }
}
