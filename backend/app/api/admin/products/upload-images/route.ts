import { NextResponse } from 'next/server'
import { requireAdminScope } from '@/lib/requireAdmin'
import { r2Upload } from '@/lib/r2'
import { compressToWebP } from '@/lib/imageCompress'
import { vendorImagePrefix } from '@/lib/vendorImageResolve'
import AdmZip from 'adm-zip'
import path from 'path'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export const runtime = 'nodejs'
export const maxDuration = 300

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
/** 一次最多這麼多張。超過就先擋，不要跑到一半逾時、還不知道傳到哪 */
const MAX_FILES = 800

/**
 * 廠商圖片壓縮檔上傳（「批量新增」彈窗的第二個框）
 *
 * ## key 一定要帶批次
 *
 * 舊版一律存成 `products/<原檔名>`，撞名就是**直接覆蓋、無警告、無版本**
 * （實測：同一個 key 傳兩次，第一張直接消失）。廠商的 zip 裡本來就都是
 * `1.jpg`、`main.jpg`，十家廠商一起供貨必撞；更糟的是已上架商品的
 * image_url 指著那個 key，圖會在某天被別人的檔案默默換掉。
 *
 *   products/vendor/<廠商id>/<批次>/<zip 裡的相對路徑>
 *
 * 全站唯一的部分（廠商、批次）我們自己產，廠商只要在他那一批裡不重複就好。
 *
 * ⚠️ **不要用 basename 壓平資料夾**：zip 裡的 `A賞/1.jpg` 與 `B賞/1.jpg`
 * 壓平之後是同一個 key，後者蓋掉前者。保留相對路徑，CSV 就寫 `A賞/1.jpg`。
 */
export async function POST(req: Request) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('zip') as File | null
  if (!file) return NextResponse.json({ error: '沒有收到壓縮檔' }, { status: 400 })

  let supplierId = formData.get('supplierId') ? Number(formData.get('supplierId')) : null
  if (scope.supplierScope !== undefined) supplierId = scope.supplierScope
  if (!supplierId) return NextResponse.json({ error: '請先選擇廠商' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  let zip: AdmZip
  try {
    zip = new AdmZip(buffer)
  } catch {
    return NextResponse.json({ error: '無法讀取壓縮檔，請確認是 .zip 格式' }, { status: 400 })
  }

  const images = zip.getEntries().filter(e =>
    !e.isDirectory
    // macOS 壓縮會塞一份 __MACOSX/._foo.jpg 的資源分支，那不是圖
    && !e.entryName.startsWith('__MACOSX/')
    && !path.basename(e.entryName).startsWith('._')
    && IMAGE_EXTS.has(path.extname(e.entryName).toLowerCase()))

  if (images.length === 0) {
    return NextResponse.json({ error: '壓縮檔裡沒有圖片（支援 jpg / png / webp / gif）' }, { status: 400 })
  }
  if (images.length > MAX_FILES) {
    return NextResponse.json({ error: `一次最多 ${MAX_FILES} 張，這包有 ${images.length} 張，請分批` }, { status: 400 })
  }

  // 批次代號用台灣時間，肉眼看得出是哪天傳的
  const now = new Date()
  const tw = new Date(now.getTime() + 8 * 3600_000).toISOString()
  const batch = `${tw.slice(0, 10).replace(/-/g, '')}-${tw.slice(11, 16).replace(':', '')}`
  const prefix = vendorImagePrefix(supplierId, batch)

  const results: { name: string; url: string }[] = []
  const errors:  { name: string; error: string }[] = []

  for (const entry of images) {
    const rel = entry.entryName.replace(/\\/g, '/')
    try {
      const compressed = await compressToWebP(entry.getData(), 'products')
      const url = await r2Upload(prefix + rel, compressed, 'image/webp')
      results.push({ name: rel, url })
    } catch (e: any) {
      errors.push({ name: rel, error: String(e?.message || e) })
    }
  }

  // zip 內部自己就有同名檔（不同資料夾）時提醒一聲 —— CSV 只寫檔名的話會分不出來
  const seen = new Map<string, number>()
  for (const r of results) {
    const b = r.name.split('/').pop()!
    seen.set(b, (seen.get(b) ?? 0) + 1)
  }
  const dupBasenames = [...seen.entries()].filter(([, n]) => n > 1).map(([b]) => b)

  await logAdminAction({
    adminId: scope.adminId,
    action: '上傳商品圖片',
    targetType: 'product',
    detail: { supplierId, batch, uploaded: results.length, failed: errors.length },
    ip: getClientIp(req),
  })

  return NextResponse.json({
    ok: true,
    batch,
    uploaded: results.length,
    failed:   errors.length,
    files:    results,
    errors:   errors.slice(0, 5),
    duplicateBasenames: dupBasenames.slice(0, 10),
  })
}
