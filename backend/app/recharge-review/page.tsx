'use client'

import { AdminLayout, ListTableCard, RowAction, type ListColumn } from '@/components'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import UserCell from '@/components/UserCell'
import { userMatches } from '@/lib/userSearch'

interface RechargeRecord {
  id: number
  order_number: string | null
  amount: number
  bonus: number | null
  status: string
  needs_review: boolean
  needs_review_at: string | null
  review_note: string | null
  created_at: string
  user_id: string
  user: { id: string; member_no?: number | null; name: string | null; email: string | null; tokens: number } | null
}

function ageLabel(created_at: string): string {
  const mins = Math.floor((Date.now() - new Date(created_at).getTime()) / 60_000)
  if (mins < 60) return `${mins} 分鐘前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小時前`
  return `${Math.floor(hrs / 24)} 天前`
}

export default function RechargeReviewPage() {
  const router = useRouter()
  const [records, setRecords]   = useState<RechargeRecord[]>([])
  const [loading, setLoading]   = useState(false)
  const [notes, setNotes]       = useState<Record<number, string>>({})
  const [acting, setActing]     = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/admin/recharge-review')
    const data = await res.json()
    setRecords(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id: number, action: 'dismiss' | 'force_fail' | 'force_success') => {
    if (acting !== null) return // 處理中不重複觸發（原 disabled 行為）
    if (action === 'force_fail') {
      if (!confirm('確定將此筆儲值標記為「失敗」？此操作不可逆。')) return
    }
    if (action === 'force_success') {
      if (!confirm('確定手動補發代幣？請先至 ECPay 後台確認此筆訂單已實際入帳，此操作不可逆。')) return
    }
    setActing(id)
    await fetch(`/api/admin/recharge-review/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note: notes[id] ?? null }),
    })
    setActing(null)
    load()
  }

  const filtered = records.filter(r => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (r.order_number ?? `#${r.id}`).toLowerCase().includes(q)
      || userMatches(q, r.user)
  })

  const columns: ListColumn<RechargeRecord>[] = [
    {
      key: 'orderNumber', label: '單號',
      sortValue: r => r.order_number ?? `#${r.id}`,
      className: 'font-mono',
      render: r => <span className="font-semibold text-neutral-800">{r.order_number ?? `#${r.id}`}</span>,
    },
    {
      key: 'user', label: '會員',
      sortValue: r => r.user?.name ?? '',
      render: r => (
        <UserCell memberNo={r.user?.member_no} uuid={r.user?.id} name={r.user?.name} email={r.user?.email}>
          <div className="text-xs text-violet-600">餘額 {(r.user?.tokens ?? 0).toLocaleString()} G</div>
        </UserCell>
      ),
    },
    {
      key: 'amount', label: '金額 (TWD)',
      sortValue: r => Number(r.amount),
      className: 'text-right font-mono font-semibold text-neutral-900',
      render: r => <>NT$ {Number(r.amount).toLocaleString()}</>,
    },
    {
      key: 'status', label: '狀態',
      sortValue: r => r.status,
      render: r => (
        <div className="flex items-center gap-2">
          <Badge variant="warning">待複核</Badge>
          <span className="text-xs text-neutral-500">{r.status}</span>
        </div>
      ),
    },
    {
      key: 'createdAt', label: '建立時間',
      sortValue: r => new Date(r.created_at).getTime(),
      className: 'font-mono',
      render: r => (
        <>
          <div>{new Date(r.created_at).toLocaleString('zh-TW')}</div>
          <div className="text-xs text-neutral-400">{ageLabel(r.created_at)} 建立</div>
        </>
      ),
    },
    {
      key: 'flaggedAt', label: '標記時間',
      sortValue: r => (r.needs_review_at ? new Date(r.needs_review_at).getTime() : 0),
      className: 'font-mono',
      render: r => r.needs_review_at
        ? <span className="text-xs text-rose-400">{ageLabel(r.needs_review_at)} 標記</span>
        : <span className="text-neutral-400">-</span>,
    },
    {
      key: 'note', label: '備註',
      render: r => (
        <div className="w-44">
          <Input
            className="text-xs"
            placeholder="備註（選填）..."
            value={notes[r.id] ?? ''}
            onChange={e => setNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
          />
        </div>
      ),
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: r => (
        <div className="flex items-center gap-2">
          <RowAction onClick={() => router.push(`/users/${r.user_id}`)}>查看用戶</RowAction>
          <RowAction onClick={() => void act(r.id, 'dismiss')}>忽略</RowAction>
          <RowAction tone="primary" onClick={() => void act(r.id, 'force_success')}>
            補發代幣 +{(Number(r.amount) + Number(r.bonus ?? 0)).toLocaleString()} G
          </RowAction>
          <RowAction tone="danger" onClick={() => void act(r.id, 'force_fail')}>標記失敗</RowAction>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="待複核儲值">
      <div className="space-y-6">

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800">
          以下為 <strong>pending 超過 30 分鐘</strong>、尚未收到 ECPay callback 的儲值訂單。
          ECPay 對帳排程（每 2 小時）會自動修復其中已實際付款的訂單；若已超過 2 小時仍顯示，請人工確認。
        </div>

        <ListTableCard
          pageKey="recharge-review"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={loading}
          emptyMessage="目前沒有待複核的儲值訂單"
          searchPlaceholder="搜尋單號、會員名稱..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>
    </AdminLayout>
  )
}
