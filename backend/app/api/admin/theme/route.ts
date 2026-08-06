import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { DEFAULT_PALETTE, derivePalette, hexToRgb, type ThemePalette } from '@/lib/theme'

/**
 * 前台主題色
 *
 * 存的是推導後的四個值（見 lib/theme.ts）。前台只讀不算，
 * 所以這裡務必把四個都寫進去，不能只存主色。
 */

const KEYS = {
  primary: 'theme_primary',
  dark: 'theme_primary_dark',
  light: 'theme_primary_light',
  soft: 'theme_primary_soft',
} as const

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await getSupabaseAdmin()
    .from('platform_settings').select('key, value').in('key', Object.values(KEYS))

  const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
  const palette: ThemePalette = {
    primary: map[KEYS.primary] || DEFAULT_PALETTE.primary,
    dark:    map[KEYS.dark]    || DEFAULT_PALETTE.dark,
    light:   map[KEYS.light]   || DEFAULT_PALETTE.light,
    soft:    map[KEYS.soft]    || DEFAULT_PALETTE.soft,
  }
  // isDefault 用來決定要不要顯示「還原預設」—— 沒設定過就沒東西好還原
  return NextResponse.json({ palette, isDefault: !map[KEYS.primary] })
}

export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()

    // reset：把四筆刪掉，前台就回去用 globals.css 的預設值。
    // 刻意不是「把預設色寫進去」—— 那樣之後改預設色時，設定過的站台不會跟著更新
    if (body?.reset === true) {
      const { error } = await getSupabaseAdmin()
        .from('platform_settings').delete().in('key', Object.values(KEYS))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await logAdminAction({
        adminId: session.adminId,
        action: '還原前台主題色',
        targetType: 'platform_settings',
        targetId: 'theme',
        ip: getClientIp(request),
      })
      return NextResponse.json({ palette: DEFAULT_PALETTE, isDefault: true })
    }

    const base = String(body?.primary ?? '')
    if (!hexToRgb(base)) {
      return NextResponse.json({ error: '色碼格式不正確，請用 #RRGGBB' }, { status: 400 })
    }

    const palette = derivePalette(base)
    const rows = (Object.keys(KEYS) as (keyof typeof KEYS)[]).map(k => ({
      key: KEYS[k],
      value: palette[k],
    }))

    const { error } = await getSupabaseAdmin()
      .from('platform_settings').upsert(rows, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId,
      action: '修改前台主題色',
      targetType: 'platform_settings',
      targetId: 'theme',
      detail: palette,
      ip: getClientIp(request),
    })

    return NextResponse.json({ palette, isDefault: false })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '儲存失敗' }, { status: 500 })
  }
}
