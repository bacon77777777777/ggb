'use client'

import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import SelectField from '@/components/ui/SelectField'
import Input from '@/components/ui/Input'
import { Badge, type BadgeProps } from '@/components/ui'
import { DataTable, type Column } from '@/components'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { logExport } from '@/lib/logExport'
import { TOKEN_ADJUSTMENT_CATEGORIES, TOKEN_ADJUSTMENT_CATEGORY_KEYS } from '@/lib/tokenAdjustmentCategories'

/**
 * 手動調整明細 —— token_ledger 裡 type='manual' 的全部（token_adjustments），依會計分類拆開。
 * 對帳公式 expected = recharge_total + manual_total − draw_total − refund_deducted 的 manual_total 就是這頁的淨額。
 */

interface Row {
  id: number
  created_at: string
  user_id: string
  userName: string
  userEmail: string
  delta: number
  reason: string
  created_by: string
  category: string
  categoryLabel: string
}
interface CatSum { count: number; plus: number; minus: number; net: number }

const CATEGORY_VARIANT: Record<string, BadgeProps['variant']> = {
  marketing:    'primary',
  correction:   'warning',
  internal:     'default',
  shipping_fee: 'info',
  sell:         'info',
  marketplace:  'info',
  slot:         'info',
  real_payment: 'success',
  other:        'danger',
}

const fmt = (n: number) => n.toLocaleString()
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

/** created_by 給人看：GB哥／admin#3／system:delivery… */
const actorLabel = (by: string) => {
  if (!by) return '—'
  if (by === 'admin') return '後台管理員'
  if (by.startsWith('admin#')) return `管理員 #${by.slice(6)}（經 GB哥）`
  if (by === 'GB哥') return 'GB哥'
  if (by.startsWith('system')) return '系統'
  if (by === 'marketplace') return '交易所'
  return by
}

export default function AdjustmentsReportPage() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  const firstOfMonth = today.slice(0, 8) + '01'

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [category, setCategory] = useState('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [byCategory, setByCategory] = useState<Record<string, CatSum>>({})
  const [total, setTotal] = useState<CatSum>({ count: 0, plus: 0, minus: 0, net: 0 })
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ start: startDate, end: endDate })
      if (category !== 'all') params.set('category', category)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/reports/adjustments?${params}`)
      const json = await res.json()
      setRows(json.data ?? [])
      setByCategory(json.byCategory ?? {})
      setTotal(json.total ?? { count: 0, plus: 0, minus: 0, net: 0 })
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, category, q])

  useEffect(() => {
    const t = setTimeout(fetchData, 250)   // 搜尋框打字防抖
    return () => clearTimeout(t)
  }, [fetchData])

  const handleExport = () => {
    if (!rows.length) return
    const BOM = '﻿'
    const header = ['時間', '分類', '用戶', 'Email', '增減(G)', '原因', '操作者']
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const body = rows.map(r => [
      fmtTime(r.created_at), r.categoryLabel, r.userName, r.userEmail, String(r.delta), r.reason, actorLabel(r.created_by),
    ].map(esc))
    const csv = BOM + [header.map(esc), ...body].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = `手動調整明細_${startDate}_${endDate}${category !== 'all' ? `_${TOKEN_ADJUSTMENT_CATEGORIES[category]}` : ''}.csv`
    a.href = url
    a.download = name
    void logExport('手動調整明細', name)
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns: Column<Row>[] = [
    { key: 'created_at', label: '時間', className: 'text-xs text-neutral-500 font-mono whitespace-nowrap',
      render: r => <>{fmtTime(r.created_at)}</> },
    { key: 'category', label: '分類',
      render: r => <Badge variant={CATEGORY_VARIANT[r.category] ?? 'default'} size="sm">{r.categoryLabel}</Badge> },
    { key: 'user', label: '用戶',
      render: r => (
        <div className="leading-tight">
          <Link href={`/users/${r.user_id}`} className="text-primary hover:underline font-medium text-xs">{r.userName}</Link>
          <div className="text-[11px] text-neutral-400">{r.userEmail}</div>
        </div>
      ) },
    { key: 'delta', label: '增減', className: 'text-right whitespace-nowrap',
      render: r => (
        <>
          <span className={`text-sm font-bold ${r.delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>{signed(r.delta)}</span>
          <span className="text-xs text-neutral-400 ml-1">G</span>
        </>
      ) },
    { key: 'reason', label: '原因', className: 'text-xs text-neutral-700 max-w-[28rem]',
      render: r => <span className="break-all">{r.reason || '—'}</span> },
    { key: 'created_by', label: '操作者', className: 'text-xs text-neutral-500 whitespace-nowrap',
      render: r => <>{actorLabel(r.created_by)}</> },
  ]

  // 小計卡只列這段區間有出現的分類，照固定順序
  const presentCats = TOKEN_ADJUSTMENT_CATEGORY_KEYS.filter(k => byCategory[k])

  return (
    <AdminLayout pageTitle="手動調整明細">
      <div className="space-y-4">

        {/* 工具列 */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <div className="w-56">
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜尋用戶／Email／原因"
            />
          </div>
          <SelectField
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            <option value="all">全部分類</option>
            {TOKEN_ADJUSTMENT_CATEGORY_KEYS.map(k => (
              <option key={k} value={k}>{TOKEN_ADJUSTMENT_CATEGORIES[k]}</option>
            ))}
          </SelectField>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            placeholder="選擇日期範圍"
          />
          {rows.length > 0 && (
            <button
              onClick={handleExport}
              className="h-9 px-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              匯出 CSV
            </button>
          )}
        </div>

        {/* 摘要 KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <p className="text-xs text-neutral-500 mb-1">筆數</p>
            <p className="text-2xl font-black text-neutral-900">{loading ? '—' : fmt(total.count)}</p>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <p className="text-xs text-neutral-500 mb-1">補出（＋）</p>
            <p className="text-2xl font-black text-green-600">{loading ? '—' : fmt(total.plus)}</p>
            <p className="text-xs text-neutral-400 mt-0.5">G 幣</p>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <p className="text-xs text-neutral-500 mb-1">扣回（−）</p>
            <p className="text-2xl font-black text-red-500">{loading ? '—' : fmt(total.minus)}</p>
            <p className="text-xs text-neutral-400 mt-0.5">G 幣</p>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <p className="text-xs text-neutral-500 mb-1">淨額（對帳 manual_total）</p>
            <p className={`text-2xl font-black ${total.net >= 0 ? 'text-neutral-900' : 'text-red-500'}`}>{loading ? '—' : signed(total.net)}</p>
            <p className="text-xs text-neutral-400 mt-0.5">G 幣</p>
          </div>
        </div>

        {/* 分類小計 */}
        {!loading && presentCats.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <p className="text-xs font-semibold text-neutral-500 mb-3">分類小計</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {presentCats.map(k => {
                const c = byCategory[k]
                return (
                  <button
                    key={k}
                    onClick={() => setCategory(prev => (prev === k ? 'all' : k))}
                    className={`text-left rounded-lg border p-3 transition-colors ${category === k ? 'border-primary bg-primary/5' : 'border-neutral-100 hover:border-neutral-300'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge variant={CATEGORY_VARIANT[k] ?? 'default'} size="sm">{TOKEN_ADJUSTMENT_CATEGORIES[k]}</Badge>
                      <span className="text-[11px] text-neutral-400">{fmt(c.count)} 筆</span>
                    </div>
                    <div className={`text-lg font-black ${c.net >= 0 ? 'text-neutral-900' : 'text-red-500'}`}>{signed(c.net)} <span className="text-xs text-neutral-400 font-normal">G</span></div>
                    <div className="text-[11px] text-neutral-400">＋{fmt(c.plus)}／−{fmt(c.minus)}</div>
                  </button>
                )
              })}
            </div>
            {byCategory.other && (
              <p className="mt-3 text-xs text-red-500">
                有 {fmt(byCategory.other.count)} 筆分不出分類（寫入時沒帶 category、原因文字也對不上規則），請到會員頁確認後補註。
              </p>
            )}
          </div>
        )}

        {/* 明細表 */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable
              data={rows}
              columns={columns}
              keyField="id"
              rowClassName={() => 'border-b border-neutral-100 hover:bg-neutral-50 transition-colors'}
              isLoading={loading}
              emptyMessage="此區間無手動調整紀錄"
              footer={
                <tr className="bg-neutral-50 border-t-2 border-neutral-200">
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-neutral-700">合計 {fmt(total.count)} 筆</td>
                  <td className={`px-4 py-3 text-right text-sm font-black ${total.net >= 0 ? 'text-neutral-900' : 'text-red-500'}`}>{signed(total.net)} G</td>
                  <td colSpan={2} className="px-4 py-3 text-xs text-neutral-400">＋{fmt(total.plus)}／−{fmt(total.minus)}</td>
                </tr>
              }
            />
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}
