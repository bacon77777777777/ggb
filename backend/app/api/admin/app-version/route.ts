import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { revalidateFrontend } from '@/lib/revalidateFrontend'

/**
 * App 版本控制
 *
 * 兩種更新提示是兩件事，設定也分開（見 frontend/components/native/AppUpdateGate.tsx）：
 *
 *   A 網頁版更新 —— 推 frontend 就生效，App 重載 webview 即可，不必送審。
 *      不需要任何設定，前台自己比對 build id。這裡只給一個總開關。
 *   B 原生殼更新 —— 改了 mobile/ 才需要，玩家得去商店下載。
 *      `min_native` 空字串＝不啟用。上架前商店網址還不存在，所以預設留空，
 *      不會有「叫玩家去下載但連結是死的」這種狀況。
 */

const KEYS = {
  webCheck: 'app_web_update_check',       // '1' | '0'
  minNative: 'app_min_native_version',    // '1.0.2'，空＝不啟用
  storeIos: 'app_store_url_ios',
  storeAndroid: 'app_store_url_android',
} as const

/** '1.0.2' → [1,0,2]；看不懂的回 null */
function parseVersion(v: string): number[] | null {
  const t = v.trim()
  if (!t) return null
  if (!/^\d+(\.\d+){0,3}$/.test(t)) return null
  return t.split('.').map(Number)
}

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await getSupabaseAdmin()
    .from('platform_settings').select('key, value').in('key', Object.values(KEYS))
  const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))

  return NextResponse.json({
    // 沒設定過就當開著 —— 網頁版更新是無害的，預設要能用
    webCheck: map[KEYS.webCheck] !== '0',
    minNative: map[KEYS.minNative] ?? '',
    storeIos: map[KEYS.storeIos] ?? '',
    storeAndroid: map[KEYS.storeAndroid] ?? '',
  })
}

export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const minNative = String(body?.minNative ?? '').trim()
    const storeIos = String(body?.storeIos ?? '').trim()
    const storeAndroid = String(body?.storeAndroid ?? '').trim()
    const webCheck = body?.webCheck !== false

    if (minNative && !parseVersion(minNative)) {
      return NextResponse.json({ error: '版本號格式不正確，請用 1.0.2 這種寫法' }, { status: 400 })
    }
    /*
     * 設了門檻卻沒有商店網址＝玩家會看到一個不給關、按了也沒反應的彈窗。
     * 兩個平台各自檢查：只上架 iOS 的階段，Android 沒填是正常的。
     */
    if (minNative && !storeIos && !storeAndroid) {
      return NextResponse.json(
        { error: '設了最低原生版本就必須至少填一個商店網址，否則玩家會被擋在沒有出口的彈窗裡' },
        { status: 400 },
      )
    }

    const rows = [
      { key: KEYS.webCheck, value: webCheck ? '1' : '0' },
      { key: KEYS.minNative, value: minNative },
      { key: KEYS.storeIos, value: storeIos },
      { key: KEYS.storeAndroid, value: storeAndroid },
    ]
    const { error } = await getSupabaseAdmin()
      .from('platform_settings').upsert(rows, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId,
      action: '修改 App 版本設定',
      targetType: 'platform_settings',
      targetId: 'app_version',
      detail: { webCheck, minNative, storeIos, storeAndroid },
      ip: getClientIp(request),
    })

    // 前台的 /api/app-version 有邊緣快取，改完要讓它重新讀
    await revalidateFrontend('app-version')

    return NextResponse.json({ webCheck, minNative, storeIos, storeAndroid })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '儲存失敗' }, { status: 500 })
  }
}
