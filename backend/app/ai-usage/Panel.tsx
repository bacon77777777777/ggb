'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminLayout, DateRangePicker, ListTableCard, type ListColumn } from '@/components'
import { useToast } from '@/contexts/ToastContext'
import { logExport } from '@/lib/logExport'

/**
 * AI 用量
 *
 * 版型完全沿用機台報表（KPI 小卡 + SearchToolbar + SortableTableHeader），
 * 不另做一套。金額為依模型費率換算的估算值，實際帳單以 Anthropic 後台為準。
 */

interface AgentRow {
  agent: string
  calls: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  models: string[]
}
interface DailyRow {
  day: string
  calls: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

const COLUMNS = [
  { key: 'agent',  label: 'AI 單位' },
  { key: 'calls',  label: '呼叫次數' },
  { key: 'input',  label: '輸入 tokens' },
  { key: 'output', label: '輸出 tokens' },
  { key: 'cost',   label: '估算費用' },
]

const fmt = (n: number) => n.toLocaleString('zh-TW')
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`
const twd = (n: number) => `約 NT$${Math.round(n * 32).toLocaleString('zh-TW')}`

function KpiCard({ label, value, sub, color = 'text-neutral-900' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿'
  const content = bom + [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  void logExport('AI 用量', `${filename}（${rows.length} 筆）`)
  URL.revokeObjectURL(url)
}

export function AiUsagePanel() {
  const agentColumns: ListColumn<AgentRow>[] = [
    {
      key: 'agent', label: 'AI 單位',
      sortValue: r => r.agent,
      render: r => (
        <div>
          <p className="font-medium text-neutral-800">{r.agent}</p>
          {r.models.length > 0 && <p className="text-xs text-neutral-400">{r.models.join(' / ')}</p>}
        </div>
      ),
    },
    { key: 'calls',  label: '呼叫次數',    className: 'tabular-nums', sortValue: r => r.calls,         render: r => <>{fmt(r.calls)}</> },
    { key: 'input',  label: '輸入 tokens', className: 'tabular-nums', sortValue: r => r.input_tokens,  render: r => <>{fmt(r.input_tokens)}</> },
    { key: 'output', label: '輸出 tokens', className: 'tabular-nums', sortValue: r => r.output_tokens, render: r => <>{fmt(r.output_tokens)}</> },
    { key: 'cost',   label: '估算費用',    className: 'tabular-nums font-medium', sortValue: r => r.cost_usd, render: r => <>{usd(r.cost_usd)}</> },
  ]

  const dailyColumns: ListColumn<DailyRow>[] = [
    {
      key: "day",
      label: "日期",
      className: "font-mono",
      sortValue: d => d.day,
      render: (d) => (<>{d.day}</>),
    },
    {
      key: "calls",
      label: "呼叫次數",
      className: "tabular-nums",
      sortValue: d => d.calls,
      render: (d) => (<>{fmt(d.calls)}</>),
    },
    {
      key: "input",
      label: "輸入 tokens",
      className: "tabular-nums",
      sortValue: d => d.input_tokens,
      render: (d) => (<>{fmt(d.input_tokens)}</>),
    },
    {
      key: "output",
      label: "輸出 tokens",
      className: "tabular-nums",
      sortValue: d => d.output_tokens,
      render: (d) => (<>{fmt(d.output_tokens)}</>),
    },
    {
      key: "cost",
      label: "估算費用",
      className: "tabular-nums",
      sortValue: d => d.cost_usd,
      render: (d) => (<>{usd(d.cost_usd)}</>),
    },
  ]

  const { toast } = useToast()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'comfortable'>('normal')
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    Object.fromEntries(COLUMNS.map(c => [c.key, true]))
  )
  const [sortField, setSortField] = useState('cost')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (start) qs.set('start', start)
      if (end) qs.set('end', end)
      const res = await fetch(`/api/admin/ai-usage?${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '載入失敗')
      setAgents(data.agents ?? [])
      setDaily(data.daily ?? [])
    } catch (e) {
      toast((e as Error).message || '載入失敗', 'error')
      setAgents([]); setDaily([])
    } finally {
      setLoading(false)
    }
  }, [start, end, toast])

  useEffect(() => { load() }, [load])

  const handleSort = (field: string) => {
    if (field === sortField) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  const visibleRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q ? agents.filter(a => a.agent.toLowerCase().includes(q)) : agents
    const val = (r: AgentRow) => {
      switch (sortField) {
        case 'calls':  return r.calls
        case 'input':  return r.input_tokens
        case 'output': return r.output_tokens
        case 'cost':   return r.cost_usd
        default:       return r.cost_usd
      }
    }
    return [...filtered].sort((a, b) =>
      sortField === 'agent'
        ? (sortDir === 'asc' ? 1 : -1) * a.agent.localeCompare(b.agent)
        : (sortDir === 'asc' ? val(a) - val(b) : val(b) - val(a))
    )
  }, [agents, searchQuery, sortField, sortDir])

  const totals = useMemo(() => {
    const sum = (fn: (r: AgentRow) => number) => visibleRows.reduce((a, r) => a + fn(r), 0)
    const cost = sum(r => r.cost_usd)
    const days = daily.length || 1
    return {
      calls: sum(r => r.calls),
      input: sum(r => r.input_tokens),
      output: sum(r => r.output_tokens),
      cost,
      perDay: cost / days,
      days,
    }
  }, [visibleRows, daily])

  const show = (k: string) => visibleColumns[k] !== false
  const dc = tableDensity === 'compact' ? 'py-2 px-2' : tableDensity === 'comfortable' ? 'py-4 px-6' : 'py-3 px-4'

  const handleExport = () => {
    exportCSV(`AI用量_${start || '全部'}_${end || ''}.csv`,
      ['AI 單位', '呼叫次數', '輸入 tokens', '輸出 tokens', '估算費用 USD', '模型'],
      visibleRows.map(r => [r.agent, String(r.calls), String(r.input_tokens), String(r.output_tokens), r.cost_usd.toFixed(6), r.models.join(' / ')])
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <DateRangePicker startDate={start} endDate={end} onStartDateChange={setStart} onEndDateChange={setEnd} placeholder="選擇日期範圍" />
        </div>

        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="估算費用" value={usd(totals.cost)} sub={twd(totals.cost)} color="text-primary" />
            <KpiCard label="平均每日" value={usd(totals.perDay)} sub={`${totals.days} 天有紀錄・月估 ${usd(totals.perDay * 30)}`} color="text-indigo-600" />
            <KpiCard label="呼叫次數" value={fmt(totals.calls)} sub={`${visibleRows.length} 個 AI 單位`} />
            <KpiCard label="Tokens" value={fmt(totals.input + totals.output)} sub={`輸入 ${fmt(totals.input)}・輸出 ${fmt(totals.output)}`} />
          </div>
        )}

        <ListTableCard
          pageKey="ai-usage"
          data={visibleRows}
          columns={agentColumns}
          keyField="agent"
          isLoading={loading}
          emptyMessage="此區間沒有 AI 用量紀錄"
          searchPlaceholder="搜尋 AI 單位..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onExportCSV={handleExport}
          summaryRow={cols => cols.map(c => {
            const v = c.key === 'agent' ? `合計（${visibleRows.length} 個單位）`
              : c.key === 'calls'  ? fmt(totals.calls)
              : c.key === 'input'  ? fmt(totals.input)
              : c.key === 'output' ? fmt(totals.output)
              : usd(totals.cost)
            return (
              <td key={c.key} className={`py-2 px-2 text-sm ${c.key === 'agent' ? 'text-neutral-700' : 'tabular-nums'} ${c.key === 'cost' ? 'text-primary' : ''}`}>
                {v}
              </td>
            )
          })}
        />

        {!loading && daily.length > 0 && (
          <div className="space-y-2">
            <ListTableCard
              pageKey="ai-usage-daily"
              data={daily}
              columns={dailyColumns}
              keyField="day"
              emptyMessage="沒有每日紀錄"
              defaultSortField="day"
              defaultSortDirection="desc"
            />
            <p className="px-1 text-xs text-neutral-400">
              費用為依模型費率換算的估算值，實際帳單以 Anthropic 後台為準。匯率以 1 USD = 32 TWD 概算。
            </p>
          </div>
        )}
      </div>
    </>
  )
}
