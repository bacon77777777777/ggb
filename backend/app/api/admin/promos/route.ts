import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

const TABLE = 'site_promos'

/**
 * 只允許前端送這些欄位，避免有人直接打 API 塞 id / created_at。
 *
 * ⚠ 新增資料表欄位時務必同步加進來 —— 漏掉不會報錯，
 * 而是更新照樣回傳成功、那個欄位卻沒寫入（layout 與 dismiss_mode 就這樣漏過）
 * 投放規則（對象／關閉後）已移到 platform_settings，不在此表。。
 * 下方的 assertWritableCoversTable 會在型別層擋住下一次遺漏。
 */
const WRITABLE = [
  'kind', 'layout', 'title', 'body', 'image_url', 'cta_text', 'cta_href',
  'placements', 'is_active', 'start_at', 'end_at', 'sort_order',
] as const

/** 資料表所有「應可由後台編輯」的欄位。漏加進 WRITABLE 時，下面那行會編譯失敗 */
type EditableColumn =
  | 'kind' | 'layout' | 'title' | 'body' | 'image_url' | 'cta_text' | 'cta_href'
  | 'placements' | 'is_active' | 'start_at' | 'end_at' | 'sort_order'

type MissingFromWritable = Exclude<EditableColumn, typeof WRITABLE[number]>
const _writableCoversTable: MissingFromWritable extends never ? true : never = true
void _writableCoversTable

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of WRITABLE) if (k in body) out[k] = body[k]
  return out
}

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const payload = pick(await req.json())
  if (!payload.body) return NextResponse.json({ error: '內容不可空白' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin().from(TABLE).insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({ adminId: session.adminId, action: '新增推廣素材', targetType: 'site_promos', targetId: data.id, detail: { kind: data.kind }, ip: getClientIp(req) })
  return NextResponse.json({ promo: data })
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const id = body.id as string | undefined
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ ...pick(body), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({ adminId: session.adminId, action: '修改推廣素材', targetType: 'site_promos', targetId: id, detail: pick(body), ip: getClientIp(req) })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({ adminId: session.adminId, action: '刪除推廣素材', targetType: 'site_promos', targetId: id, ip: getClientIp(req) })
  return NextResponse.json({ ok: true })
}
