import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import fs from 'fs'
import path from 'path'

const FEATURE_KEYS = ['sell', 'ichiban', 'blindbox', 'gacha', 'card', 'custom', 'exchange', 'market', 'sell_escrow'] as const
type FeatureKey = (typeof FEATURE_KEYS)[number]

const normalizeBool = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'

const runSqlMigrations = async (connectionString: string, files: string[]) => {
  const { Client } = require('pg') as any
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    for (const f of files) {
      const sqlPath = path.resolve(process.cwd(), 'db/migrations', f)
      if (!fs.existsSync(sqlPath)) continue
      const sql = fs.readFileSync(sqlPath, 'utf8')
      await client.query(sql)
    }
  } finally {
    await client.end()
  }
}

export async function POST() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!connectionString) {
    return NextResponse.json(
      { error: 'Missing SUPABASE_DB_URL (or DATABASE_URL) for direct DB migrations' },
      { status: 500 }
    )
  }

  try {
    await runSqlMigrations(connectionString, [
      '178_feature_flags.sql',
      '180_feature_flags_realtime.sql',
      '182_sell_payment_feature_flag.sql',
      '179_sell_non_custodial.sql',
      '181_sell_listing_views.sql',
      '183_sell_escrow_payments.sql',
    ])
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'bootstrap_failed' }, { status: 500 })
  }
}

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('feature_flags')
    .select('key, enabled, updated_at')
    .in('key', FEATURE_KEYS as unknown as string[])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const flags: Record<FeatureKey, boolean> = FEATURE_KEYS.reduce((acc, k) => {
    acc[k] = true
    return acc
  }, {} as Record<FeatureKey, boolean>)

  for (const row of Array.isArray(data) ? data : []) {
    const key = String((row as any)?.key || '') as FeatureKey
    if (!FEATURE_KEYS.includes(key)) continue
    flags[key] = Boolean((row as any)?.enabled)
  }

  if (flags.exchange && flags.market) flags.market = false

  return NextResponse.json({ flags }, { status: 200 })
}

export async function PUT(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseAdmin = getSupabaseAdmin()
  const body = (await req.json().catch(() => null)) as any
  const inputFlags = (body?.flags || {}) as Record<string, unknown>

  const nextFlags: Record<FeatureKey, boolean> = FEATURE_KEYS.reduce((acc, k) => {
    acc[k] = true
    return acc
  }, {} as Record<FeatureKey, boolean>)

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('feature_flags')
    .select('key, enabled')
    .in('key', FEATURE_KEYS as unknown as string[])

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  for (const row of Array.isArray(existing) ? existing : []) {
    const key = String((row as any)?.key || '') as FeatureKey
    if (!FEATURE_KEYS.includes(key)) continue
    nextFlags[key] = Boolean((row as any)?.enabled)
  }

  for (const k of FEATURE_KEYS) {
    if (!(k in inputFlags)) continue
    nextFlags[k] = normalizeBool(inputFlags[k])
  }

  const wantsMarket = 'market' in inputFlags && normalizeBool(inputFlags.market)
  const wantsExchange = 'exchange' in inputFlags && normalizeBool(inputFlags.exchange)
  if (wantsMarket) nextFlags.exchange = false
  if (wantsExchange) nextFlags.market = false
  if (nextFlags.exchange && nextFlags.market) nextFlags.market = false

  const upserts = FEATURE_KEYS.map((k) => ({
    key: k,
    enabled: nextFlags[k],
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabaseAdmin.from('feature_flags').upsert(upserts as any, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId,
    action: '修改功能開關',
    targetType: 'feature_flags',
    detail: { updated: inputFlags },
    ip: getClientIp(req),
  })

  return NextResponse.json({ flags: nextFlags }, { status: 200 })
}
