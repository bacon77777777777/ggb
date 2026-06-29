import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await request.formData()
    const file = form.get('file')
    const bucket = String(form.get('bucket') || 'products')
    const path = String(form.get('path') || '')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少檔案' }, { status: 400 })
    }
    if (!path) {
      return NextResponse.json({ error: '缺少 path' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const arrayBuffer = await file.arrayBuffer()
    const buf = new Uint8Array(arrayBuffer)

    const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, buf, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    })
    if (uploadError) throw uploadError

    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
    return NextResponse.json({ publicUrl: data.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '上傳失敗' }, { status: 500 })
  }
}

