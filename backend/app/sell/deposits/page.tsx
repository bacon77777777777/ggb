'use client'

import { AdminLayout, PageCard, StatsCard, CopyableID } from '@/components'
import Badge from '@/components/ui/Badge'
import SelectField from '@/components/ui/SelectField'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { TableEmpty } from '@/components/ui/EmptyState'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime } from '@/utils/dateFormat'
import { useEffect, useState } from 'react'

/*
 * 保證金查帳（唯讀）。
 *
 * 不提供手動調整：收／退／賠都由交易流程裡的 DB 函式處理，
 * 後台手改會讓 users.tokens 跟這張表對不起來，而這張表存在的意義
 * 就是出爭議時可以拿出來的證據。要更正只能從訂單流程走。
 */

type Row = {
  id: number
  order_id: number
  seller_id: string
  seller_name: string
  seller_email: string
  buyer_id: string
  buyer_name: string
  amount: number
  status: string
  released_at: string | null
  note: string | null
  created_at: string
}

const STATUS: Record<string, { label: string; color: 'yellow' | 'green' | 'red' }> = {
  locked: { label: '鎖定中', color: 'yellow' },
  released: { label: '已退還', color: 'green' },
  forfeited: { label: '已賠付買家', color: 'red' },
}

export default function SellDepositsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [stats, setStats] = useState({ locked: 0, released: 0, forfeited: 0, forfeitedCount: 0 })
  const [status, setStatus] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/admin/sell/deposits${status ? `?status=${status}` : ''}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          const d = await res.json().catch(() => null)
          if (!cancelled) toast(d?.error || `讀取失敗（${res.status}）`, 'error')
          return
        }
        const d = await res.json()
        if (cancelled) return
        setRows(d.rows || [])
        setStats(d.stats || { locked: 0, released: 0, forfeited: 0, forfeitedCount: 0 })
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status])

  return (
    <AdminLayout pageTitle="保證金" pageSubtitle="玩家商城賣家保證金（G幣）。唯讀，異動一律由交易流程處理">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard title="目前鎖定（G）" value={stats.locked.toLocaleString()} />
        <StatsCard title="累計退還（G）" value={stats.released.toLocaleString()} />
        <StatsCard title="累計賠付（G）" value={stats.forfeited.toLocaleString()} />
        <StatsCard title="賠付筆數" value={stats.forfeitedCount} />
      </div>

      <PageCard
        header={
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-neutral-900">保證金明細</h2>
            <SelectField
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              compact
              className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">全部狀態</option>
              <option value="locked">鎖定中</option>
              <option value="released">已退還</option>
              <option value="forfeited">已賠付買家</option>
            </SelectField>
          </div>
        }
      >
        {(
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {['訂單', '賣家', '買家', '金額（G）', '狀態', '結算時間', '備註', '建立時間'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton rows={8} cols={8} />
                ) : rows.length === 0 ? (
                  <TableEmpty colSpan={8} message="目前沒有保證金紀錄" />
                ) : (
                  rows.map((r) => {
                    const st = STATUS[r.status] || { label: r.status, color: 'yellow' as const }
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-3 py-2 text-sm">
                          <a href={`/sell-orders/${r.order_id}`} className="text-primary hover:underline">
                            #{r.order_id}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <div>{r.seller_name}</div>
                          <div className="text-xs text-neutral-400">{r.seller_email}</div>
                        </td>
                        <td className="px-3 py-2 text-sm">{r.buyer_name}</td>
                        <td className="px-3 py-2 text-sm font-semibold">{r.amount.toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <Badge color={st.color}>{st.label}</Badge>
                        </td>
                        <td className="px-3 py-2 text-sm text-neutral-500 whitespace-nowrap">
                          {r.released_at ? formatDateTime(r.released_at) : '—'}
                        </td>
                        <td className="px-3 py-2 text-sm text-neutral-500 max-w-[220px] truncate">
                          {r.note || '—'}
                        </td>
                        <td className="px-3 py-2 text-sm text-neutral-500 whitespace-nowrap">
                          {formatDateTime(r.created_at)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </AdminLayout>
  )
}
