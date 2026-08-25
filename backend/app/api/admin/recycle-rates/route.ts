import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 回收價格設定
 *
 * 基準一律是商品單抽價（老闆 2026-08-25 定案）—— 不逐品項填實物價值，
 * 那個欄位早就存在卻是 1,778 個品項零填寫，靠人工維護的方案不會被執行。
 *
 * 轉蛋與盒玩各一個 %；一番賞／抽卡／自製賞各有大賞 % 與一般賞 %。
 * 大賞由系統自動判定（品項初始總數 ≤ 3），不需要人工指定。
 */
const TYPES = ['gacha', 'blindbox', 'ichiban', 'card', 'custom']
const TIERS = ['all', 'major', 'normal']

export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const [{ data: rates, error }, { data: settings }, { data: suppliers }] = await Promise.all([
    supabase.from('recycle_rates').select('*').order('product_type').order('tier'),
    supabase.from('platform_settings').select('key, value')
      .in('key', ['recycle_settlement_mode', 'recycle_margin_supplier_share']),
    supabase.from('suppliers')
      .select('id, name, recycle_settlement_mode, recycle_margin_supplier_share')
      .order('name'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map = Object.fromEntries((settings ?? []).map((s: any) => [s.key, s.value]))

  return NextResponse.json({
    rates: rates ?? [],
    settlement: {
      mode: map.recycle_settlement_mode ?? 'margin',
      supplierShare: Number(map.recycle_margin_supplier_share ?? 0),
    },
    suppliers: suppliers ?? [],
  })
}

export async function PUT(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const supabase = getSupabaseAdmin()
  const ip = getClientIp(request)

  // ── 費率 ─────────────────────────────────────────────
  if (Array.isArray(body?.rates)) {
    for (const r of body.rates) {
      if (!TYPES.includes(r.product_type) || !TIERS.includes(r.tier)) {
        return NextResponse.json({ error: '類型或賞等不正確' }, { status: 400 })
      }
      const pct = Number(r.rate_percent)
      const min = Number(r.min_value ?? 1)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: '回收比例必須介於 0 ~ 100' }, { status: 400 })
      }
      if (!Number.isFinite(min) || min < 0) {
        return NextResponse.json({ error: '下限不可為負數' }, { status: 400 })
      }

      const { error } = await supabase
        .from('recycle_rates')
        .update({
          rate_percent: pct,
          min_value: Math.round(min),
          updated_at: new Date().toISOString(),
          updated_by: String(admin.adminId),
        })
        .eq('product_type', r.product_type)
        .eq('tier', r.tier)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // ── 結算方式（全站預設）────────────────────────────────
  if (body?.settlement) {
    const mode = String(body.settlement.mode)
    const share = Number(body.settlement.supplierShare)
    if (!['charge', 'margin'].includes(mode)) {
      return NextResponse.json({ error: '結算方式不正確' }, { status: 400 })
    }
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      return NextResponse.json({ error: '差額分潤必須介於 0 ~ 100' }, { status: 400 })
    }
    const { error } = await supabase.from('platform_settings').upsert(
      [
        { key: 'recycle_settlement_mode', value: mode },
        { key: 'recycle_margin_supplier_share', value: String(share) },
      ],
      { onConflict: 'key' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── 廠商層級覆蓋（null＝照全站預設）─────────────────────
  if (Array.isArray(body?.supplierOverrides)) {
    for (const o of body.supplierOverrides) {
      const mode = o.mode === null || o.mode === '' ? null : String(o.mode)
      if (mode !== null && !['charge', 'margin'].includes(mode)) {
        return NextResponse.json({ error: '廠商結算方式不正確' }, { status: 400 })
      }
      const rawShare = o.supplierShare
      const share = rawShare === null || rawShare === '' ? null : Number(rawShare)
      if (share !== null && (!Number.isFinite(share) || share < 0 || share > 100)) {
        return NextResponse.json({ error: '廠商差額分潤必須介於 0 ~ 100' }, { status: 400 })
      }

      const { error } = await supabase
        .from('suppliers')
        .update({ recycle_settlement_mode: mode, recycle_margin_supplier_share: share })
        .eq('id', Number(o.id))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  await logAdminAction({
    adminId: admin.adminId,
    action: 'recycle_rates_update',
    targetType: 'recycle_rates',
    detail: {
      rates: body?.rates ?? null,
      settlement: body?.settlement ?? null,
      supplierOverrides: body?.supplierOverrides ?? null,
    },
    ip,
  })

  return NextResponse.json({ ok: true })
}
