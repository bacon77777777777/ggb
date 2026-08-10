'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout, ListTableCard, type ListColumn } from '@/components'
import StatsCard from '@/components/StatsCard'

/**
 * 邀請報表 —— 誰邀最多、明細與發放統計
 *
 * 「有效邀請」= 好友已綁定 LINE（邀請體系 2.0，migration 505）；
 * 「待生效」= 填了碼還沒綁。綁定禮＝新戶首綁 LINE 的 300 積分。
 */

interface RankingRow {
  id: string // = referrerId（keyField 需要）
  rank: number // 依 API 回傳順序先算好（ListColumn.render 只收 row，拿不到 index）
  referrerId: string
  name: string
  inviteCode: string | null
  qualified: number
  pending: number
  lastQualifiedAt: string | null
}

interface DetailRow {
  id: string // = refereeId（referee 唯一）
  refereeId: string
  refereeName: string
  referrerId: string
  referrerName: string
  createdAt: string
  qualifiedAt: string | null
  claimIp: string | null
}

interface Stats {
  totalQualified: number
  totalPending: number
  bonusCount: number
  bonusPoints: number
  cycleClaimCount: number
  cyclePoints: number
}

const fmt = (iso: string | null) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ReferralsReportPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [ranking, setRanking] = useState<RankingRow[]>([])
  const [details, setDetails] = useState<DetailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rankingSearch, setRankingSearch] = useState('')
  const [detailSearch, setDetailSearch] = useState('')

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/admin/referrals')
        if (!res.ok) return
        const json = await res.json()
        setStats(json.stats)
        setRanking((json.ranking ?? []).map((r: Omit<RankingRow, 'id' | 'rank'>, i: number) => ({
          ...r, id: r.referrerId, rank: i + 1,
        })))
        setDetails((json.details ?? []).map((d: Omit<DetailRow, 'id'>) => ({ ...d, id: d.refereeId })))
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const filteredRanking = ranking.filter(r => {
    if (!rankingSearch.trim()) return true
    const q = rankingSearch.toLowerCase()
    return r.name.toLowerCase().includes(q) || (r.inviteCode ?? '').toLowerCase().includes(q)
  })

  const filteredDetails = details.filter(d => {
    if (!detailSearch.trim()) return true
    const q = detailSearch.toLowerCase()
    return d.refereeName.toLowerCase().includes(q) || d.referrerName.toLowerCase().includes(q)
  })

  const rankingColumns: ListColumn<RankingRow>[] = [
    {
      key: 'rank', label: '排名',
      sortValue: r => r.rank,
      className: 'font-mono w-16',
      render: r => <>{r.rank}</>,
    },
    {
      key: 'name', label: '邀請人',
      sortValue: r => r.name,
      render: r => (
        <Link href={`/users/${r.referrerId}`} className="text-blue-600 hover:underline font-medium">
          {r.name}
        </Link>
      ),
    },
    {
      key: 'inviteCode', label: '邀請碼',
      sortValue: r => r.inviteCode ?? '',
      className: 'font-mono',
      render: r => <>{r.inviteCode || '-'}</>,
    },
    {
      key: 'qualified', label: '有效邀請',
      sortValue: r => r.qualified,
      render: r => <span className="font-mono font-bold">{r.qualified}</span>,
    },
    {
      key: 'pending', label: '待生效',
      sortValue: r => r.pending,
      render: r => <span className="font-mono text-neutral-500">{r.pending}</span>,
    },
    {
      key: 'lastQualifiedAt', label: '最後生效時間',
      sortValue: r => (r.lastQualifiedAt ? new Date(r.lastQualifiedAt).getTime() : 0),
      className: 'font-mono',
      render: r => <>{fmt(r.lastQualifiedAt)}</>,
    },
  ]

  const detailColumns: ListColumn<DetailRow>[] = [
    {
      key: 'refereeName', label: '被邀請人',
      sortValue: r => r.refereeName,
      render: r => (
        <Link href={`/users/${r.refereeId}`} className="text-blue-600 hover:underline font-medium">
          {r.refereeName}
        </Link>
      ),
    },
    {
      key: 'referrerName', label: '邀請人',
      sortValue: r => r.referrerName,
      render: r => (
        <Link href={`/users/${r.referrerId}`} className="text-blue-600 hover:underline">
          {r.referrerName}
        </Link>
      ),
    },
    {
      key: 'createdAt', label: '填碼時間',
      sortValue: r => new Date(r.createdAt).getTime(),
      className: 'font-mono',
      render: r => <>{fmt(r.createdAt)}</>,
    },
    {
      key: 'qualifiedAt', label: '生效狀態',
      sortValue: r => (r.qualifiedAt ? new Date(r.qualifiedAt).getTime() : 0),
      render: r => r.qualifiedAt
        ? <span className="text-green-600 font-medium font-mono">{fmt(r.qualifiedAt)}</span>
        : <span className="text-neutral-400">待綁定 LINE</span>,
    },
    {
      key: 'claimIp', label: '填碼 IP',
      sortValue: r => r.claimIp ?? '',
      className: 'font-mono text-neutral-500',
      render: r => <>{r.claimIp || '-'}</>,
    },
  ]

  return (
    <AdminLayout pageTitle="邀請報表">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="有效邀請" value={stats?.totalQualified ?? '-'} unit="位" subtitle="好友已綁定 LINE" />
          <StatsCard title="待生效" value={stats?.totalPending ?? '-'} unit="位" subtitle="填了碼、還沒綁 LINE" />
          <StatsCard
            title="綁定禮發放"
            value={stats?.bonusCount ?? '-'}
            unit="人"
            subtitle={`共 ${(stats?.bonusPoints ?? 0).toLocaleString()} 積分`}
          />
          <StatsCard
            title="循環獎已領"
            value={(stats?.cyclePoints ?? 0).toLocaleString()}
            unit="積分"
            subtitle={`${stats?.cycleClaimCount ?? 0} 次領取`}
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-neutral-900">邀請人排行</h2>
          <ListTableCard
            pageKey="referrals-ranking"
            data={filteredRanking}
            columns={rankingColumns}
            keyField="id"
            isLoading={loading}
            emptyMessage="還沒有任何邀請記錄"
            defaultSortField="rank"
            searchPlaceholder="搜尋邀請人、邀請碼..."
            searchValue={rankingSearch}
            onSearchChange={setRankingSearch}
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-neutral-900">邀請明細</h2>
          <ListTableCard
            pageKey="referrals-details"
            data={filteredDetails}
            columns={detailColumns}
            keyField="id"
            isLoading={loading}
            emptyMessage="還沒有任何邀請記錄"
            defaultSortField="createdAt"
            defaultSortDirection="desc"
            searchPlaceholder="搜尋被邀請人、邀請人..."
            searchValue={detailSearch}
            onSearchChange={setDetailSearch}
          />
        </div>
      </div>
    </AdminLayout>
  )
}
