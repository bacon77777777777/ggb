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

  const { data: rates, error } = await supabase
    .from('recycle_rates').select('*').order('product_type').order('tier')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rates: rates ?? [] })
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
        return NextResponse.json({ error: '最低回收代幣不可為負數' }, { status: 400 })
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

  /*
   * 結算方式與廠商個別設定不在這支 API。
   * 它們改由 /api/admin/supplier-settings 負責 —— 那條路會逐格寫入
   * supplier_setting_logs（誰、何時、從多少改成多少）。
   * 留兩個入口等於留一條「改了查不到」的後門。
   */

  await logAdminAction({
    adminId: admin.adminId,
    action: '更新回收費率',
    targetType: 'recycle_rates',
    detail: { rates: body?.rates ?? null },
    ip,
  })

  return NextResponse.json({ ok: true })
}
