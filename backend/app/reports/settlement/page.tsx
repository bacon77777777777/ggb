'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useEffect, useCallback } from 'react'

interface Supplier { id: number; name: string }
interface ProductRow { id: number; name: string; price: number; drawCount: number; totalG: number }
interface PeriodData {
  supplierName: string
  products: ProductRow[]
  totalG: number
  rechargeTotal: number
  rechargeCount: number
}

interface Period {
  label: string
  startDate: string
  endDate: string
  settlementDate: string
  isClosed: boolean
  isCurrent: boolean
}

// 期別 = 每月1日~月底，結算日 = 次月5日
function generatePeriods(today: Date, count: number): Period[] {
  const periods: Period[] = []
  const pad = (n: number) => String(n).padStart(2, '0')
  for (let i = 0; i < count; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() // 0-indexed
    const lastDay = new Date(year, month + 1, 0).getDate()
    const startDate = `${year}-${pad(month + 1)}-01`
    const endDate   = `${year}-${pad(month + 1)}-${lastDay}`
    const settlementObj = new Date(year, month + 1, 5) // 次月5日
    const settlementDate = `${settlementObj.getFullYear()}-${pad(settlementObj.getMonth() + 1)}-05`
    const isClosed  = today > settlementObj
    const isCurrent = i === 0
    const label = `${year}年${pad(month + 1)}月`
    periods.push({ label, startDate, endDate, settlementDate, isClosed, isCurrent })
  }
  return periods
}

function fmt(n: number) {
  return `NT$ ${Math.round(n).toLocaleString()}`
}

function KpiRow({ label, value, sub, indent = false, bold = false, negative = false }: {
  label: string; value: string; sub?: string; indent?: boolean; bold?: boolean; negative?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${indent ? 'pl-4' : ''} ${bold ? 'font-semibold' : ''}`}>
      <span className={`text-sm ${negative ? 'text-red-600' : 'text-neutral-700'}`}>{label}</span>
      <div className="text-right">
        <span className={`text-sm tabular-nums ${negative ? 'text-red-600' : bold ? 'text-neutral-900' : 'text-neutral-700'}`}>
          {negative && value !== 'NT$ 0' ? `−${value}` : value}
        </span>
        {sub && <div className="text-xs text-neutral-400">{sub}</div>}
      </div>
    </div>
  )
}

export default function SettlementPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0)
  const [data, setData] = useState<PeriodData | null>(null)
  const [loading, setLoading] = useState(false)

  // 費率設定
  const [newebpayRate, setNewebpayRate] = useState(2)      // 藍新手續費 %
  const [supplierShare, setSupplierShare] = useState(70)   // 廠商分潤 %
  const [withholdingRate, setWithholdingRate] = useState(0) // 代扣稅率 %
  const [showSettings, setShowSettings] = useState(false)

  const periods = generatePeriods(new Date(), 7)
  const period = periods[selectedPeriodIdx]

  // 載入廠商清單
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then(r => r.json())
      .then(json => {
        const list: Supplier[] = json.data ?? []
        setSuppliers(list)
        if (list.length > 0) setSelectedSupplierId(String(list[0].id))
      })
  }, [])

  // 查詢結算資料
  const fetchData = useCallback(async () => {
    if (!selectedSupplierId || !period) return
    setLoading(true)
    setData(null)
    try {
      const params = new URLSearchParams({
        tab: 'settlement',
        supplierId: selectedSupplierId,
        start: period.startDate,
        end: period.endDate,
      })
      const res = await fetch(`/api/admin/reports?${params}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedSupplierId, period?.startDate, period?.endDate])

  useEffect(() => { fetchData() }, [fetchData])

  // 計算結算金額（基底：期間成功儲值 TWD）
  const totalTWD = data?.rechargeTotal ?? 0
  const newebpayFee = Math.round(totalTWD * (newebpayRate / 100))
  const netRevenue = totalTWD - newebpayFee
  const supplierGross = Math.round(netRevenue * (supplierShare / 100))
  const withholding = Math.round(supplierGross * (withholdingRate / 100))
  const supplierNet = supplierGross - withholding
  const platformShare = netRevenue - supplierGross

  // 匯出對帳單 CSV
  const handleExport = () => {
    if (!data || !period) return
    const BOM = '﻿'
    const rows: string[][] = [
      [`廠商結算對帳單`],
      [`廠商`, data.supplierName],
      [`結算期間`, `${period.startDate} ~ ${period.endDate}`],
      [`結算日`, period.settlementDate],
      [],
      [`商品名稱`, `單價(G)`, `抽獎次數`, `消費代幣(G)`],
      ...(data.products.map(p => [p.name, String(p.price), String(p.drawCount), String(p.totalG)])),
      [],
      [`項目`, `金額(TWD)`],
      [`期間儲值總額（${data.rechargeCount}筆）`, String(totalTWD)],
      [`藍新手續費(${newebpayRate}%)`, String(-newebpayFee)],
      [`淨收入`, String(netRevenue)],
      [`廠商分潤(${supplierShare}%)`, String(supplierGross)],
      ...(withholdingRate > 0 ? [[`代扣稅款(${withholdingRate}%)`, String(-withholding)]] : []),
      [`實際應付廠商`, String(supplierNet)],
      [`平台留存(${100 - supplierShare}%)`, String(platformShare)],
    ]
    const csv = BOM + rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `結算對帳單_${data.supplierName}_${period.startDate}_${period.endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout
      pageTitle="廠商結算"
      breadcrumbs={[{ label: '金流報表' }, { label: '廠商結算', href: '/reports/settlement' }]}
    >
      <div className="space-y-4">

        {/* 頂部控制列 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-wrap items-center gap-4">
          {/* 廠商選擇 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500 whitespace-nowrap">廠商</span>
            <select
              value={selectedSupplierId}
              onChange={e => setSelectedSupplierId(e.target.value)}
              className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {suppliers.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
              {suppliers.length === 0 && <option value="">無廠商資料</option>}
            </select>
          </div>

          {/* 期間按鈕 */}
          <div className="flex gap-1.5 flex-wrap">
            {periods.map((p, i) => (
              <button
                key={i}
                onClick={() => setSelectedPeriodIdx(i)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  selectedPeriodIdx === i
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                {p.label}
                {!p.isClosed && (
                  <span className="ml-1 text-xs opacity-75">進行中</span>
                )}
              </button>
            ))}
          </div>

          {/* 費率設定 toggle */}
          <button
            onClick={() => setShowSettings(v => !v)}
            className="ml-auto flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            費率設定
          </button>
        </div>

        {/* 費率設定面板 */}
        {showSettings && (
          <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '藍新手續費', value: newebpayRate, setter: setNewebpayRate, unit: '%', min: 0, max: 10 },
              { label: '廠商分潤比', value: supplierShare, setter: setSupplierShare, unit: '%', min: 1, max: 99 },
              { label: '代扣稅率', value: withholdingRate, setter: setWithholdingRate, unit: '%', min: 0, max: 30 },
            ].map(f => (
              <div key={f.label}>
                <label className="text-xs text-neutral-500 mb-1 block">{f.label}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={f.value}
                    min={f.min}
                    max={f.max}
                    onChange={e => f.setter(Number(e.target.value))}
                    className="w-20 text-sm border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="text-sm text-neutral-500">{f.unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 期間標題 */}
        {period && (
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-800">
                {period.label} 結算期
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                {period.startDate} ～ {period.endDate}
                {!period.isClosed && (
                  <span className="ml-2 text-amber-500 font-medium">● 進行中（預估值）</span>
                )}
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={!data || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              匯出對帳單
            </button>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center text-sm text-neutral-400">
            載入中…
          </div>
        )}

        {!loading && data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* 商品明細 */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100">
                <h3 className="text-sm font-semibold text-neutral-700">商品消費明細</h3>
              </div>
              {data.products.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-400">本期無消費紀錄</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-neutral-400 border-b border-neutral-100">
                      <th className="text-left px-4 py-2">商品</th>
                      <th className="text-right px-4 py-2">單價</th>
                      <th className="text-right px-4 py-2">次數</th>
                      <th className="text-right px-4 py-2">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map(p => (
                      <tr key={p.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                        <td className="px-4 py-2.5 text-neutral-700">{p.name}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-500 tabular-nums">{p.price} G</td>
                        <td className="px-4 py-2.5 text-right text-neutral-500 tabular-nums">{p.drawCount.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{p.totalG.toLocaleString()} G</td>
                      </tr>
                    ))}
                    <tr className="bg-neutral-50 font-semibold">
                      <td className="px-4 py-2.5 text-neutral-700" colSpan={2}>合計</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{data.products.reduce((s, p) => s + p.drawCount, 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{data.totalG.toLocaleString()} G</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* 結算計算 */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-700">結算計算</h3>
                <span className="text-xs text-neutral-400">結算日 {period?.settlementDate}</span>
              </div>

              <KpiRow
                label={`期間儲值總額（${data?.rechargeCount ?? 0} 筆）`}
                value={fmt(totalTWD)}
                bold
              />
              <div className="border-t border-neutral-100 my-1" />

              <KpiRow
                label={`藍新手續費（${newebpayRate}%）`}
                value={fmt(newebpayFee)}
                negative
                indent
              />
              <div className="border-t border-neutral-200 my-1" />
              <KpiRow label="淨收入" value={fmt(netRevenue)} bold />

              <div className="border-t border-neutral-100 my-2" />

              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-neutral-500">廠商分潤（{supplierShare}%）</span>
                <span className="text-sm font-medium tabular-nums text-indigo-600">{fmt(supplierGross)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-neutral-500">平台留存（{100 - supplierShare}%）</span>
                <span className="text-sm font-medium tabular-nums text-neutral-600">{fmt(platformShare)}</span>
              </div>

              {withholdingRate > 0 && (
                <KpiRow
                  label={`代扣稅款（${withholdingRate}%，從廠商分潤扣）`}
                  value={fmt(withholding)}
                  negative
                  indent
                />
              )}

              <div className="border-t-2 border-neutral-300 mt-3 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-neutral-800">實際應付廠商</span>
                  <span className="text-xl font-bold text-emerald-600 tabular-nums">{fmt(supplierNet)}</span>
                </div>
                {!period?.isClosed && (
                  <p className="text-xs text-amber-500 mt-1">* 本期尚未結算，以上為預估金額</p>
                )}
              </div>
            </div>

          </div>
        )}

        {!loading && data && data.products.length === 0 && (
          <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center text-sm text-neutral-400">
            本期無此廠商的消費紀錄
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
