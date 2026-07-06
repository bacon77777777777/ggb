'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useEffect, useCallback } from 'react'

interface RechargeRecord {
  id: number
  order_number: string | null
  amount: number
  status: string
  needs_review: boolean
  needs_review_at: string | null
  review_note: string | null
  created_at: string
  user_id: string
  user: { id: string; name: string | null; email: string | null; tokens: number } | null
}

function ageLabel(created_at: string): string {
  const mins = Math.floor((Date.now() - new Date(created_at).getTime()) / 60_000)
  if (mins < 60) return `${mins} 分鐘前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小時前`
  return `${Math.floor(hrs / 24)} 天前`
}

export default function RechargeReviewPage() {
  const [records, setRecords]   = useState<RechargeRecord[]>([])
  const [loading, setLoading]   = useState(false)
  const [notes, setNotes]       = useState<Record<number, string>>({})
  const [acting, setActing]     = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/admin/recharge-review')
    const data = await res.json()
    setRecords(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id: number, action: 'dismiss' | 'force_fail') => {
    if (action === 'force_fail') {
      if (!confirm('確定將此筆儲值標記為「失敗」？此操作不可逆。')) return
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

  return (
    <AdminLayout pageTitle="待複核儲值" breadcrumbs={[{ label: '對帳報表' }, { label: '待複核儲值' }]}>
      <div className="space-y-4">

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800">
          以下為 <strong>pending 超過 30 分鐘</strong>、尚未收到 ECPay callback 的儲值訂單。
          ECPay 對帳排程（每 2 小時）會自動修復其中已實際付款的訂單；若已超過 2 小時仍顯示，請人工確認。
        </div>

        {loading ? (
          <div className="text-center py-16 text-neutral-400">載入中...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-neutral-400">
            <p className="text-4xl mb-3">✅</p>
            <p>目前沒有待複核的儲值訂單</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(r => {
              const age = ageLabel(r.created_at)
              const flaggedAge = r.needs_review_at ? ageLabel(r.needs_review_at) : null
              return (
                <div key={r.id} className="bg-white rounded-xl border border-neutral-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-neutral-800">
                          {r.order_number ?? `#${r.id}`}
                        </span>
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                          待複核
                        </span>
                        <span className="text-xs text-neutral-400">{age} 建立</span>
                        {flaggedAge && (
                          <span className="text-xs text-rose-400">• {flaggedAge} 標記</span>
                        )}
                      </div>
                      <div className="text-sm text-neutral-700">
                        <span className="font-medium">{r.user?.name || '(未命名)'}</span>
                        <span className="text-neutral-400 ml-2">{r.user?.email}</span>
                        <span className="ml-2 text-violet-600">餘額 {(r.user?.tokens ?? 0).toLocaleString()} G</span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        建立：{new Date(r.created_at).toLocaleString('zh-TW')}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-neutral-900">NT$ {Number(r.amount).toLocaleString()}</p>
                      <p className="text-xs text-neutral-500">{r.status}</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-2 flex-wrap">
                    <input
                      className="flex-1 min-w-0 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                      placeholder="備註（選填）..."
                      value={notes[r.id] ?? ''}
                      onChange={e => setNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                    />
                    <a
                      href={`/users/${r.user_id}`}
                      className="px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 whitespace-nowrap"
                    >
                      查看用戶
                    </a>
                    <button
                      onClick={() => act(r.id, 'dismiss')}
                      disabled={acting === r.id}
                      className="px-3 py-1.5 text-sm bg-neutral-50 text-neutral-700 rounded-lg border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50 whitespace-nowrap"
                    >
                      忽略
                    </button>
                    <button
                      onClick={() => act(r.id, 'force_fail')}
                      disabled={acting === r.id}
                      className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 whitespace-nowrap"
                    >
                      標記失敗
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
