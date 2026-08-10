'use client'

import { AdminLayout, ListTableCard, RowAction, type ListColumn } from '@/components'
import { useState, useEffect, useCallback } from 'react'

type EventStatus = 'pending' | 'processed' | 'dismissed'

interface AgentEvent {
  id: string
  event_type: string
  source_agent: string
  payload: Record<string, any>
  status: EventStatus
  created_at: string
  processed_at: string | null
  processed_by: string | null
}

const EVENT_CONFIG: Record<string, { icon: string; label: string; agentLabel: string; actionHint: string }> = {
  category_suggestion: {
    icon:        '🏷️',
    label:       '商品分類建議',
    agentLabel:  '行銷長',
    actionHint:  '請至後台商品管理，將商品加入建議分類標籤',
  },
  restock_needed: {
    icon:        '📦',
    label:       '補貨需求',
    agentLabel:  '供應鏈協調員',
    actionHint:  '請聯絡廠商補貨，或下架商品以免前台顯示售完',
  },
  freeze_pending_payment: {
    icon:        '💰',
    label:       '凍結帳號有待處理儲值',
    agentLabel:  '風控長',
    actionHint:  '請確認是否退款或保留此筆儲值',
  },
  competitor_trending: {
    icon:        '🕵️',
    label:       '競品新動態',
    agentLabel:  '市場情報官',
    actionHint:  '請評估是否調整行銷策略或商品定價',
  },
  revenue_anomaly: {
    icon:        '📉',
    label:       '營收異常',
    agentLabel:  '財務長',
    actionHint:  '請查看詳細報告並確認原因',
  },
  platform_incident: {
    icon:        '🔴',
    label:       '平台異常',
    agentLabel:  '健康監控員',
    actionHint:  '請立即確認平台狀態',
  },
}

const STATUS_TABS: { value: EventStatus; label: string }[] = [
  { value: 'pending',   label: '待處理' },
  { value: 'processed', label: '已處理' },
  { value: 'dismissed', label: '已略過' },
]

function eventDetail(ev: AgentEvent): string {
  const p = ev.payload
  switch (ev.event_type) {
    case 'category_suggestion':
      return `文案偵測到關鍵字「${(p.matched_keywords as string[] ?? []).join('、')}」\n→ 建議為《${p.product_name}》新增分類標籤「${p.suggested_category}」`
    case 'restock_needed':
      return `《${p.product_name}》${p.issue ?? '庫存不足'}\n廠商：${p.supplier_name ?? '未分配'}`
    case 'freeze_pending_payment':
      return `用戶：${p.user_name}\n有 ${p.pending_count} 筆 pending 儲值，共 NT$ ${Number(p.total_amount ?? 0).toLocaleString()}\n凍結原因：${p.frozen_reason}`
    case 'competitor_trending':
      return `競品：${p.competitor ?? ''}\n${p.summary ?? p.content ?? ''}`
    case 'revenue_anomaly':
      return `${p.description ?? JSON.stringify(p)}`
    case 'platform_incident':
      return `${p.message ?? JSON.stringify(p)}`
    default:
      return JSON.stringify(p, null, 2)
  }
}

function twTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000)
  return `${d.getUTCFullYear()}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCDate().toString().padStart(2, '0')} ${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
}

export default function AgentEventsPage() {
  const [events, setEvents]           = useState<AgentEvent[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [activeTab, setActiveTab]     = useState<EventStatus>('pending')
  const [loading, setLoading]         = useState(true)
  const [updating, setUpdating]       = useState<Set<string>>(new Set())

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/agent-events?status=${activeTab}&limit=50`)
    if (res.ok) {
      const data = await res.json()
      setEvents(data.events ?? [])
      setPendingCount(data.pendingCount ?? 0)
    }
    setLoading(false)
  }, [activeTab])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  async function updateStatus(ids: string[], status: 'processed' | 'dismissed') {
    setUpdating(prev => new Set([...prev, ...ids]))
    await fetch('/api/admin/agent-events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids, status }),
    })
    setUpdating(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
    fetchEvents()
  }

  async function handleAll(status: 'processed' | 'dismissed') {
    const ids = events.filter(e => e.status === 'pending').map(e => e.id)
    if (ids.length > 0) await updateStatus(ids, status)
  }

  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(new Set())
  const [search, setSearch] = useState('')

  const cfgOf = (ev: AgentEvent) => EVENT_CONFIG[ev.event_type] ?? {
    icon: '🔔', label: ev.event_type, agentLabel: ev.source_agent, actionHint: '',
  }

  const filtered = events.filter(ev => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return cfgOf(ev).label.toLowerCase().includes(q)
      || eventDetail(ev).toLowerCase().includes(q)
  })

  const columns: ListColumn<AgentEvent>[] = [
    {
      key: 'type', label: '事件',
      sortValue: ev => cfgOf(ev).label,
      render: ev => (
        <div className="flex items-center gap-2">
          <span className="leading-none">{cfgOf(ev).icon}</span>
          <span className="text-sm font-semibold text-neutral-800">{cfgOf(ev).label}</span>
        </div>
      ),
    },
    {
      key: 'agent', label: '來源單位',
      sortValue: ev => cfgOf(ev).agentLabel,
      render: ev => (
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
          {cfgOf(ev).agentLabel}
        </span>
      ),
    },
    {
      key: 'summary', label: '摘要',
      render: ev => (
        <p className="max-w-md truncate text-[13px] text-neutral-600">
          {eventDetail(ev).replace(/\n/g, '｜')}
        </p>
      ),
    },
    {
      key: 'createdAt', label: '時間',
      sortValue: ev => new Date(ev.created_at).getTime(),
      className: 'font-mono',
      render: ev => <span className="text-xs text-neutral-400">{twTime(ev.created_at)}</span>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: ev => ev.status === 'pending' ? (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => updateStatus([ev.id], 'processed')}>
            {updating.has(ev.id) ? '處理中…' : '已處理'}
          </RowAction>
          <RowAction onClick={() => updateStatus([ev.id], 'dismissed')}>略過</RowAction>
        </div>
      ) : (
        <span className="text-xs text-neutral-400">
          {ev.status === 'processed' ? '已處理' : '已略過'}
        </span>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="事件中心">
      <div className="space-y-4">
        {/* 狀態頁籤（輪播圖管理同款 pill）＋批次動作 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex w-fit gap-1 rounded-lg bg-neutral-100 p-1">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.value
                    ? 'bg-white text-neutral-800 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {tab.label}
                {tab.value === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'pending' && events.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => handleAll('processed')}
                className="rounded-lg border border-green-200 px-3 py-1.5 text-xs text-green-700 transition-colors hover:bg-green-50"
              >
                全部標為已處理
              </button>
              <button
                onClick={() => handleAll('dismissed')}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-50"
              >
                全部略過
              </button>
            </div>
          )}
        </div>

        {activeTab === 'pending' && (
          <p className="text-xs text-neutral-400">
            各 AI 單位偵測到需要跨部門協作的事件，會自動記錄於此。處理後請標記，以免重複跟進。
          </p>
        )}

        <ListTableCard
          pageKey="agent-events"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={loading}
          emptyMessage={activeTab === 'pending' ? '目前沒有待處理事件' : '沒有事件紀錄'}
          defaultSortField="createdAt"
          defaultSortDirection="desc"
          searchPlaceholder="搜尋事件內容..."
          searchValue={search}
          onSearchChange={setSearch}
          expandedIds={expandedIds}
          onExpandChange={setExpandedIds}
          renderExpanded={ev => (
            <div className="space-y-3">
              <pre className="whitespace-pre-wrap rounded-lg bg-white px-3 py-2.5 font-sans text-sm leading-relaxed text-neutral-700">
                {eventDetail(ev)}
              </pre>
              {cfgOf(ev).actionHint && (
                <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <span className="mt-0.5">→</span>
                  <span>{cfgOf(ev).actionHint}</span>
                </div>
              )}
              {ev.processed_at && (
                <p className="text-xs text-neutral-400">
                  {ev.status === 'processed' ? '已處理' : '已略過'}｜{twTime(ev.processed_at)}
                  {ev.processed_by ? `（${ev.processed_by}）` : ''}
                </p>
              )}
            </div>
          )}
        />
      </div>
    </AdminLayout>
  )
}
