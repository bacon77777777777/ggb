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

    /*
     * 越權寫入防護（資安審查 2026-08-21）：
     * bucket、path 原本完全由前端決定，任何登入者可傳 bucket=products、
     * path=<某商品主圖 key> 覆蓋掉全站商品／輪播圖（R2 是 PROD/STG 共用）。
     * 這裡強制：
     *   1. bucket 只能是玩家能寫的兩個（avatars／marketplace），products/banners
     *      這種後台才寫的一律拒絕
     *   2. path 一律以呼叫者自己的 user.id 為前綴 —— 蓋不到別人的檔
     * 兩個既有呼叫端（商城上架表單）本來就送 marketplace + `${user.id}/...`，不受影響。
     */
    if (bucket !== 'avatars' && bucket !== 'marketplace') {
      return NextResponse.json({ error: '不允許的儲存位置' }, { status: 403 })
    }
    const cleanPath = filePath.replace(/^\/+/, '')
    if (cleanPath !== user.id && !cleanPath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: '不允許的路徑' }, { status: 403 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const { w, h, q } = OPTS[bucket] ?? { w: 800, h: 800, q: 85 }
    const compressed = await sharp(buf)
      .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: q })
      .toBuffer()

    const noExt = cleanPath.replace(/\.[^.]+$/, '')
    const key = `${bucket}/${noExt}.webp`
    const publicUrl = await r2Upload(key, compressed, 'image/webp')

    return NextResponse.json({ publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '上傳失敗' }, { status: 500 })
  }
}
