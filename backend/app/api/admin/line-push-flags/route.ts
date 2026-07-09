import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { LINE_PUSH_KEYS, LinePushKey } from '@/lib/linePush'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from('feature_flags')
    .select('key, enabled')
    .in('key', LINE_PUSH_KEYS as unknown as string[])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const flags = LINE_PUSH_KEYS.reduce((acc, k) => {
    acc[k] = true // 預設開啟
    return acc
  }, {} as Record<LinePushKey, boolean>)

  for (const row of Array.isArray(data) ? data : []) {
    const key = String((row as any)?.key || '') as LinePushKey
    if (!LINE_PUSH_KEYS.includes(key)) continue
    flags[key] = Boolean((row as any)?.enabled)
  }

  return NextResponse.json({ flags }, { status: 200 })
}

export async function PUT(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as any
  const inputFlags = (body?.flags || {}) as Record<string, unknown>

  const upserts = LINE_PUSH_KEYS
    .filter(k => k in inputFlags)
    .map(k => ({
      key: k,
      enabled: inputFlags[k] === true || inputFlags[k] === 'true' || inputFlags[k] === 1,
      updated_at: new Date().toISOString(),
    }))

  if (upserts.length === 0) return NextResponse.json({ success: true }, { status: 200 })

  const { error } = await getSupabaseAdmin().from('feature_flags').upsert(upserts as any, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId,
    action: '修改 GB哥推播開關',
    targetType: 'feature_flags',
    detail: { updated: inputFlags },
    ip: getClientIp(req),
  })

  // Return updated flags
  const { data } = await getSupabaseAdmin()
    .from('feature_flags')
    .select('key, enabled')
    .in('key', LINE_PUSH_KEYS as unknown as string[])

  const flags = LINE_PUSH_KEYS.reduce((acc, k) => {
    acc[k] = true
    return acc
  }, {} as Record<LinePushKey, boolean>)

  for (const row of Array.isArray(data) ? data : []) {
    const key = String((row as any)?.key || '') as LinePushKey
    if (!LINE_PUSH_KEYS.includes(key)) continue
    flags[key] = Boolean((row as any)?.enabled)
  }

  return NextResponse.json({ flags }, { status: 200 })
}
