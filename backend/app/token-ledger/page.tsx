'use client'

import { useState, useCallback } from 'react'

const IconSearch = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
const IconCoin = ({ size = 18 }: { size?: number }) => <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
const IconArrowUp = ({ size = 12 }: { size?: number }) => <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
const IconArrowDown = ({ size = 12 }: { size?: number }) => <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
const IconRefresh = ({ size = 14 }: { size?: number }) => <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>

interface UserResult {
  id: string
  name: string
  email: string
  tokens: number
}

interface LedgerRow {
  type: 'recharge' | 'draw' | 'dismantle' | 'manual' | 'marketing' | 'test'
  user_id: string
  delta: number
  description: string
  ref_id: number
  created_at: string
  balance_after: number | null
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  recharge:  { label: '儲值',    color: 'text-green-600 bg-green-50' },
  draw:      { label: '抽獎',    color: 'text-rose-600 bg-rose-50' },
  dismantle: { label: '拆解退',  color: 'text-amber-600 bg-amber-50' },
  manual:    { label: '手動調整', color: 'text-purple-600 bg-purple-50' },
  marketing: { label: '行銷贈點', color: 'text-primary bg-primary' },
  test:      { label: '測試',    color: 'text-neutral-500 bg-neutral-100' },
}

export default function TokenLedgerPage() {
  const [searchQ, setSearchQ]       = useState('')
  const [userResults, setUserResults] = useState<UserResult[]>([])
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
  const [ledger, setLedger]         = useState<LedgerRow[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [pages, setPages]           = useState(1)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingLedger, setLoadingLedger] = useState(false)

  const searchUsers = useCallback(async () => {
    if (!searchQ.trim()) return
    setLoadingSearch(true)
    const res = await fetch(`/api/admin/token-ledger?q=${encodeURIComponent(searchQ)}`)
    const data = await res.json()
    setUserResults(data.users ?? [])
    setLoadingSearch(false)
  }, [searchQ])

  const loadLedger = useCallback(async (user: UserResult, p = 1) => {
    setLoadingLedger(true)
    setSelectedUser(user)
    setPage(p)
    const res = await fetch(`/api/admin/token-ledger?userId=${user.id}&page=${p}`)
    const data = await res.json()
    if (data.user) setSelectedUser(data.user)
    setLedger(data.ledger ?? [])
    setTotal(data.total ?? 0)
    setPages(data.pages ?? 1)
    setLoadingLedger(false)
    setUserResults([])
    setSearchQ('')
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">代幣帳本</h1>

      {/* 搜尋 */}
      <div className="flex gap-2">
        <input
          className="flex-1 border border-neutral-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
          placeholder="輸入用戶 Email 或名稱搜尋..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchUsers()}
        />
        <button
          onClick={searchUsers}
          disabled={loadingSearch}
          className="flex items-center gap-1 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-50"
        >
          <IconSearch size={16} />
          搜尋
        </button>
      </div>

      {/* 搜尋結果 */}
      {userResults.length > 0 && (
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
          {userResults.map(u => (
            <button
              key={u.id}
              onClick={() => loadLedger(u)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 text-left border-b last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">{u.name || '（未命名）'}</p>
                <p className="text-xs text-neutral-500">{u.email}</p>
              </div>
              <div className="flex items-center gap-1 text-sm font-semibold text-violet-700">
                <IconCoin size={14} />
                {(u.tokens ?? 0).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 用戶帳本 */}
      {selectedUser && (
        <div className="space-y-4">
          {/* 用戶資訊列 */}
          <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-lg px-4 py-3">
            <div>
              <p className="font-semibold text-neutral-900">{selectedUser.name || '（未命名）'}</p>
              <p className="text-sm text-neutral-500">{selectedUser.email}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-500">目前餘額</p>
              <p className="text-xl font-bold text-violet-700 flex items-center gap-1">
                <IconCoin size={18} />
                {(selectedUser.tokens ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* 明細表 */}
          <div className="border border-neutral-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500">時間</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500">類型</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500">說明</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500">異動</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500">累計餘額</th>
                </tr>
              </thead>
              <tbody>
                {loadingLedger ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-neutral-400">載入中...</td>
                  </tr>
                ) : ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-neutral-400">無代幣異動紀錄</td>
                  </tr>
                ) : (
                  ledger.map((row, i) => {
                    const isPositive = row.delta > 0
                    const meta = TYPE_LABEL[row.type] ?? { label: row.type, color: 'text-neutral-600 bg-neutral-100' }
                    return (
                      <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString('zh-TW', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-neutral-700 max-w-xs truncate">{row.description}</td>
                        <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${isPositive ? 'text-green-600' : 'text-rose-600'}`}>
                          <span className="inline-flex items-center gap-0.5">
                            {isPositive ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
                            {isPositive ? '+' : ''}{row.delta.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-neutral-700 font-mono">
                          {row.balance_after !== null ? row.balance_after.toLocaleString() : '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 分頁 + 合計 */}
          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>共 {total.toLocaleString()} 筆</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadLedger(selectedUser, page - 1)}
                disabled={page <= 1 || loadingLedger}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-neutral-50"
              >
                上一頁
              </button>
              <span>{page} / {pages}</span>
              <button
                onClick={() => loadLedger(selectedUser, page + 1)}
                disabled={page >= pages || loadingLedger}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-neutral-50"
              >
                下一頁
              </button>
              <button
                onClick={() => loadLedger(selectedUser, 1)}
                className="px-3 py-1 flex items-center gap-1 border rounded hover:bg-neutral-50"
              >
                <IconRefresh size={14} />
                重整
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
