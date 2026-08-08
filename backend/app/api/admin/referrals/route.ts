import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * 邀請報表 —— 邀請人排行＋明細＋發放統計
 *
 * 「有效邀請」= 好友已綁定 LINE（referrals.qualified_at IS NOT NULL，
 * 規則見 migration 505）；「待生效」= 填了碼還沒綁 LINE。
 * 綁定禮／循環獎統計直接讀 line_grant_ledger 與 referral_cycle_claims。
 */
export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = getSupabaseAdmin()

    const [{ data: referrals, error: refErr }, { data: ledger }, { data: cycleClaims }] = await Promise.all([
      admin.from('referrals')
        .select('referrer_id, referee_id, qualified_at, created_at, claim_ip')
        .order('created_at', { ascending: false }),
      admin.from('line_grant_ledger').select('bonus_points'),
      admin.from('referral_cycle_claims').select('points'),
    ])
    if (refErr) throw refErr

    const rows = referrals ?? []
    const userIds = Array.from(new Set(rows.flatMap(r => [r.referrer_id, r.referee_id]).filter(Boolean)))
    const userById = new Map<string, { name: string; invite_code: string | null }>()
    if (userIds.length > 0) {
      const { data: users } = await admin
        .from('users').select('id, name, invite_code').in('id', userIds)
      for (const u of users ?? []) userById.set(u.id, { name: u.name ?? '-', invite_code: u.invite_code ?? null })
    }

    // 邀請人排行
    const byReferrer = new Map<string, { qualified: number; pending: number; lastQualifiedAt: string | null }>()
    for (const r of rows) {
      const agg = byReferrer.get(r.referrer_id) ?? { qualified: 0, pending: 0, lastQualifiedAt: null }
      if (r.qualified_at) {
        agg.qualified += 1
        if (!agg.lastQualifiedAt || r.qualified_at > agg.lastQualifiedAt) agg.lastQualifiedAt = r.qualified_at
      } else {
        agg.pending += 1
      }
      byReferrer.set(r.referrer_id, agg)
    }
    const ranking = Array.from(byReferrer.entries())
      .map(([id, agg]) => ({
        referrerId: id,
        name: userById.get(id)?.name ?? '-',
        inviteCode: userById.get(id)?.invite_code ?? null,
        ...agg,
      }))
      .sort((a, b) => b.qualified - a.qualified || b.pending - a.pending)

    // 明細（referee 唯一，可當 key）
    const details = rows.map(r => ({
      refereeId: r.referee_id,
      refereeName: userById.get(r.referee_id)?.name ?? '-',
      referrerId: r.referrer_id,
      referrerName: userById.get(r.referrer_id)?.name ?? '-',
      createdAt: r.created_at,
      qualifiedAt: r.qualified_at,
      claimIp: r.claim_ip ?? null,
    }))

    const bonusRows = (ledger ?? []).filter(l => (l.bonus_points ?? 0) > 0)
    const stats = {
      totalQualified: rows.filter(r => r.qualified_at).length,
      totalPending: rows.filter(r => !r.qualified_at).length,
      bonusCount: bonusRows.length,
      bonusPoints: bonusRows.reduce((s, l) => s + (l.bonus_points ?? 0), 0),
      cycleClaimCount: (cycleClaims ?? []).length,
      cyclePoints: (cycleClaims ?? []).reduce((s, c) => s + (c.points ?? 0), 0),
    }

    return NextResponse.json({ stats, ranking, details })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}
