import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { seedBotDraws } from '@/lib/seedBotDraws'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await seedBotDraws()
  return NextResponse.json(result)
}
