import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

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
  const { data, error } = await supabase
    .from('suppliers')
    .update({ name: name?.trim(), contact_name, contact_phone, contact_email, address, notes, is_active, tax_id: tax_id !== undefined ? (tax_id || null) : undefined, sender_name: sender_name !== undefined ? (sender_name || null) : undefined, sender_zip_code: sender_zip_code !== undefined ? (sender_zip_code || null) : undefined, sender_address: sender_address !== undefined ? (sender_address || null) : undefined, updated_at: new Date().toISOString() })
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
    detail: { name: data?.name },
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
