'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout, PageCard } from '@/components'
import { DataTable, type Column } from '@/components'
import StatsCard from '@/components/StatsCard'

/**
 * 邀請報表 —— 誰邀最多、明細與發放統計
 *
 * 「有效邀請」= 好友已綁定 LINE（邀請體系 2.0，migration 505）；
 * 「待生效」= 填了碼還沒綁。綁定禮＝新戶首綁 LINE 的 300 積分。
 */

interface RankingRow {
  id: string // = referrerId（DataTable keyField 需要）
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

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/admin/referrals')
        if (!res.ok) return
        const json = await res.json()
        setStats(json.stats)
        setRanking((json.ranking ?? []).map((r: Omit<RankingRow, 'id'>) => ({ ...r, id: r.referrerId })))
        setDetails((json.details ?? []).map((d: Omit<DetailRow, 'id'>) => ({ ...d, id: d.refereeId })))
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const rankingColumns: Column<RankingRow>[] = [
    { key: 'rank', label: '排名', render: (_r, i) => <span className="font-mono">{i + 1}</span>, className: 'w-16' },
    {
      key: 'name', label: '邀請人',
      render: r => (
        <Link href={`/users/${r.referrerId}`} className="text-blue-600 hover:underline font-medium">
          {r.name}
        </Link>
      ),
    },
    { key: 'inviteCode', label: '邀請碼', render: r => <span className="font-mono">{r.inviteCode || '-'}</span> },
    { key: 'qualified', label: '有效邀請', render: r => <span className="font-mono font-bold">{r.qualified}</span> },
    { key: 'pending', label: '待生效', render: r => <span className="font-mono text-neutral-500">{r.pending}</span> },
    { key: 'lastQualifiedAt', label: '最後生效時間', render: r => fmt(r.lastQualifiedAt) },
  ]

  const detailColumns: Column<DetailRow>[] = [
    {
      key: 'refereeName', label: '被邀請人',
      render: r => (
        <Link href={`/users/${r.refereeId}`} className="text-blue-600 hover:underline font-medium">
          {r.refereeName}
        </Link>
      ),
    },
    {
      key: 'referrerName', label: '邀請人',
      render: r => (
        <Link href={`/users/${r.referrerId}`} className="text-blue-600 hover:underline">
          {r.referrerName}
        </Link>
      ),
    },
    { key: 'createdAt', label: '填碼時間', render: r => fmt(r.createdAt) },
    {
      key: 'qualifiedAt', label: '生效狀態',
      render: r => r.qualifiedAt
        ? <span className="text-green-600 font-medium">{fmt(r.qualifiedAt)}</span>
        : <span className="text-neutral-400">待綁定 LINE</span>,
    },
    { key: 'claimIp', label: '填碼 IP', render: r => <span className="font-mono text-neutral-500">{r.claimIp || '-'}</span> },
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

        <PageCard>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">邀請人排行</h2>
          <DataTable
            data={ranking}
            columns={rankingColumns}
            keyField="id"
            isLoading={loading}
            emptyMessage="還沒有任何邀請記錄"
          />
        </PageCard>

        <PageCard>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">邀請明細</h2>
          <DataTable
            data={details}
            columns={detailColumns}
            keyField="id"
            isLoading={loading}
            emptyMessage="還沒有任何邀請記錄"
          />
        </PageCard>
      </div>
    </AdminLayout>
  )
}
