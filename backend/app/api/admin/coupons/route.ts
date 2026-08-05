import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

/**
 * 折價券寫入 API
 *
 * 後台原本用瀏覽器的 anon key 直接寫這張表。那把金鑰公開在前台 JS bundle 裡，
 * 而 RLS 政策是 `ALL ... USING (true)` —— 任何人都能改。
 * 改走 service role + 管理員 session 之後才能把 anon 的寫入政策收掉。
 */

const ALLOWED = new Set(['code','title','description','discount_type','discount_value','min_spend','is_active'])

const pick = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => ALLOWED.has(k) && v !== undefined))

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const payload = pick(await request.json())
    if (!payload.code) return NextResponse.json({ error: '缺少券號' }, { status: 400 })

    const { data, error } = await getSupabaseAdmin().from('coupons').insert([payload]).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId, action: '新增折價券', targetType: 'coupons',
      targetId: String(data.id), detail: payload, ip: getClientIp(request),
    })
    return NextResponse.json({ id: data.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '新增失敗' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json()
    const id = body?.id
    if (id === undefined || id === null || id === '') {
      return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    }
    const payload = pick(body)
    if (!Object.keys(payload).length) return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 })

    const { error } = await getSupabaseAdmin().from('coupons').update(payload).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId, action: '編輯折價券', targetType: 'coupons',
      targetId: String(id), detail: { fields: Object.keys(payload) }, ip: getClientIp(request),
    })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

    const { error } = await getSupabaseAdmin().from('coupons').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId, action: '刪除折價券', targetType: 'coupons',
      targetId: String(id), ip: getClientIp(request),
    })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '刪除失敗' }, { status: 500 })
  }
}
