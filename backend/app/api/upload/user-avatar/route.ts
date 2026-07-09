import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { r2Upload } from '@/lib/r2'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: Request) {
  try {
    // 驗證 Supabase JWT（前台傳 Bearer token）
    const auth = request.headers.get('authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: '缺少 file' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const compressed = await sharp(buf)
      .resize({ width: 400, height: 400, fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()

    const key = `avatars/${user.id}-${Date.now()}.webp`
    const publicUrl = await r2Upload(key, compressed, 'image/webp')

    return NextResponse.json({ publicUrl })
  } catch (e: any) {
    console.error('[user-avatar upload]', e)
    return NextResponse.json({ error: e?.message || '上傳失敗' }, { status: 500 })
  }
}
