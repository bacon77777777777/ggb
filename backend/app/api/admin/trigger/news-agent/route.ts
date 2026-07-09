import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const secret = process.env.CRON_SECRET ?? ''
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })

  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://admin.ggb.com.tw'
  const res = await fetch(`${baseUrl}/api/cron/news-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': secret,
    },
    body: JSON.stringify({ limit: 5 }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) return NextResponse.json({ error: data?.error ?? '生成失敗' }, { status: res.status })
  return NextResponse.json(data)
}
