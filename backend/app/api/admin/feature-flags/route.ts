import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import fs from 'fs'
import path from 'path'

// 沒列在這裡的 key 會被 PUT 默默濾掉，而且回傳的 flags 也不含它 ——
// 前端拿回傳值蓋回 state，看起來就是「按了又自己彈回開啟」。
// 新增開關時務必同步加進來
const FEATURE_KEYS = ['sell', 'ichiban', 'blindbox', 'gacha', 'card', 'custom', 'slot', 'exchange', 'market', 'sell_escrow', 'recharge'] as const
type FeatureKey = (typeof FEATURE_KEYS)[number]

const normalizeBool = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'

/**
 * 類別的三態（migration 483）。
 *
 * enabled 這個布林分不出「暫時停一下」跟「不做了」，但對玩家差很多：
 * 維護中該讓他看得到、知道會回來；關閉該完全消失，不要留一個點不動的入口。
 *
 * DB 端有 trigger 讓 enabled 永遠等於 (state = 'on')，所以這裡回傳的 flags
 * 仍然是既有讀取端要的那個布林，states 只是多給前台一個判斷依據。
 */
const VALID_STATES = ['on', 'maintenance', 'off'] as const
type FlagState = (typeof VALID_STATES)[number]
const normalizeState = (v: unknown, fallback: FlagState): FlagState =>
  VALID_STATES.includes(v as FlagState) ? (v as FlagState) : fallback

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
    .select('key, enabled, state, updated_at')
    .in('key', FEATURE_KEYS as unknown as string[])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const flags: Record<FeatureKey, boolean> = FEATURE_KEYS.reduce((acc, k) => {
    acc[k] = true
    return acc
  }, {} as Record<FeatureKey, boolean>)
  const states: Record<FeatureKey, FlagState> = FEATURE_KEYS.reduce((acc, k) => {
    acc[k] = 'on'
    return acc
  }, {} as Record<FeatureKey, FlagState>)

  for (const row of Array.isArray(data) ? data : []) {
    const key = String((row as any)?.key || '') as FeatureKey
    if (!FEATURE_KEYS.includes(key)) continue
    flags[key] = Boolean((row as any)?.enabled)
    states[key] = normalizeState((row as any)?.state, flags[key] ? 'on' : 'off')
  }

  if (flags.exchange && flags.market) flags.market = false

  return NextResponse.json({ flags, states }, { status: 200 })
}

export async function PUT(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseAdmin = getSupabaseAdmin()
  const body = (await req.json().catch(() => null)) as any
  const inputFlags = (body?.flags || {}) as Record<string, unknown>
  const inputStates = (body?.states || {}) as Record<string, unknown>

  const nextStates: Record<FeatureKey, FlagState> = FEATURE_KEYS.reduce((acc, k) => {
    acc[k] = 'on'
    return acc
  }, {} as Record<FeatureKey, FlagState>)

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('feature_flags')
    .select('key, enabled, state')
    .in('key', FEATURE_KEYS as unknown as string[])

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  for (const row of Array.isArray(existing) ? existing : []) {
    const key = String((row as any)?.key || '') as FeatureKey
    if (!FEATURE_KEYS.includes(key)) continue
    nextStates[key] = normalizeState((row as any)?.state, (row as any)?.enabled ? 'on' : 'off')
  }

  // flags（布林）與 states（三態）都收。舊呼叫端只送 flags，
  // 這時 false 不該把「維護中」降級成「關閉」—— 維持原本的狀態就好
  for (const k of FEATURE_KEYS) {
    if (k in inputStates) {
      nextStates[k] = normalizeState(inputStates[k], nextStates[k])
    } else if (k in inputFlags) {
      const on = normalizeBool(inputFlags[k])
      nextStates[k] = on ? 'on' : (nextStates[k] === 'maintenance' ? 'maintenance' : 'off')
    }
  }

  const nextFlags: Record<FeatureKey, boolean> = FEATURE_KEYS.reduce((acc, k) => {
    acc[k] = nextStates[k] === 'on'
    return acc
  }, {} as Record<FeatureKey, boolean>)

  const upserts = FEATURE_KEYS.map((k) => ({
    key: k,
    enabled: nextFlags[k],
    state: nextStates[k],
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabaseAdmin.from('feature_flags').upsert(upserts as any, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId,
    action: '修改功能開關',
    targetType: 'feature_flags',
    detail: { updated: { ...inputFlags, ...inputStates } },
    ip: getClientIp(req),
  })

  return NextResponse.json({ flags: nextFlags, states: nextStates }, { status: 200 })
}
