import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', confirmed: '已確認', paid: '已付款',
}

/**
 * 月結快照的狀態流轉：草稿 → 已確認 → 已付款
 *
 * 這兩個動作等於「這期的對帳單定案了 / 錢付了」，收成 super_admin 專屬
 * （老闆 2026-08-25）。改版前只要有 settlement_snapshots 權限就能按，
 * 而會計角色就有 —— 產生正式對帳單不該是會計自己按得動的。
 *
 * 廠商帳號一律 403：他們看得到自己的結算頁與狀態，但不能改。
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSuper = scope.role === 'super_admin' || scope.role === 'superadmin'
  if (scope.isSupplier || !isSuper) {
    return NextResponse.json({ error: '只有超級管理員可以變更結算狀態' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { status, note } = body
  const allowed = ['draft', 'confirmed', 'paid']
  if (status && !allowed.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 舊狀態要留在稽核紀錄裡，不然事後只知道「有人改過」不知道從什麼改成什麼
  const { data: prev } = await supabase
    .from('settlement_snapshots')
    .select('supplier_name, period_start, period_end, status, supplier_net')
    .eq('id', id).maybeSingle()

  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (status) update.status = status
  if (note !== undefined) update.note = note
  if (status === 'confirmed') update.confirmed_at = new Date().toISOString()
  if (status === 'paid') update.paid_at = new Date().toISOString()
  // 退回草稿＝解除鎖帳，把時間戳一併清掉，不留下對不上的紀錄
  if (status === 'draft') {
    update.confirmed_at = null
    update.paid_at = null
  }

  const { data, error } = await supabase
    .from('settlement_snapshots')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: scope.adminId,
    action: '變更結算狀態',
    targetType: 'settlement_snapshot',
    targetId: String(id),
    detail: {
      changes: [
        `${prev?.supplier_name ?? ''} ${prev?.period_start ?? ''}~${prev?.period_end ?? ''} `
        + `${STATUS_LABEL[prev?.status ?? ''] ?? prev?.status ?? '—'} → ${STATUS_LABEL[status] ?? status}`
        + (prev?.supplier_net != null ? `（應付 ${Number(prev.supplier_net).toLocaleString()}）` : ''),
      ],
    },
    ip: getClientIp(req),
  })

  return NextResponse.json(data)
}
