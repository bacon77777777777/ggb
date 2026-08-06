import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * 目前是不是維護中
 *
 * 給 MaintenanceWatcher 輪詢用。刻意做得極小：只回一個布林，
 * 因為它每 30 秒被每個線上使用者打一次。
 *
 * 查不到就回 false —— 資料庫掛掉時不該把整個站鎖起來，
 * 那會讓一個可恢復的故障變成完全無法存取。
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    )
    const { data } = await supabase.from('public_maintenance').select('scope').single()
    const scope = data?.scope ?? 'off'
    return NextResponse.json(
      { active: scope === 'frontend' || scope === 'all' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ active: false }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
