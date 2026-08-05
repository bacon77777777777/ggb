import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

/**
 * 文章寫入 API
 *
 * 後台的文章管理原本直接用瀏覽器的 anon key 寫資料庫。那把金鑰是
 * NEXT_PUBLIC_ 開頭、公開在前台的 JS bundle 裡，而 news 的 RLS 政策是
 * INSERT/UPDATE/DELETE 全部 `USING (true)` —— 等於任何人都能改站上文章。
 *
 * 改走這支 API（service role + 管理員 session）之後，就能把 anon 的寫入政策收掉。
 * 前台只需要 SELECT 與 view_count 的累加，那兩個另外開。
 */

const ALLOWED = new Set([
  'title', 'summary', 'content', 'image_url', 'source_url',
  'category', 'tags', 'is_active', 'published_at',
])

const pick = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => ALLOWED.has(k) && v !== undefined))

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const payload = pick(body?.article ?? body ?? {})
    if (!payload.title) return NextResponse.json({ error: '缺少標題' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const insert = body?.id ? { ...payload, id: body.id } : payload

    const { data, error } = await supabase.from('news').insert([insert]).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId, action: '新增文章', targetType: 'news',
      targetId: String(data.id), detail: { title: payload.title }, ip: getClientIp(request),
    })
    return NextResponse.json({ id: data.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '新增失敗' }, { status: 500 })
  }
}

/** 批次上下架／批次刪除。後台列表的全選操作走這裡。 */
export async function PATCH(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : []
    if (!ids.length) return NextResponse.json({ error: '缺少 ids' }, { status: 400 })

    const supabase = getSupabaseAdmin()

    if (body?.action === 'delete') {
      const { error } = await supabase.from('news').delete().in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await logAdminAction({
        adminId: session.adminId, action: '批次刪除文章', targetType: 'news',
        targetId: String(ids.length), detail: { ids: ids.slice(0, 50) }, ip: getClientIp(request),
      })
      return NextResponse.json({ ok: ids.length })
    }

    if (typeof body?.is_active !== 'boolean') {
      return NextResponse.json({ error: '缺少 is_active 或 action' }, { status: 400 })
    }
    const { error } = await supabase.from('news').update({ is_active: body.is_active }).in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId, action: body.is_active ? '批次上架文章' : '批次下架文章',
      targetType: 'news', targetId: String(ids.length), detail: { ids: ids.slice(0, 50) }, ip: getClientIp(request),
    })
    return NextResponse.json({ ok: ids.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '更新失敗' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const id = Number(body?.id)
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

    const payload = pick(body?.article ?? body ?? {})
    if (!Object.keys(payload).length) return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('news').update(payload).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: session.adminId, action: '編輯文章', targetType: 'news',
      targetId: String(id), detail: { fields: Object.keys(payload) }, ip: getClientIp(request),
    })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '更新失敗' }, { status: 500 })
  }
}
