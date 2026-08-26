'use client'

/**
 * 商城檢舉
 *
 * 玩家商城的錢不經過平台，平台能做的只有兩件事：查得到、停得掉。
 * 這頁就是那兩件事的介面 —— 看檢舉內容、決定要不要停權、留下處理紀錄。
 *
 * ⚠️ 這裡是玩家商城 sell_*，不要跟交易所（marketplace_*）、卡牌交換（exchange_*）搞混。
 *
 * ── 停權的界線 ──
 * 停權只擋「上架」與「被下單」，不動 `users.status`。
 * 玩家照樣能抽獎儲值逛站，也不會中斷已經成立的訂單 ——
 * 那些交易錢可能已經付了，強制中斷只會讓買家更難處理。
 */

import { AdminLayout, PageCard, SearchToolbar, StatsCard, FilterTags, MemberNo } from '@/components'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/Modal'
import Textarea from '@/components/ui/Textarea'
import { TableEmpty } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'

interface SellReport {
  id: number
  target_type: 'listing' | 'order' | 'seller'
  listing_id: number | null
  order_id: number | null
  seller_id: string | null
  reason: string
  detail: string | null
  images: string[]
  status: 'open' | 'resolved' | 'dismissed'
  admin_note: string | null
  handled_at: string | null
  created_at: string
  seller_suspended: boolean
  reporter?: { id: string; name: string; email: string; member_no?: number | null } | null
  seller?: { id: string; name: string; email: string; member_no?: number | null } | null
  listing?: { id: number; title: string; status: string } | null
}

const STATUS_LABEL: Record<SellReport['status'], string> = {
  open: '待處理',
  resolved: '已處理',
  dismissed: '已駁回',
}

const TARGET_LABEL: Record<SellReport['target_type'], string> = {
  listing: '商品',
  order: '訂單',
  seller: '賣家',
}

type Filter = 'all' | 'open' | 'resolved' | 'dismissed'

const FILTER_LABEL: Record<Filter, string> = {
  all: '全部',
  open: '待處理',
  resolved: '已處理',
  dismissed: '已駁回',
}

export default function SellReportsPage() {
  const { toast } = useToast()
  const [reports, setReports] = useState<SellReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('open')
  const [searchQuery, setSearchQuery] = useState('')
  // 表格偏好照「商品管理」的配方：密度與欄位開關記在 localStorage（per 管理員）
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('sell_reports', 'compact', {
    target: true,
    reason: true,
    reporter: true,
    seller: true,
    status: true,
    createdAt: true,
    operations: true,
  })

  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  /** 處理檢舉（結案／駁回）的彈窗 */
  const [handleTarget, setHandleTarget] = useState<{ report: SellReport; next: 'resolved' | 'dismissed' } | null>(null)
  const [adminNote, setAdminNote] = useState('')
  /** 停權彈窗 */
  const [suspendTarget, setSuspendTarget] = useState<SellReport | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/sell/reports', { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '載入失敗')
      setReports(await res.json())
    } catch (e: any) {
      toast(e?.message || '載入失敗', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return reports.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      const src = [
        r.reason,
        r.detail || '',
        r.reporter?.name || '',
        r.reporter?.email || '',
        r.seller?.name || '',
        r.seller?.email || '',
        r.seller_id || '',
        r.listing?.title || '',
        String(r.listing_id || ''),
        String(r.order_id || ''),
      ].join(' ').toLowerCase()
      return src.includes(q)
    })
  }, [filter, reports, searchQuery])

  const stats = useMemo(() => ({
    open: reports.filter(r => r.status === 'open').length,
    total: reports.length,
    suspended: new Set(reports.filter(r => r.seller_suspended).map(r => r.seller_id)).size,
  }), [reports])

  const submitHandle = async () => {
    if (!handleTarget) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/sell/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: handleTarget.report.id, status: handleTarget.next, adminNote }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '更新失敗')
      toast(handleTarget.next === 'resolved' ? '已標記為處理完成' : '已駁回')
      setHandleTarget(null)
      setAdminNote('')
      await load()
    } catch (e: any) {
      toast(e?.message || '更新失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const setSuspended = async (report: SellReport, suspended: boolean, reason: string) => {
    if (!report.seller_id) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/sell/sellers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sellerId: report.seller_id, suspended, reason }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '更新失敗')
      toast(suspended ? '已停權' : '已解除停權')
      setSuspendTarget(null)
      setSuspendReason('')
      await load()
    } catch (e: any) {
      toast(e?.message || '更新失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const densityClasses = getDensityClasses()

  return (
    <AdminLayout pageTitle="商城檢舉" pageSubtitle="玩家商城的糾紛處理與賣家停權">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatsCard title="待處理" value={stats.open} />
          <StatsCard title="總檢舉" value={stats.total} />
          <StatsCard title="停權中賣家" value={stats.suspended} />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋原因、會員、商品、訂單編號..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showColumnToggle={true}
            columns={[
              { key: 'target', label: '檢舉對象', visible: visibleColumns.target },
              { key: 'reason', label: '原因', visible: visibleColumns.reason },
              { key: 'reporter', label: '檢舉人', visible: visibleColumns.reporter },
              { key: 'seller', label: '被檢舉賣家', visible: visibleColumns.seller },
              { key: 'status', label: '狀態', visible: visibleColumns.status },
              { key: 'createdAt', label: '時間', visible: visibleColumns.createdAt },
              { key: 'operations', label: '操作', visible: visibleColumns.operations },
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns({ ...visibleColumns, [key]: visible })}
            showFilter={true}
            filterOptions={[
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                value: filter,
                onChange: setFilter,
                options: (Object.keys(FILTER_LABEL) as Filter[]).map(k => ({ value: k, label: FILTER_LABEL[k] })),
              },
            ]}
          />

          {filter !== 'all' && (
            <div className="mt-3">
              <FilterTags
                tags={[
                  {
                    key: 'status',
                    label: '狀態',
                    value: FILTER_LABEL[filter],
                    color: 'primary',
                    onRemove: () => setFilter('all'),
                  },
                ]}
              />
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {visibleColumns.target && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>檢舉對象</th>
                  )}
                  {visibleColumns.reason && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>原因</th>
                  )}
                  {visibleColumns.reporter && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>檢舉人</th>
                  )}
                  {visibleColumns.seller && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>被檢舉賣家</th>
                  )}
                  {visibleColumns.status && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>狀態</th>
                  )}
                  {visibleColumns.createdAt && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>時間</th>
                  )}
                  {visibleColumns.operations && (
                    <th className={`${densityClasses} text-left text-xs font-semibold text-neutral-500 sticky right-0 bg-neutral-50 z-20 border-l border-neutral-200 whitespace-nowrap`}>
                      操作
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton rows={5} cols={7} />
                ) : shown.length === 0 ? (
                  <TableEmpty colSpan={7} message={filter === 'open' ? '目前沒有待處理的檢舉' : '目前沒有檢舉紀錄'} />
                ) : (
                  shown.map(r => (
                    <tr key={r.id} className="group border-b border-neutral-100 hover:bg-neutral-50">
                      {visibleColumns.target && (
                      <td className={`${densityClasses} align-top`}>
                        <div className="flex flex-col gap-1">
                          <Badge variant="default">{TARGET_LABEL[r.target_type]}</Badge>
                          {r.listing_id && (
                            <Link href={`/sell?id=${r.listing_id}`} className="text-xs text-primary hover:underline">
                              {r.listing?.title || `#${r.listing_id}`}
                            </Link>
                          )}
                          {r.order_id && (
                            <Link href={`/sell-orders/${r.order_id}`} className="text-xs text-primary hover:underline">
                              訂單 #{r.order_id}
                            </Link>
                          )}
                        </div>
                      </td>
                      )}
                      {visibleColumns.reason && (
                      <td className={`${densityClasses} max-w-[280px] align-top`}>
                        <div className="text-sm text-neutral-900">{r.reason}</div>
                        {r.detail && <div className="mt-1 text-xs leading-relaxed text-neutral-500">{r.detail}</div>}
                        {r.images?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.images.map((src, i) => (
                              <a key={src} href={src} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                                附圖{i + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      )}
                      {visibleColumns.reporter && (
                      <td className={`${densityClasses} whitespace-nowrap align-top text-sm text-neutral-700`}>
                        {r.reporter?.name || '—'}
                      </td>
                      )}
                      {visibleColumns.seller && (
                      <td className={`${densityClasses} whitespace-nowrap align-top`}>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-neutral-700">{r.seller?.name || '—'}</span>
                          {r.seller_id && <MemberNo no={r.seller?.member_no ?? null} uuid={r.seller_id} />}
                          {r.seller_suspended && <Badge variant="danger">停權中</Badge>}
                        </div>
                      </td>
                      )}
                      {visibleColumns.status && (
                      <td className={`${densityClasses} whitespace-nowrap align-top`}>
                        <div className="flex flex-col gap-1">
                          <Badge status={r.status === 'open' ? 'pending' : r.status === 'resolved' ? 'active' : 'removed'}>
                            {STATUS_LABEL[r.status]}
                          </Badge>
                          {r.admin_note && (
                            <span className="max-w-[160px] text-xs text-neutral-400" title={r.admin_note}>
                              {r.admin_note}
                            </span>
                          )}
                        </div>
                      </td>
                      )}
                      {visibleColumns.createdAt && (
                      <td className={`${densityClasses} whitespace-nowrap align-top text-sm text-neutral-600`}>
                        {formatDateTime(r.created_at)}
                      </td>
                      )}
                      {visibleColumns.operations && (
                      <td className={`${densityClasses} whitespace-nowrap align-top sticky right-0 bg-white group-hover:bg-neutral-50 z-20 border-l border-neutral-200`}>
                        <div className="flex flex-col gap-2">
                          {r.status === 'open' && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setHandleTarget({ report: r, next: 'resolved' }); setAdminNote('') }}
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white transition-colors hover:bg-primary-dark"
                              >
                                處理完成
                              </button>
                              <button
                                type="button"
                                onClick={() => { setHandleTarget({ report: r, next: 'dismissed' }); setAdminNote('') }}
                                className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-200"
                              >
                                駁回
                              </button>
                            </div>
                          )}
                          {r.seller_id && (
                            r.seller_suspended ? (
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => setSuspended(r, false, '')}
                                className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-200 disabled:opacity-60"
                              >
                                解除停權
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setSuspendTarget(r); setSuspendReason('') }}
                                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-100"
                              >
                                停權賣家
                              </button>
                            )
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      </div>

      <Modal
        isOpen={handleTarget !== null}
        onClose={() => setHandleTarget(null)}
        title={handleTarget?.next === 'resolved' ? '標記為處理完成' : '駁回檢舉'}
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            寫下你做了什麼。這是內部紀錄，之後同一個賣家再被檢舉時看得到前因後果。
          </p>
          <Textarea
            rows={4}
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            placeholder={handleTarget?.next === 'resolved'
              ? '例如：已聯繫賣家補寄，買家確認收到'
              : '例如：買家誤會出貨時間，已說明，無違規'}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHandleTarget(null)}>取消</Button>
            <Button onClick={submitHandle} isLoading={isSaving}>確認</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
        title={`停權賣家「${suspendTarget?.seller?.name || ''}」`}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
            停權後這位賣家不能再上架，現有商品也不能被下單。
            <strong className="font-semibold">已經成立的訂單不受影響</strong> ——
            那些交易錢可能已經付了，強制中斷只會讓買家更難處理。
            這不是全站封鎖，他照樣可以抽獎與儲值。
          </div>
          <Textarea
            rows={3}
            value={suspendReason}
            onChange={e => setSuspendReason(e.target.value)}
            placeholder="停權原因（必填）。例如：多次收款後不出貨，共 3 筆檢舉"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSuspendTarget(null)}>取消</Button>
            <Button
              onClick={() => suspendTarget && setSuspended(suspendTarget, true, suspendReason.trim())}
              disabled={!suspendReason.trim()}
              isLoading={isSaving}
            >
              確認停權
            </Button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}
