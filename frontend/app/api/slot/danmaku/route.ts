import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * 機台中獎彈幕資料源
 *
 * 全站所有機台的 RUSH 中獎（實體卡），不限本機台 —— 看到別台在噴卡會想過去看看。
 * 只取 rush_hit / rush_continue 且有獎品價值者：普通旋轉的退幣每轉都有，會洗版且不稀奇。
 * 暱稱一律遮罩，避免公開誰中了什麼。
 */
export const dynamic = 'force-dynamic'

function maskName(name: string | null): string {
  const n = (name ?? '').trim()
  if (!n) return '神秘玩家'
  if (n.length === 1) return n
  if (n.length === 2) return `${n[0]}*`
  return `${n[0]}${'*'.repeat(Math.min(n.length - 2, 3))}${n[n.length - 1]}`
}

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('slot_spin_logs')
      .select('id, prize_name, prize_value, created_at, machine_id, users(name, avatar_url)')
      .in('kind', ['rush_hit', 'rush_continue'])
      .gt('prize_value', 0)
      .order('id', { ascending: false })
      .limit(40)

    if (error) throw error

    const items = (data ?? []).map((r: any) => ({
      id: r.id,
      name: maskName(r.users?.name ?? null),
      avatar: r.users?.avatar_url || null,
      prize: r.prize_name ?? '',
      value: r.prize_value ?? 0,
      machineId: r.machine_id,
    }))

    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message }, { status: 200 })
  }
}
