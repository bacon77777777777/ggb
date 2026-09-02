import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { r2PresignPut } from '@/lib/r2'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 影片直傳用的簽名網址。
 *
 * 圖片走 /api/admin/upload（伺服器收檔→壓成 WebP→上傳），影片不行：
 * Vercel serverless 的 request body 上限 4.5MB，而過場影片動輒 4～7MB。
 * 這支只發簽名，檔案由瀏覽器 PUT 直接送到 R2。
 *
 * 只開放影片，而且限 200MB —— 簽名網址等於一張短期的寫入許可證，
 * 不設限就是把 bucket 的寫入權開給任何拿得到 admin session 的人。
 */
const ALLOWED = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_BYTES = 200 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: '請重新登入（session 已過期）' }, { status: 401 })

    const { contentType, size, ext } = await request.json() as
      { contentType?: string; size?: number; ext?: string }

    if (!contentType || !ALLOWED.includes(contentType)) {
      return NextResponse.json({ error: '只接受 MP4、WebM、MOV 影片' }, { status: 400 })
    }
    if (!size || size > MAX_BYTES) {
      return NextResponse.json({ error: '影片不能超過 200MB' }, { status: 400 })
    }

    // 副檔名只取安全字元，避免路徑被塞奇怪的東西
    const safeExt = (ext || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4'
    const key = `products/video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
    const { uploadUrl, publicUrl } = await r2PresignPut(key, contentType)

    await logAdminAction({
      adminId: session.adminId,
      action: '取得影片上傳簽名',
      detail: { url: publicUrl, size },
      ip: getClientIp(request),
    })
    return NextResponse.json({ uploadUrl, publicUrl })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '簽名失敗'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
