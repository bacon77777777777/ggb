import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

const RATE_LABEL: Record<string, string> = {
  profit_share_percent: '廠商分潤比',
  withholding_rate_percent: '代扣稅率',
  points_deduction_mode: '積分扣除模式',
  recycle_settlement_mode: '回收價',
  recycle_margin_supplier_share: '差額分潤',
}

const RATE_VALUE_LABEL: Record<string, string> = {
  A: '廠商吸收 50%', B: '平台全吸收',
  // 回收價收不收（DB 值沿用舊的 charge／margin）
  charge: '跟廠商收', margin: '平台吸收',
}

function rateText(field: string, v: any): string {
  if (v === null || v === undefined || v === '') return '照全站預設'
  if (field === 'points_deduction_mode' || field === 'recycle_settlement_mode') {
    return RATE_VALUE_LABEL[String(v)] ?? String(v)
  }
  return `${Number(v)}%`
}

/** 只列出真的變了的結算欄位，沒動的不寫 */
function rateChangeDetail(prev: any, next: any) {
  if (!prev || !next) return {}
  const changes: string[] = []
  for (const f of Object.keys(RATE_LABEL)) {
    const a = prev[f] ?? null
    const b = next[f] ?? null
    if (String(a) === String(b)) continue
    changes.push(`${RATE_LABEL[f]}：${rateText(f, a)} → ${rateText(f, b)}`)
  }
  return changes.length > 0 ? { changes } : {}
}

/**
 * 結算設定的五個欄位：留空（null）＝跟隨全站預設，填了才是這家的客製值。
 * 空字串一律正規化成 null —— 表單清空時送的是 ''，直接寫進去會變成
 * 「有值但等於空」，之後 resolveRates 就分不出「沒設」與「設成空」。
 */
function canEditRates(session: any): boolean {
  if (session?.role === 'super_admin' || session?.role === 'superadmin') return true
  return (session?.permissions ?? []).includes('suppliers_settings')
}

function normalizeRates(body: any) {
  const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v))
  const enumv = (v: any, allowed: string[]) =>
    v === null || v === undefined || v === '' || !allowed.includes(String(v)) ? null : String(v)
  return {
    profit_share_percent: num(body.profit_share_percent),
    withholding_rate_percent: num(body.withholding_rate_percent),
    points_deduction_mode: enumv(body.points_deduction_mode, ['A', 'B']),
    recycle_settlement_mode: enumv(body.recycle_settlement_mode, ['charge', 'margin']),
    recycle_margin_supplier_share: num(body.recycle_margin_supplier_share),
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { name, contact_name, contact_phone, contact_email, address, notes, is_active, tax_id, sender_name, sender_zip_code, sender_address } = body

  if (name !== undefined && !name?.trim())
    return NextResponse.json({ error: '廠商名稱不可為空' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // 平台自營那筆不給停用，理由跟不給刪一樣：自營商品都掛在它底下，
  // 停掉之後那些商品就再也指派不回去了
  if (is_active === false) {
    const { data: target } = await supabase
      .from('suppliers').select('is_platform').eq('id', id).maybeSingle()
    if (target?.is_platform) {
      return NextResponse.json(
        { error: '這是平台自營的廠商，不能停用。' },
        { status: 400 },
      )
    }
  }
  // 結算設定是「設定完很少再動」的東西，動的那一次要查得到 —— 先撈舊值做比對
  const { data: prevRow } = await supabase
    .from('suppliers')
    .select('profit_share_percent, withholding_rate_percent, points_deduction_mode, recycle_settlement_mode, recycle_margin_supplier_share')
    .eq('id', id).maybeSingle()

  const { data, error } = await supabase
    .from('suppliers')
    .update({ name: name?.trim(), contact_name, contact_phone, contact_email, address, notes, is_active, tax_id: tax_id !== undefined ? (tax_id || null) : undefined, sender_name: sender_name !== undefined ? (sender_name || null) : undefined, sender_zip_code: sender_zip_code !== undefined ? (sender_zip_code || null) : undefined, sender_address: sender_address !== undefined ? (sender_address || null) : undefined, ...(canEditRates(session) ? normalizeRates(body) : {}), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 停用與一般編輯分開記。停用會讓整家廠商的商品下架，事後查帳要看得出來是誰按的
  await logAdminAction({
    adminId: session.adminId,
    action: is_active === false ? '停用廠商' : is_active === true ? '啟用廠商' : '修改廠商',
    targetType: 'supplier',
    targetId: String(id),
    detail: { name: data?.name, ...rateChangeDetail(prevRow, data) },
    ip: getClientIp(request),
  })
  return NextResponse.json(data)
}

/**
 * 刪除廠商
 *
 * 原本只把 products 的關聯清掉就直接刪，但廠商的外鍵有四張表是擋住不給刪的
 *（admins RESTRICT，settlement_snapshots / slot_machines / slot_themes NO ACTION）。
 * 被擋下來時回的是 Postgres 的原始訊息（一串英文的 constraint 名稱），
 * 畫面上看起來就像沒反應。這裡改成先問清楚是誰擋著，再講人話。
 */
const BLOCKERS: { table: string; label: string }[] = [
  { table: 'admins',               label: '管理員帳號' },
  { table: 'settlement_snapshots', label: '月結快照' },
  { table: 'slot_machines',        label: '機台' },
  { table: 'slot_themes',          label: '機台主題' },
]

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  // 平台自己那筆不給刪：自營商品都掛在它底下，刪掉會變成一堆沒有廠商的孤兒
  const { data: target } = await supabase
    .from('suppliers').select('name, is_platform').eq('id', id).maybeSingle()
  if (!target) return NextResponse.json({ error: '找不到這個廠商' }, { status: 404 })
  if (target.is_platform) {
    return NextResponse.json(
      { error: '這是平台自營的廠商，不能刪除。平台自營的商品都掛在它底下。' },
      { status: 400 },
    )
  }

  // 先講清楚是誰擋著，再動手 —— 不然使用者只會看到一串外鍵約束名稱
  for (const b of BLOCKERS) {
    const { count } = await supabase
      .from(b.table).select('*', { count: 'exact', head: true }).eq('supplier_id', id)
    if (count && count > 0) {
      return NextResponse.json(
        { error: `還有 ${count} 筆${b.label}掛在這個廠商底下，請先處理完再刪除。` },
        { status: 409 },
      )
    }
  }

  // 商品與訂單的外鍵是 SET NULL，先清掉讓歷史資料留著、只是不再歸屬任何廠商
  await supabase.from('products').update({ supplier_id: null }).eq('supplier_id', id)
  await supabase.from('orders').update({ supplier_id: null }).eq('supplier_id', id)
  await supabase.from('slot_prizes').update({ supplier_id: null }).eq('supplier_id', id)

  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId,
    action: '刪除廠商',
    targetType: 'supplier',
    targetId: String(id),
    detail: { name: target.name },
    ip: getClientIp(request),
  })
  return NextResponse.json({ ok: true })
}
