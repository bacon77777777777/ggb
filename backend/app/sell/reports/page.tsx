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

import { AdminLayout, PageCard, StatsCard, CopyableID } from '@/components'
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
  reporter?: { id: string; name: string; email: string } | null
  seller?: { id: string; name: string; email: string } | null
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

type Filter = 'open' | 'all'

export default function SellReportsPage() {
  const { toast } = useToast()
  const [reports, setReports] = useState<SellReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('open')

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

  const shown = useMemo(
    () => (filter === 'open' ? reports.filter(r => r.status === 'open') : reports),
    [filter, reports]
  )

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

  return (
    <AdminLayout pageTitle="商城檢舉" pageSubtitle="玩家商城的糾紛處理與賣家停權">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatsCard title="待處理" value={stats.open} />
          <StatsCard title="總檢舉" value={stats.total} />
          <StatsCard title="停權中賣家" value={stats.suspended} />
        </div>

        <PageCard>
          <div className="mb-4 flex items-center gap-2">
            {([
              { v: 'open' as const, label: `待處理（${stats.open}）` },
              { v: 'all' as const, label: '全部' },
            ]).map(o => (
              <button
                key={o.v}
                type="button"
                onClick={() => setFilter(o.v)}
                className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                  filter === o.v ? 'bg-primary font-medium text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  {['檢舉對象', '原因', '檢舉人', '被檢舉賣家', '狀態', '時間', '操作'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-neutral-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton rows={5} cols={7} />
                ) : shown.length === 0 ? (
                  <TableEmpty colSpan={7} message={filter === 'open' ? '目前沒有待處理的檢舉' : '目前沒有檢舉紀錄'} />
                ) : (
                  shown.map(r => (
                    <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="px-4 py-3 align-top">
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
                      <td className="max-w-[280px] px-4 py-3 align-top">
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
                      <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-neutral-700">
                        {r.reporter?.name || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-neutral-700">{r.seller?.name || '—'}</span>
                          {r.seller_id && <CopyableID id={r.seller_id} />}
                          {r.seller_suspended && <Badge variant="danger">停權中</Badge>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
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
                      <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-neutral-600">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
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
