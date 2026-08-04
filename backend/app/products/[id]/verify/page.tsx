'use client'

/**
 * 封存對照表（後台檢視）
 *
 * 舊版這頁 1152 行，在前端重跑一次配獎邏輯來「驗證」。那套邏輯的權重會隨
 * 抽獎順序改變，前端拿不到那份順序，所以它驗的其實只有 hash 對不對，
 * 獎項對不對從來沒被驗過。
 *
 * 現在獎項在上架時就排定並封存，這頁只需要回答三個問題：
 *   1. 承諾值與對照表原文的 SHA-256 對不對得上（表有沒有被動過）
 *   2. 表裡各賞等的張數跟商品設定的一不一樣（有沒有短少）
 *   3. 玩家實際抽到的跟表上排的一不一樣（有沒有被掉包）
 * 三個都能當場算出來，不需要任何假設。
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AdminLayout, PageCard, ConfirmDialog, DataTable, type Column } from '@/components'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/contexts/ToastContext'

interface SealInfo {
  sealed: boolean
  commitment?: string
  tickets?: number
  sealed_at?: string
  closed_out?: number[] | null
}

interface CountRow { id: string; level: string; announced: number; inTable: number }
interface TicketRow {
  id: number
  ticket: number
  sealed: string
  actual: string | null
  userName: string | null
  closed: boolean
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function SealVerifyPage() {
  const params = useParams()
  const productId = Number(params?.id)
  const { toast } = useToast()

  const [productName, setProductName] = useState('')
  const [profitRate, setProfitRate] = useState(1)
  const [seal, setSeal] = useState<SealInfo | null>(null)
  const [sealText, setSealText] = useState<string | null>(null)
  const [counts, setCounts] = useState<CountRow[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [recalculated, setRecalculated] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [confirmClose, setConfirmClose] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/products/${productId}/seal`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)

    setProductName(json.product?.name ?? '')
    setProfitRate(Number(json.product?.profit_rate ?? 1))
    setSeal(json.seal ?? { sealed: false })
    setSealText(json.seal_text ?? null)
    setCounts((json.counts ?? []).map((c: any) => ({ ...c, id: c.level })))
    setTickets((json.tickets ?? []).map((t: any) => ({ ...t, id: t.ticket })))
    setIsLoading(false)
  }, [productId])

  useEffect(() => {
    if (!Number.isFinite(productId)) { setIsLoading(false); return }
    load().catch(e => { toast(e.message ?? '讀取失敗', 'error'); setIsLoading(false) })
  }, [productId, load, toast])

  const recalculate = async () => {
    if (!sealText) return
    const hash = await sha256(sealText)
    setRecalculated(hash)
    const ok = hash === seal?.commitment
    toast(ok ? '與承諾值一致' : '與承諾值不符', ok ? 'success' : 'error')
  }

  const sealNow = async () => {
    const res = await fetch(`/api/admin/products/${productId}/seal/seal-now`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { toast(json.error ?? '封存失敗', 'error'); return }
    toast(`已封存 ${json.tickets} 張籤`)
    load().catch(() => {})
  }

  const closeOut = async () => {
    const res = await fetch(`/api/admin/products/${productId}/close-out`, { method: 'POST' })
    const json = await res.json()
    setConfirmClose(false)
    if (!res.ok) { toast(json.error ?? '結檔失敗', 'error'); return }
    toast(`已結檔，平台回收 ${json.closed_tickets} 張`)
    load().catch(() => {})
  }

  const mismatch = counts.filter(c => c.announced !== c.inTable).length
  const swapped = tickets.filter(t => t.actual && t.actual !== t.sealed).length
  const sold = tickets.filter(t => t.actual).length
  const closedCount = seal?.closed_out?.length ?? 0

  const countColumns: Column<CountRow>[] = [
    { key: 'level', label: '賞等', render: r => <span className="font-medium">{r.level}</span> },
    { key: 'announced', label: '商品設定', className: 'text-right tabular-nums' },
    { key: 'inTable', label: '表裡張數', className: 'text-right tabular-nums' },
    {
      key: 'result', label: '結果',
      render: r => (
        <Badge color={r.announced === r.inTable ? 'green' : 'red'}>
          {r.announced === r.inTable ? '相符' : '不符'}
        </Badge>
      ),
    },
  ]

  const ticketColumns: Column<TicketRow>[] = [
    { key: 'ticket', label: '籤號', className: 'tabular-nums' },
    { key: 'sealed', label: '表上排定', render: r => <span className="font-medium">{r.sealed}</span> },
    {
      key: 'actual', label: '實際抽出',
      render: r => r.closed
        ? <span className="text-neutral-400">平台回收</span>
        : r.actual
          ? <span className={r.actual === r.sealed ? '' : 'text-red-500 font-medium'}>{r.actual}</span>
          : <span className="text-neutral-400">未售出</span>,
    },
    { key: 'userName', label: '抽中玩家', render: r => r.userName ?? <span className="text-neutral-400">—</span> },
  ]

  if (isLoading) {
    return <AdminLayout pageTitle="封存對照表"><CardSkeleton /></AdminLayout>
  }

  if (!seal?.sealed) {
    return (
      <AdminLayout pageTitle="封存對照表">
        <PageCard>
          <p className="text-sm text-neutral-600">
            這個商品沒有封存對照表。上架時會自動排籤封存，
            已經開賣過的商品則無法補排 —— 事後才公布承諾值等於沒有承諾。
          </p>
          <div className="flex items-center gap-2 mt-4">
            <Button onClick={sealNow}>立即排籤封存</Button>
            <Link href="/products" className="text-sm text-primary px-2">回商品列表</Link>
          </div>
        </PageCard>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout pageTitle={`封存對照表－${productName}`}>
      <div className="space-y-4">
        <PageCard>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2 min-w-0 flex-1">
              <div className="text-sm text-neutral-500">開賣時公布的承諾值</div>
              <code className="block text-xs font-mono break-all bg-neutral-50 rounded-lg p-3 text-neutral-700">
                {seal.commitment}
              </code>
              <div className="text-sm text-neutral-500">
                {seal.tickets} 張籤 ・ 殺率 {Math.round(profitRate * 100)}% ・
                封存於 {seal.sealed_at ? new Date(seal.sealed_at).toLocaleString('zh-TW') : '—'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="secondary" onClick={recalculate}>重算驗證</Button>
              {closedCount === 0 && sold < (seal.tickets ?? 0) && (
                <Button onClick={() => setConfirmClose(true)}>結束此檔</Button>
              )}
            </div>
          </div>

          {recalculated && (
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <div className="text-sm text-neutral-500 mb-2">對照表原文重算</div>
              <code className="block text-xs font-mono break-all bg-neutral-50 rounded-lg p-3 text-neutral-700">
                {recalculated}
              </code>
              <div className="mt-2">
                <Badge color={recalculated === seal.commitment ? 'green' : 'red'}>
                  {recalculated === seal.commitment ? '一致，對照表未被異動' : '不一致，對照表已被異動'}
                </Badge>
              </div>
            </div>
          )}
        </PageCard>

        <PageCard>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-medium text-neutral-800">數量對照</h2>
            <Badge color={mismatch === 0 ? 'green' : 'red'}>
              {mismatch === 0 ? '全部相符' : `${mismatch} 項不符`}
            </Badge>
          </div>
          <DataTable data={counts} columns={countColumns} keyField="id" emptyMessage="無資料" />
        </PageCard>

        <PageCard>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h2 className="text-sm font-medium text-neutral-800">逐籤對照</h2>
            <Badge color={swapped === 0 ? 'green' : 'red'}>
              {swapped === 0 ? '無掉包' : `${swapped} 張與表不符`}
            </Badge>
            <span className="text-sm text-neutral-500">
              已售出 {sold} / {seal.tickets}
              {closedCount > 0 && ` ・ 平台回收 ${closedCount}`}
            </span>
          </div>
          <DataTable data={tickets} columns={ticketColumns} keyField="id" emptyMessage="無資料" />
        </PageCard>
      </div>

      <ConfirmDialog
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={closeOut}
        type="warning"
        title="結束此檔"
        message={`未售出的 ${(seal.tickets ?? 0) - sold} 張籤由平台回收，商品標記為已完抽並可繼續上架顯示。回收的品項歸平台庫存，不產生抽獎紀錄，也不影響報表。此操作不可復原。`}
      />
    </AdminLayout>
  )
}
