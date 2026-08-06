import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

/**
 * 維護模式設定
 *
 * scope 的四種值：
 *   off       正常營運
 *   frontend  只關前台（玩家看到維護頁，後台照常運作 —— 這是最常用的）
 *   backend   只關後台（前台照常，用於後台自己要改東西時）
 *   all       兩邊都關
 *
 * 分開兩邊是因為維護的原因通常只影響一邊：改前台版面不用把後台鎖起來，
 * 而後台在改資料時前台反而更需要能正常運作。
 */

const KEYS = ['maintenance_scope', 'maintenance_message', 'maintenance_until', 'maintenance_bypass_key'] as const
const VALID_SCOPES = ['off', 'frontend', 'backend', 'all']

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await getSupabaseAdmin()
    .from('platform_settings').select('key, value').in('key', KEYS as unknown as string[])

  const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
  return NextResponse.json({
    scope:      map.maintenance_scope   ?? 'off',
    message:    map.maintenance_message ?? '',
    until:      map.maintenance_until   ?? '',
    bypassKey:  map.maintenance_bypass_key ?? '',
  })
}

export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const scope = String(body?.scope ?? 'off')
    if (!VALID_SCOPES.includes(scope)) {
      return NextResponse.json({ error: '無效的維護範圍' }, { status: 400 })
    }

    // 關後台只有超級管理員能做 —— 因為只有超級管理員不受後台維護限制。
    // 一般管理員按下去會把自己鎖在外面，而且沒有辦法再進來解除。
    // 目前只有超級管理員拿得到 settings_features 權限，但那是權限設定的巧合，
    // 不是規則；權限一改就會變成陷阱，所以在這裡寫死。
    const isSuper = session.role === 'super_admin' || session.role === 'superadmin'
    if ((scope === 'backend' || scope === 'all') && !isSuper) {
      return NextResponse.json(
        { error: '只有超級管理員可以關閉後台，否則你會把自己鎖在外面' },
        { status: 403 },
      )
    }

    const supabase = getSupabaseAdmin()
    const rows: { key: string; value: string }[] = [
      { key: 'maintenance_scope',   value: scope },
      { key: 'maintenance_message', value: String(body?.message ?? '').slice(0, 500) },
      { key: 'maintenance_until',   value: String(body?.until ?? '') },
    ]

    // 每次「開啟」維護都換一把新的繞過金鑰。
    // 舊金鑰種在別人瀏覽器裡的 cookie 會存 8 小時，不換的話上次維護時
    // 給過連結的人這次也進得來
    if (scope !== 'off' && body?.rotateKey !== false) {
      rows.push({ key: 'maintenance_bypass_key', value: crypto.randomBytes(12).toString('hex') })
    }

    const { error } = await supabase.from('platform_settings').upsert(rows, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId,
      action: scope === 'off' ? '解除維護模式' : '啟動維護模式',
      targetType: 'platform_settings',
      targetId: scope,
      detail: { scope, until: body?.until ?? '' },
      ip: getClientIp(request),
    })

    const { data } = await supabase
      .from('platform_settings').select('value').eq('key', 'maintenance_bypass_key').maybeSingle()

    return NextResponse.json({ ok: true, bypassKey: data?.value ?? '' })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '儲存失敗' }, { status: 500 })
  }
}
