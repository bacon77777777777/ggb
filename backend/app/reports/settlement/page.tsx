'use client'

import AdminLayout from '@/components/AdminLayout'
import React, { useState, useEffect, useCallback, useRef } from 'react'

interface Supplier { id: number; name: string }
interface ProductRow { id: number; name: string; price: number; drawCount: number; totalG: number }
interface PeriodData {
  supplierName: string
  products: ProductRow[]
  totalG: number
  totalPlatformG: number
  consumptionShare: number       // 0~1，廠商消費佔全平台比例
  rechargeTotal: number          // 參考用：期間平台儲值總額
  rechargeCount: number          // 參考用：儲值筆數
  hasActualFee: boolean
  allocatedActualFee: number | null  // 分攤後的實際手續費
  platformTotalFee: number | null    // 平台手續費總額（參考）
  dismantleTotal: number         // 分解退代幣（廠商吸收）
  couponTotal: number            // 折價券折抵總額（雙方各吸收一半）
  shippingTotal: number          // 運費總額（雙方各吸收一半）
  pointsTotal: number            // 積分支付 G 等值（模式 A 時廠商吸收一半）
}

interface Period {
  label: string
  startDate: string
  endDate: string
  settlementDate: string
  isClosed: boolean
  isCurrent: boolean
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative flex-shrink-0" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold cursor-help select-none leading-none">
        !
      </div>
      {show && (
        <div className="absolute left-0 top-5 w-64 bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl z-50 leading-relaxed whitespace-normal pointer-events-none">
          {text}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bold, red, green, muted, indigo, indent }: {
  label: React.ReactNode; value: string
  bold?: boolean; red?: boolean; green?: boolean; muted?: boolean; indigo?: boolean; indent?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-1 ${indent ? 'pl-3' : ''}`}>
      <div className="text-sm">{label}</div>
      <span className={`text-sm tabular-nums ${bold ? 'font-semibold text-neutral-800' : red ? 'text-red-500' : green ? 'text-emerald-600' : muted ? 'text-neutral-400' : indigo ? 'font-semibold text-indigo-600' : 'text-neutral-700'}`}>
        {value}
      </span>
    </div>
  )
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


export default function SettlementPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(1) // default 上月
  const [data, setData] = useState<PeriodData | null>(null)
  const [loading, setLoading] = useState(false)

  // 費率設定
  const [ecpayRate, setEcpayRate] = useState(2.75)
  const [supplierShare, setSupplierShare] = useState(70)
  const [withholdingRate, setWithholdingRate] = useState(0)
  const [pointsMode, setPointsMode] = useState<'A' | 'B'>('B') // B = 平台全吸收（預設）
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  const periods = generatePeriods(new Date(), 7)
  const period = periods[selectedPeriodIdx]

  // 點外部關閉費率設定
  useEffect(() => {
    if (!showSettings) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  // 載入廠商清單（API 回傳直接陣列）
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then(r => r.json())
      .then(json => {
        const list: Supplier[] = Array.isArray(json) ? json : (json.data ?? [])
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
      if (json?.error) { console.error('settlement API error:', json.error); return }
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedSupplierId, period?.startDate, period?.endDate])

  useEffect(() => { fetchData() }, [fetchData])

  // 結算基底：廠商商品消費 G（1G = NT$1）
  const totalTWD = data?.totalG ?? 0
  const sharePercent = Math.round((data?.consumptionShare ?? 1) * 100)
  const dismantleTotal = Math.round(data?.dismantleTotal ?? 0)
  const couponTotal = Math.round(data?.couponTotal ?? 0)
  const shippingTotal = Math.round(data?.shippingTotal ?? 0)
  const pointsTotal = Math.round(data?.pointsTotal ?? 0)
  const couponSupplierShare = Math.round(couponTotal * 0.5)
  const shippingSupplierShare = Math.round(shippingTotal * 0.5)
  const pointsSupplierShare = pointsMode === 'A' ? Math.round(pointsTotal * 0.5) : 0

  // 手續費：有實際資料時用分攤後值，否則用費率估算
  const ecpayFee = data?.hasActualFee && data.allocatedActualFee != null
    ? data.allocatedActualFee
    : Math.round(totalTWD * (ecpayRate / 100))

  const netRevenue = totalTWD - ecpayFee
  const withholding = Math.round(netRevenue * (withholdingRate / 100))
  const netAfterTax = netRevenue - withholding

  // 先從淨收入扣除共同成本（折價券/運費/積分廠商吸收部分），再按比例分潤
  const distributableBase = netAfterTax - couponSupplierShare - shippingSupplierShare - pointsSupplierShare
  const supplierGross = Math.round(distributableBase * (supplierShare / 100))
  const platformShare = distributableBase - supplierGross

  // 最後扣除分解退代幣（廠商全吸收）
  const supplierNet = Math.max(0, supplierGross - dismantleTotal)

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
      [`廠商商品消費（${data.products.reduce((s,p)=>s+p.drawCount,0)}次，1G=NT$1）`, String(totalTWD)],
      [`綠界手續費${data.hasActualFee ? '（實際分攤）' : `（估算${ecpayRate}%）`}`, String(-ecpayFee)],
      [`淨收入`, String(netRevenue)],
      ...(withholdingRate > 0 ? [[`代扣稅款(${withholdingRate}%)`, String(-withholding)]] : []),
      ...(withholdingRate > 0 ? [[`稅後淨收入`, String(netAfterTax)]] : []),
      [`折價券（廠商吸收50%，共${couponTotal}）`, String(-couponSupplierShare)],
      [`運費（廠商吸收50%，共${shippingTotal}）`, String(-shippingSupplierShare)],
      ...(pointsMode === 'A' ? [[`積分補償（廠商吸收50%，共${pointsTotal}）`, String(pointsSupplierShare)]] : [[`積分補償（平台全吸收，不計入）`, `${pointsTotal} G`]]),
      [`可分潤基礎`, String(distributableBase)],
      [`廠商分潤(${supplierShare}%)`, String(supplierGross)],
      [`平台留存(${100 - supplierShare}%)`, String(platformShare)],
      [`分解退代幣（廠商吸收100%）`, `-${dismantleTotal}`],
      [`實際應付廠商`, String(supplierNet)],
      [],
      [`--- 參考 ---`, ``],
      [`期間平台儲值`, String(data.rechargeTotal)],
      [`儲值筆數`, String(data.rechargeCount)],
      ...(data.hasActualFee ? [[`平台綠界手續費總額`, String(data.platformTotalFee ?? 0)]] : []),
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
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {/* 廠商選擇 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500 whitespace-nowrap">廠商</span>
              <select
                value={selectedSupplierId}
                onChange={e => setSelectedSupplierId(e.target.value)}
                className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[140px]"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
                {suppliers.length === 0 && <option value="">載入中…</option>}
              </select>
            </div>

            {/* 匯出 + 費率設定（靠右） */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={!data || loading}
                className="px-4 py-2 bg-white border-2 border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                匯出對帳單
              </button>

              {/* 費率設定浮動 */}
              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setShowSettings(v => !v)}
                  className={`px-4 py-2 border-2 rounded-lg transition-colors text-sm font-medium shadow-sm flex items-center gap-2 whitespace-nowrap ${
                    showSettings
                      ? 'bg-neutral-100 border-neutral-300 text-neutral-800'
                      : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-600 hover:shadow-md'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  費率設定
                </button>

                {showSettings && (
                  <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-neutral-200 rounded-xl shadow-lg p-4 min-w-[260px]">
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">費率設定</p>
                    <div className="space-y-3">
                      {/* 綠界手續費：有實際資料時顯示分攤後實際值 */}
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm text-neutral-600 whitespace-nowrap">綠界手續費</label>
                        {data?.hasActualFee ? (
                          <span className="text-sm font-medium text-emerald-600">{fmt(data.allocatedActualFee ?? 0)} 實際分攤</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input type="number" value={ecpayRate} min={0} max={10} step={0.05}
                              onChange={e => setEcpayRate(Number(e.target.value))}
                              className="w-16 text-sm border border-neutral-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-primary/20" />
                            <span className="text-sm text-neutral-500">% 估算</span>
                          </div>
                        )}
                      </div>
                      {[
                        { label: '廠商分潤比', value: supplierShare, setter: setSupplierShare, unit: '%', min: 1, max: 99 },
                        { label: '代扣稅率', value: withholdingRate, setter: setWithholdingRate, unit: '%', min: 0, max: 30 },
                      ].map(f => (
                        <div key={f.label} className="flex items-center justify-between gap-3">
                          <label className="text-sm text-neutral-600 whitespace-nowrap">{f.label}</label>
                          <div className="flex items-center gap-1">
                            <input type="number" value={f.value} min={f.min} max={f.max}
                              onChange={e => f.setter(Number(e.target.value))}
                              className="w-16 text-sm border border-neutral-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-primary/20" />
                            <span className="text-sm text-neutral-500">{f.unit}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-start justify-between gap-3 pt-2 border-t border-neutral-100">
                        <div>
                          <label className="text-sm text-neutral-600 whitespace-nowrap">積分扣除模式</label>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            {pointsMode === 'A' ? '廠商獲補償 50%（共 ' + pointsTotal.toLocaleString() + ' G）' : '平台全吸收，不計入結算'}
                          </p>
                        </div>
                        <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-xs font-medium shrink-0">
                          <button
                            onClick={() => setPointsMode('A')}
                            className={`px-3 py-1.5 transition-colors ${pointsMode === 'A' ? 'bg-primary text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}
                          >
                            A 計入
                          </button>
                          <button
                            onClick={() => setPointsMode('B')}
                            className={`px-3 py-1.5 transition-colors border-l border-neutral-200 ${pointsMode === 'B' ? 'bg-primary text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}
                          >
                            B 不計
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                {p.isCurrent && <span className="ml-1 text-xs opacity-75">進行中</span>}
                {p.isClosed && !p.isCurrent && <span className="ml-1 text-xs opacity-60">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 期間標題列 */}
        {period && (
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-neutral-700">
              {period.label} 結算期
            </h2>
            <span className="text-xs text-neutral-400">{period.startDate} ～ {period.endDate}</span>
            <span className="text-xs text-neutral-400">結算日 {period.settlementDate}</span>
            {period.isCurrent && (
              <span className="text-xs text-amber-500 font-medium">● 進行中（預估值）</span>
            )}
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

              {/* ① 消費基底 */}
              <Row label={<><span className="font-semibold text-neutral-800">廠商商品消費</span><span className="text-xs text-neutral-400 ml-1.5">{data?.products.reduce((s,p)=>s+p.drawCount,0) ?? 0} 次・1G = NT$1</span></>} value={fmt(totalTWD)} bold />
              <Row label={<><span className="text-neutral-600">綠界手續費</span><span className="text-xs text-neutral-400 ml-1.5">{data?.hasActualFee ? '實際分攤' : `估算 ${ecpayRate}%`}</span></>} value={`−${fmt(ecpayFee)}`} red indent />
              <div className="border-t border-neutral-200 my-0.5" />
              <Row label={<span className="font-semibold text-neutral-800">淨收入</span>} value={fmt(netRevenue)} bold />

              {withholdingRate > 0 && (
                <>
                  <Row label={<><span className="text-neutral-600">代扣稅款</span><span className="text-xs text-neutral-400 ml-1">{withholdingRate}%</span></>} value={`−${fmt(withholding)}`} red indent />
                  <div className="border-t border-neutral-200 my-0.5" />
                  <Row label={<span className="font-semibold text-neutral-800">稅後淨收入</span>} value={fmt(netAfterTax)} bold />
                </>
              )}

              {/* ③ 共同成本扣除 */}
              <Row label={<><span className="text-neutral-600">折價券</span><span className="text-xs text-neutral-400 ml-1.5">廠商吸收 50%</span></>} value={`−${fmt(couponSupplierShare)}`} red indent />
              <Row label={<><span className="text-neutral-600">運費</span><span className="text-xs text-neutral-400 ml-1.5">廠商吸收 50%</span></>} value={`−${fmt(shippingSupplierShare)}`} red indent />
              {pointsMode === 'A'
                ? <Row label={<><span className="text-neutral-600">積分補償</span><span className="text-xs text-neutral-400 ml-1.5">廠商吸收 50%</span></>} value={`+${fmt(pointsSupplierShare)}`} green indent />
                : <Row label={<><span className="text-neutral-600">積分補償</span><span className="text-xs text-neutral-400 ml-1.5">平台全吸收</span></>} value={`+${fmt(pointsTotal)}`} green indent />
              }

              {/* ④ 可分潤基礎 → 先扣平台再得廠商分潤 */}
              <div className="border-t border-neutral-200 my-0.5" />
              <Row label={<span className="font-semibold text-neutral-800">可分潤基礎</span>} value={fmt(distributableBase)} bold />
              <Row label={<><span className="text-neutral-400">平台留存</span><span className="text-xs text-neutral-400 ml-1">{100 - supplierShare}%</span></>} value={`−${fmt(platformShare)}`} red indent />
              <div className="border-t border-neutral-200 my-0.5" />

              {/* ⑤ 廠商分潤 → 再扣分解 */}
              <Row label={<><span className="font-semibold text-neutral-800">廠商分潤</span><span className="text-xs text-neutral-400 ml-1">{supplierShare}%</span></>} value={fmt(supplierGross)} indigo />
              <Row label={<><span className="text-neutral-600">分解退代幣</span><span className="text-xs text-neutral-400 ml-1.5">廠商吸收 100%</span></>} value={`−${fmt(dismantleTotal)}`} red indent />

              {/* 最終結果 */}
              <div className="border-t-2 border-neutral-300 mt-2 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-neutral-800">實際應付廠商</span>
                    <InfoTooltip text={`① 消費 G − 綠界手續費 = 淨收入\n② 淨收入 − 折價券（50%）− 運費（50%）${pointsMode === 'A' ? ' + 積分補償（50%）' : ''} = 可分潤基礎\n③ 可分潤基礎 × ${supplierShare}% = 廠商分潤\n④ 廠商分潤 − 分解退代幣 = 實際應付廠商`} />
                  </div>
                  <span className="text-xl font-bold text-emerald-600 tabular-nums">{fmt(supplierNet)}</span>
                </div>
                {!period?.isClosed && (
                  <p className="text-xs text-amber-500 mt-1">* 本期尚未結算，以上為預估金額</p>
                )}
              </div>

              {data?.hasActualFee && (
                <div className="mt-3 pt-3 border-t border-dashed border-neutral-200">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>平台綠界手續費總額</span>
                    <span className="tabular-nums">NT$ {(data?.platformTotalFee ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              )}
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
