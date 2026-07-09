import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { r2Upload } from '@/lib/r2'
import { compressToWebP } from '@/lib/imageCompress'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    const compressed = await compressToWebP(buf, bucket)
    const noExt = filePath.replace(/\.[^.]+$/, '')
    const key = `${bucket}/${noExt}.webp`
    const publicUrl = await r2Upload(key, compressed, 'image/webp')

    return NextResponse.json({ publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '上傳失敗' }, { status: 500 })
  }
}

