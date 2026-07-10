import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET 未設定' }, { status: 500 })

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://admin.ggb.com.tw'
  const res = await fetch(`${base}/api/cron/generate-content`, {
    method:  'POST',
    headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' },
    body:    '{}',
  })

  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    await logAdminAction({ adminId: session.adminId, action: '手動生成AI文案', targetType: 'content_drafts', ip: getClientIp(req) })
  }
  return NextResponse.json(data, { status: res.status })
}
