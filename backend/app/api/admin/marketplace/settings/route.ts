import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 交易所設定（migration 669）。
 *
 * 四個鍵都存在 platform_settings，前台讀得到（669 把 `marketplace_%` 加進公開讀政策）——
 * 玩家要在按下上架之前就知道規則，不是填完價格才被 RPC 打回票。
 *
 * ⚠️ 賞等白名單的實際把關在 DB 的 create_listing → marketplace_level_allowed。
 * 這裡只是寫設定，前台藏不藏按鈕不影響能不能上架。
 */
const KEYS = [
  'marketplace_fee_percent',
  'marketplace_allowed_levels',
  'marketplace_min_price',
  'marketplace_max_price',
] as const

type Key = (typeof KEYS)[number]

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await getSupabaseAdmin()
      .from('platform_settings')
      .select('key, value')
      .in('key', KEYS as unknown as string[])
    if (error) throw error

    const map: Record<string, string> = {}
    for (const row of data ?? []) map[(row as any).key] = String((row as any).value ?? '')
    return NextResponse.json(map)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as Partial<Record<Key, unknown>>

    const fee = Number(body.marketplace_fee_percent)
    const min = Number(body.marketplace_min_price)
    const max = Number(body.marketplace_max_price)
    const levels = body.marketplace_allowed_levels

    if (!Number.isFinite(fee) || fee < 0 || fee > 50) {
      return NextResponse.json({ error: '手續費要在 0～50% 之間' }, { status: 400 })
    }
    if (!Number.isFinite(min) || min < 1) {
      return NextResponse.json({ error: '最低售價要大於 0' }, { status: 400 })
    }
    if (!Number.isFinite(max) || max < min) {
      return NextResponse.json({ error: '最高售價不能低於最低售價' }, { status: 400 })
    }
    if (!Array.isArray(levels)) {
      return NextResponse.json({ error: '可上架賞等格式錯誤' }, { status: 400 })
    }
    // 空陣列在 DB 端等同「不限制」（退回 is_major_grade）。那不是老闆按下儲存時的本意，
    // 所以擋在這裡 —— 真要開放全部就把賞等全部勾起來
    if (levels.length === 0) {
      return NextResponse.json({ error: '至少要開放一個賞等' }, { status: 400 })
    }

    const rows: { key: string; value: string }[] = [
      { key: 'marketplace_fee_percent', value: String(Math.round(fee)) },
      { key: 'marketplace_min_price', value: String(Math.round(min)) },
      { key: 'marketplace_max_price', value: String(Math.round(max)) },
      { key: 'marketplace_allowed_levels', value: JSON.stringify(levels.map(String)) },
    ]

    const supabaseAdmin = getSupabaseAdmin()
    for (const row of rows) {
      const { error } = await supabaseAdmin
        .from('platform_settings')
        .upsert(row as any, { onConflict: 'key' })
      if (error) throw error
    }

    await logAdminAction({
      adminId: session.adminId,
      action: '更新交易所設定',
      targetType: 'platform_settings',
      detail: Object.fromEntries(rows.map(r => [r.key, r.value])),
      ip: getClientIp(request),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '儲存失敗' }, { status: 500 })
  }
}
