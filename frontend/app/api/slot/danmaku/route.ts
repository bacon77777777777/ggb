import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * 機台中獎彈幕資料源
 *
 * 全站所有機台的 RUSH 中獎（實體卡），不限本機台 —— 看到別台在噴卡會想過去看看。
 * 只取 rush_hit / rush_continue 且有獎品價值者：普通旋轉的退幣每轉都有，會洗版且不稀奇。
 * 暱稱一律遮罩，避免公開誰中了什麼。
 *
 * 資料由兩部分合併（與首頁中獎跑馬燈、排行榜同樣的原則）：
 *   1. 真人的實際中獎（slot_spin_logs）
 *   2. 機器人的展示資料（slot_danmaku_bots）—— 獨立表，不進報表、不扣庫存
 * 真人資料一律優先且照時間排序，機器人只是填補空檔。
 */
export const dynamic = 'force-dynamic'

/** 少於此數量整層不顯示：只有一兩則會一直重播，比不做更尷尬 */
const MIN_ITEMS = 5

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

    const [realRes, botRes] = await Promise.all([
      supabase
        .from('slot_spin_logs')
        .select('id, prize_name, prize_value, machine_id, users!inner(name, avatar_url, is_bot)')
        .in('kind', ['rush_hit', 'rush_continue'])
        .gt('prize_value', 0)
        .order('id', { ascending: false })
        .limit(30),
      supabase
        .from('slot_danmaku_bots')
        .select('id, prize_name, prize_value, users(name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(60),
    ])

    const shape = (r: any, idPrefix: string) => ({
      id: `${idPrefix}${r.id}`,
      name: maskName(r.users?.name ?? null),
      avatar: r.users?.avatar_url || null,
      prize: r.prize_name ?? '',
      value: r.prize_value ?? 0,
    })

    // 真人排前面（依時間），機器人打散填補
    const real = (realRes.data ?? [])
      .filter((r: any) => !r.users?.is_bot)
      .map((r: any) => shape(r, 'r'))
    const bots = (botRes.data ?? []).map((r: any) => shape(r, 'b'))
    for (let i = bots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bots[i], bots[j]] = [bots[j], bots[i]]
    }

    const items = [...real, ...bots].slice(0, 40)
    return NextResponse.json({ items: items.length >= MIN_ITEMS ? items : [] })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message }, { status: 200 })
  }
}
