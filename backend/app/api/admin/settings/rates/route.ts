import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * GET /api/admin/settings/rates
 *
 * 殺率調整頁的資料來源。
 *
 * 必須走 service role：`profit_rate` 在 migration 471 已對 anon／authenticated
 * 撤銷 SELECT（跟 seed、cost 一起，避免前台撈得到殺率）。頁面原本用 anon
 * client 直接查，整個查詢被 42501 擋掉，`data` 變 null，而呼叫端沒檢查
 * error —— 於是這頁從那次權限收緊之後就一直是空白，連錯誤都不顯示。
 */
export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .select('id, product_code, name, type, profit_rate, sealed_at, product_prizes(level, name, total, probability)')
    .in('type', ['ichiban', 'card', 'custom'])
    .order('id', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data ?? [] })
}
