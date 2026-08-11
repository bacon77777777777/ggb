import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * 「其他設定」的六位代碼驗證
 *
 * 代碼放 env（`OTHER_SETTINGS_CODE`），不進前端 bundle —— 寫在前端等於
 * 沒鎖，任何人打開 devtools 就看得到。沒設 env 時用預設值，方便本機開發。
 *
 * 這一關是「多一道手續、避免手滑點進去」，不是權限控制 ——
 * 權限仍由 requireAdminSession 與側欄的角色過濾負責。
 */
const FALLBACK_CODE = '168168'

export async function POST(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json().catch(() => ({ code: '' }))
  const expected = process.env.OTHER_SETTINGS_CODE || FALLBACK_CODE
  if (typeof code !== 'string' || code !== expected) {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
  return NextResponse.json({ ok: true })
}
