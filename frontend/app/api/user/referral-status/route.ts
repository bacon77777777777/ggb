import { NextResponse } from 'next/server'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/lineAuth'

/**
 * 邀請循環獎（每 5 位有效邀請領 100 積分，無上限）
 *
 * GET   進度：有效邀請數、可領積分、下一階目標 —— 邀請頁進度條用
 * POST  領取：呼叫 claim_referral_cycle_reward（本人 session，
 *       RPC 內部 auth.uid() 驗身份；一階一列唯一索引擋重複領）
 *
 * 「有效」= 好友綁定 LINE（referrals.qualified_at IS NOT NULL）。
 */

const STEP = 5
const POINTS_PER_STEP = 100

export async function GET() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const admin = serviceClient()
  const [{ count: qualified }, { count: claimedMilestones }] = await Promise.all([
    admin.from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', user.id).not('qualified_at', 'is', null),
    admin.from('referral_cycle_claims')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const q = qualified ?? 0
  const claimable = Math.max(0, Math.floor(q / STEP) - (claimedMilestones ?? 0)) * POINTS_PER_STEP
  return NextResponse.json({
    qualified: q,
    claimable,
    step: STEP,
    pointsPerStep: POINTS_PER_STEP,
    // 進度條：目前這一輪走到第幾格
    cycleProgress: q % STEP,
    nextTarget: (Math.floor(q / STEP) + 1) * STEP,
  })
}

export async function POST() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const { data, error } = await supabase.rpc('claim_referral_cycle_reward')
  if (error) return NextResponse.json({ error: '領取失敗，請重試一次' }, { status: 500 })
  return NextResponse.json(data)
}
