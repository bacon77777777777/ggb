import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import sharp from 'sharp'
import { r2Upload } from '@/lib/r2'

export const runtime = 'nodejs'

const OPTS: Record<string, { w: number; h: number; q: number }> = {
  avatars:     { w: 200, h: 200, q: 85 },
  marketplace: { w: 800, h: 800, q: 85 },
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await request.formData()
    const file = form.get('file')
    const bucket = String(form.get('bucket') || 'avatars')
    const filePath = String(form.get('path') || '')

    if (!(file instanceof File) || !filePath) {
      return NextResponse.json({ error: '缺少參數' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const { w, h, q } = OPTS[bucket] ?? { w: 800, h: 800, q: 85 }
    const compressed = await sharp(buf)
      .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: q })
      .toBuffer()

    const noExt = filePath.replace(/\.[^.]+$/, '')
    const key = `${bucket}/${noExt}.webp`
    const publicUrl = await r2Upload(key, compressed, 'image/webp')

    return NextResponse.json({ publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '上傳失敗' }, { status: 500 })
  }
}
