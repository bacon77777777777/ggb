import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value')

  if (error) return NextResponse.json({}, { status: 500 })

  /*
   * 白名單（資安審查 2026-08-21）：這支用 service role 撈全表，原本無條件
   * 回傳所有 key —— 含 maintenance_bypass_key（維護模式萬能鑰匙）、
   * sell_* 內部上限、marketplace_fee_percent、promo_cost_bearer 等營運參數，
   * 對匿名公開。只回前台顯示真正會用到的公開設定。
   */
  const PUBLIC_KEYS = new Set([
    'free_shipping_threshold',
    'shipping_fee_cvs', 'shipping_fee_cvs_711', 'shipping_fee_cvs_family',
    'shipping_fee_cvs_hilife', 'shipping_fee_cvs_ok', 'shipping_fee_home',
    'shop_enabled', 'shop_disclaimer', 'shop_return_days', 'shop_ship_days',
  ])
  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    if (PUBLIC_KEYS.has(row.key)) map[row.key] = row.value
  }
  return NextResponse.json(map, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
