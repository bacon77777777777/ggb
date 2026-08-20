import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { r2Upload } from '@/lib/r2'
import { compressToWebP } from '@/lib/imageCompress'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: '請重新登入（session 已過期）' }, { status: 401 })

    const form = await request.formData()
    const file = form.get('file')
    const bucket = String(form.get('bucket') || 'products')
    const filePath = String(form.get('path') || '')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少檔案' }, { status: 400 })
    }
    if (!filePath) {
      return NextResponse.json({ error: '缺少 path' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())

    // raw=1：原圖直傳不壓縮（機台 sprite 組圖等像素精度素材用）
    if (String(form.get('raw') || '') === '1') {
      const key = `${bucket}/${filePath}`
      const publicUrl = await r2Upload(key, buf, file.type || 'image/png')
      await logAdminAction({
      adminId: session.adminId,
      action: '上傳檔案',
      detail: { url: publicUrl },
      ip: getClientIp(request),
    })
    return NextResponse.json({ publicUrl })
    }

    /*
     * 壓縮參數預設看 bucket，但可以用 preset 覆蓋 —— 存放位置與壓縮尺寸是
     * 兩件事。App 開屏圖就是這種：檔案存在 banners/ 底下（同一個後台頁管理），
     * 尺寸卻要用直式滿版的 app_splash，不能吃 banners 的 1200x400。
     */
    const preset = String(form.get('preset') || '') || bucket
    const compressed = await compressToWebP(buf, preset)
    const noExt = filePath.replace(/\.[^.]+$/, '')
    const key = `${bucket}/${noExt}.webp`
    const publicUrl = await r2Upload(key, compressed, 'image/webp')

    await logAdminAction({
      adminId: session.adminId,
      action: '上傳檔案',
      detail: { url: publicUrl },
      ip: getClientIp(request),
    })
    return NextResponse.json({ publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '上傳失敗' }, { status: 500 })
  }
}

