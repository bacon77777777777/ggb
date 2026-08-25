import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 廠商設定（結算方式 + 差額分潤）
 *
 * 老闆 2026-08-25：「正常初始設定完，後續比較少會去編輯」——
 * 正因為少動，動的那一次才要查得到。變更明細寫進 action_logs，
 * 在「系統設定 → 操作記錄」看得到「誰、何時、把哪一格從多少改成多少」，
 * 不另外開一張表也不另外做一個頁籤（老闆指定）。
 *
 * 只記「真的變了」的欄位：沒改動的格子不該產生噪音，否則紀錄一長就沒人看。
 */

const MODE_LABEL: Record<string, string> = {
  charge: '跟廠商收回收價',
  margin: '差額分潤',
}

const FIELD_LABEL: Record<string, string> = {
  recycle_settlement_mode: '結算方式',
  recycle_margin_supplier_share: '差額分給廠商',
  global_recycle_settlement_mode: '結算方式',
  global_recycle_margin_supplier_share: '差額分給廠商',
}

/** 供變更史顯示用：把存進 DB 的原始值翻成人看得懂的字 */
function describe(field: string, value: string | null): string {
  if (value === null || value === '') return '照全站預設'
  if (field.includes('settlement_mode')) return MODE_LABEL[value] ?? value
  if (field.includes('supplier_share')) return `${value}%`
  return value
}

export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const [{ data: suppliers, error }, { data: settings }] = await Promise.all([
    supabase.from('suppliers')
      .select('id, name, recycle_settlement_mode, recycle_margin_supplier_share')
      .order('name'),
    supabase.from('platform_settings').select('key, value')
      .in('key', ['recycle_settlement_mode', 'recycle_margin_supplier_share']),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map = Object.fromEntries((settings ?? []).map((s: any) => [s.key, s.value]))

  return NextResponse.json({
    suppliers: suppliers ?? [],
    global: {
      mode: map.recycle_settlement_mode ?? 'margin',
      supplierShare: Number(map.recycle_margin_supplier_share ?? 0),
    },
  })
}

export async function PUT(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const supabase = getSupabaseAdmin()
  const ip = getClientIp(request)

  /** 收集「真的變了」的欄位，組成操作記錄看得懂的句子 */
  const changes: string[] = []
  const push = (target: string, field: string, oldV: any, newV: any) => {
    const o = oldV === null || oldV === undefined ? null : String(oldV)
    const n = newV === null || newV === undefined ? null : String(newV)
    if (o === n) return // 沒變就不記，紀錄才不會被無意義的列淹掉
    changes.push(`${target} · ${FIELD_LABEL[field] ?? field}：${describe(field, o)} → ${describe(field, n)}`)
  }

  // ── 全站預設 ──────────────────────────────────────────
  if (body?.global) {
    const mode = String(body.global.mode)
    const share = Number(body.global.supplierShare)
    if (!['charge', 'margin'].includes(mode)) {
      return NextResponse.json({ error: '結算方式不正確' }, { status: 400 })
    }
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      return NextResponse.json({ error: '差額分潤必須介於 0 ~ 100' }, { status: 400 })
    }

    const { data: before } = await supabase.from('platform_settings').select('key, value')
      .in('key', ['recycle_settlement_mode', 'recycle_margin_supplier_share'])
    const prev = Object.fromEntries((before ?? []).map((s: any) => [s.key, s.value]))

    push('全站預設', 'global_recycle_settlement_mode', prev.recycle_settlement_mode ?? null, mode)
    push('全站預設', 'global_recycle_margin_supplier_share', prev.recycle_margin_supplier_share ?? null, String(share))

    const { error } = await supabase.from('platform_settings').upsert(
      [
        { key: 'recycle_settlement_mode', value: mode },
        { key: 'recycle_margin_supplier_share', value: String(share) },
      ],
      { onConflict: 'key' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── 廠商個別設定（null＝照全站預設）─────────────────────
  if (Array.isArray(body?.suppliers)) {
    const ids = body.suppliers.map((s: any) => Number(s.id)).filter((n: number) => Number.isFinite(n))
    const { data: before } = await supabase.from('suppliers')
      .select('id, name, recycle_settlement_mode, recycle_margin_supplier_share')
      .in('id', ids)
    const prevById = new Map((before ?? []).map((s: any) => [s.id, s]))

    for (const s of body.suppliers) {
      const id = Number(s.id)
      const mode = s.mode === null || s.mode === '' ? null : String(s.mode)
      if (mode !== null && !['charge', 'margin'].includes(mode)) {
        return NextResponse.json({ error: '廠商結算方式不正確' }, { status: 400 })
      }
      const share = s.supplierShare === null || s.supplierShare === '' ? null : Number(s.supplierShare)
      if (share !== null && (!Number.isFinite(share) || share < 0 || share > 100)) {
        return NextResponse.json({ error: '廠商差額分潤必須介於 0 ~ 100' }, { status: 400 })
      }

      const prev = prevById.get(id)
      const label = prev?.name ?? `廠商 #${id}`
      push(label, 'recycle_settlement_mode', prev?.recycle_settlement_mode ?? null, mode)
      push(label, 'recycle_margin_supplier_share',
        prev?.recycle_margin_supplier_share === null || prev?.recycle_margin_supplier_share === undefined
          ? null : String(Number(prev.recycle_margin_supplier_share)),
        share === null ? null : String(share))

      const { error } = await supabase.from('suppliers')
        .update({ recycle_settlement_mode: mode, recycle_margin_supplier_share: share })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // 沒有任何變更就不寫紀錄 —— 每按一次儲存都留一筆，操作記錄會被灌爆
  if (changes.length > 0) {
    await logAdminAction({
      adminId: admin.adminId,
      action: '更新廠商設定',
      targetType: 'suppliers',
      detail: { changes },
      ip,
    })
  }

  return NextResponse.json({ ok: true, changed: changes.length })
}
