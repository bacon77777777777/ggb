import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('sell_listings')
      .select(
        `
          id,
          price,
          status,
          category,
          review_note,
          reviewed_at,
          reviewed_by,
          title,
          note,
          images,
          items,
          view_count,
          created_at,
          updated_at,
          seller_id,
          seller:users!sell_listings_seller_id_fkey (
            id,
            name,
            email
          )
        `
      )
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as null | {
      id?: number | string
      status?: string
      reviewNote?: string
    }
    const idRaw = body?.id
    const status = String(body?.status || '').trim()
    const id = Number(idRaw)

    const ALLOWED = ['pending', 'active', 'rejected', 'sold', 'removed']
    if (!Number.isFinite(id) || !ALLOWED.includes(status)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // 退回一定要講原因 —— 賣家看得到這段字，沒有原因他只會重送一模一樣的東西
    const reviewNote = String(body?.reviewNote || '').trim()
    if (status === 'rejected' && !reviewNote) {
      return NextResponse.json({ error: '退回時必須填寫原因' }, { status: 400 })
    }

    // 審核結果只在「核准／退回」時蓋章。單純下架不算審核過，
    // 不然下架再重新送審會顯示成「已審過」。
    const isReview = status === 'active' || status === 'rejected'
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (isReview) {
      patch.review_note = status === 'rejected' ? reviewNote : null
      patch.reviewed_at = new Date().toISOString()
      patch.reviewed_by = session.adminId
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('sell_listings').update(patch).eq('id', id)
    if (error) throw error

    await logAdminAction({
      adminId: session.adminId,
      action: status === 'active' ? '核准商城商品' : status === 'rejected' ? '退回商城商品' : '修改商城商品狀態',
      targetType: 'sell_listing',
      targetId: String(id),
      detail: status === 'rejected' ? { status, reason: reviewNote } : { status },
      ip: getClientIp(req),
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const idParam = url.searchParams.get('id')
    const id = Number(idParam)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('sell_listings').delete().eq('id', id)
    if (!error) {
      await logAdminAction({
        adminId: session.adminId,
        action: '刪除商城商品',
        targetType: 'sell_listing',
        targetId: String(id),
        ip: getClientIp(req),
      })
    }
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '刪除失敗' }, { status: 500 })
  }
}
