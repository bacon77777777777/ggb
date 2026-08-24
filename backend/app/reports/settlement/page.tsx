'use client'

import AdminLayout from '@/components/AdminLayout'
import { CardSkeleton } from '@/components/ui/Skeleton'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import SelectField from '@/components/ui/SelectField'
import { useAdmin } from '@/contexts/AdminContext'
import { logExport } from '@/lib/logExport'
import NumberField from '@/components/ui/NumberField'
// 費率設定浮層貼在畫面右緣，泡泡要能自己翻邊才不會被推出視窗 —— 用分析頁那顆 fixed 版
import { InfoIcon as InfoTooltip } from '@/components/analytics/StatCard'

interface Supplier { id: number; name: string }
interface ProductRow { id: number; name: string; price: number; drawCount: number; totalG: number }
interface PeriodData {
  supplierName: string
  products: ProductRow[]
  totalG: number
  totalPlatformG?: number        // 全平台同期消費 G（僅平台管理員）
  // 以下平台級數字廠商帳號拿不到（API 端就不回），型別一律 optional
  consumptionShare?: number      // 0~1，廠商消費佔全平台比例
  rechargeTotal?: number         // 參考用：期間平台儲值總額
  rechargeCount?: number         // 參考用：儲值筆數
  effectiveFeeRate: number | null // 平台實際混合費率（0.0275 = 2.75%），撈不到為 null
  hasActualFee: boolean
  allocatedActualFee: number | null  // 分攤後的實際手續費
  platformTotalFee?: number | null   // 平台手續費總額（僅平台管理員）
  dismantleTotal: number         // 回收退代幣（廠商吸收）
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

/**
 * 費率設定浮層裡的欄位標題（文字 + 藍色驚嘆號）
 *
 * 原本每個欄位下面掛一行小灰字說明，浮層被撐長、字又擠。改成統一掛在驚嘆號裡，
 * 滑過去才看得到 —— 跟分析頁的做法一致。
 */
function FeeLabel({ text, tip }: { text: string; tip: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <label className="text-sm text-neutral-600 whitespace-nowrap">{text}</label>
      <InfoTooltip text={tip} width={280} />
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
      <span className={`text-sm tabular-nums ${bold ? 'font-semibold text-neutral-800' : red ? 'text-red-500' : green ? 'text-green-600' : muted ? 'text-neutral-400' : indigo ? 'font-semibold text-indigo-600' : 'text-neutral-700'}`}>
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
  // 廠商帳號：隱藏費率設定與所有平台級數字。伺服器端也不回那些欄位，
  // 這裡只是不要畫出空欄位；真正的牆在 API
  const { user: adminUser } = useAdmin()
  const isSupplier = adminUser?.role === 'supplier'
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
  const totalDrawCount = data?.products.reduce((s, p) => s + p.drawCount, 0) ?? 0
  const dismantleTotal = Math.round(data?.dismantleTotal ?? 0)
  const couponTotal = Math.round(data?.couponTotal ?? 0)
  const shippingTotal = Math.round(data?.shippingTotal ?? 0)
  const pointsTotal = Math.round(data?.pointsTotal ?? 0)
  const couponSupplierShare = Math.round(couponTotal * 0.5)
  const shippingSupplierShare = Math.round(shippingTotal * 0.5)
  const pointsSupplierShare = pointsMode === 'A' ? Math.round(pointsTotal * 0.5) : 0

  /*
   * 手續費一律是「本廠商消費 × 費率」，差別只在費率哪來：
   * 有實際帳就用平台實付算出來的混合費率（API 的 effectiveFeeRate），
   * 撈不到才用下面手動設定的估算值。
   * 兩條路都只用到廠商自己的消費，對帳單不需要出現任何平台總量。
   */
  const ecpayFee = data?.allocatedActualFee != null
    ? data.allocatedActualFee
    : Math.round(totalTWD * (ecpayRate / 100))
  const effectiveRatePercent = data?.effectiveFeeRate != null
    ? (data.effectiveFeeRate * 100).toFixed(2)
    : null

  const netRevenue = totalTWD - ecpayFee
  const withholding = Math.round(netRevenue * (withholdingRate / 100))
  const netAfterTax = netRevenue - withholding

  // 先從淨收入扣除共同成本（折價券/運費/積分廠商吸收部分），再按比例分潤
  const distributableBase = netAfterTax - couponSupplierShare - shippingSupplierShare - pointsSupplierShare
  const supplierGross = Math.round(distributableBase * (supplierShare / 100))
  const platformShare = distributableBase - supplierGross

  // 最後扣除回收退代幣（廠商全吸收）
  const supplierNet = Math.max(0, supplierGross - dismantleTotal)

  /*
   * 匯出對帳單（CSV）
   *
   * 老闆指定用 CSV。**CSV 沒有頁籤這回事**，所以原本 xlsx 的兩個分頁改成上下兩段：
   * 上面是一列到底的結算摘要（橫式，欄名一列、數值一列，貼進試算表可以把各期疊起來比），
   * 空一行之後接逐商品的消費明細。
   *
   * 橫式是重點 —— 最早的版本是「項目／金額」一列一項的直式，要一路往下捲才讀得完。
   */
  const handleExport = () => {
    if (!data || !period) return

    const feeLabel = effectiveRatePercent ? `綠界手續費(實際費率${effectiveRatePercent}%)` : `綠界手續費(估算${ecpayRate}%)`

    const summary: Record<string, string | number> = {
      廠商: data.supplierName,
      結算期間: `${period.startDate} ~ ${period.endDate}`,
      結算日: period.settlementDate,
      抽獎次數: totalDrawCount,
      '消費代幣(G)': totalTWD,
      '消費金額(TWD)': totalTWD,
      [feeLabel]: -ecpayFee,
      淨收入: netRevenue,
      ...(withholdingRate > 0 ? { [`代扣稅款(${withholdingRate}%)`]: -withholding, 稅後淨收入: netAfterTax } : {}),
      [`折價券(廠商吸收50%，共${couponTotal})`]: -couponSupplierShare,
      [`運費(廠商吸收50%，共${shippingTotal})`]: -shippingSupplierShare,
      [pointsMode === 'A' ? `積分補償(廠商吸收50%，共${pointsTotal})` : `積分補償(平台全吸收，共${pointsTotal}G)`]:
        pointsMode === 'A' ? pointsSupplierShare : 0,
      可分潤基礎: distributableBase,
      [`廠商分潤(${supplierShare}%)`]: supplierGross,
      [`平台留存(${100 - supplierShare}%)`]: platformShare,
      '回收退代幣(廠商吸收100%)': -dismantleTotal,
      實際應付廠商: supplierNet,
      // 平台級數字只給平台管理員，廠商那份完全不帶（API 也不會回）
      ...(isSupplier ? {} : {
        '【平台】期間儲值': data.rechargeTotal ?? 0,
        '【平台】儲值筆數': data.rechargeCount ?? 0,
        ...(data.hasActualFee ? { '【平台】綠界手續費總額': data.platformTotalFee ?? 0 } : {}),
      }),
    }

    // 欄名與商品名都可能含逗號或引號，一律加引號並跳脫
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows: string[] = [
      Object.keys(summary).map(esc).join(','),
      Object.values(summary).map(esc).join(','),
      '',
      ['商品名稱', '單價(G)', '抽獎次數', '消費代幣(G)'].map(esc).join(','),
      ...(data.products.length
        ? data.products.map(p => [p.name, p.price, p.drawCount, p.totalG].map(esc).join(','))
        : [['本期無消費紀錄', '', '', ''].map(esc).join(',')]),
    ]

    const BOM = '\ufeff'   // 少了 BOM，Excel 開中文會變亂碼
    const blob = new Blob([BOM + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `結算對帳單_${data.supplierName}_${period.startDate}_${period.endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
    void logExport('廠商結算', `${data.supplierName}｜${period.startDate}~${period.endDate}｜應付 ${supplierNet}`)
  }

  return (
    <AdminLayout
      pageTitle="廠商結算"
    >
      <div className="space-y-4">

        {/* 頂部控制列 */}
        <div className="space-y-2">
          {/* 一整列：廠商選擇（靠左）＋ 期間 ＋ 匯出 ＋ 費率設定（靠右）
              老闆指定併成同一行。期間那組不換行、寬度不夠時自己橫向捲，
              才不會把右邊的匯出與費率設定擠掉 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 廠商選擇 */}
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-sm text-neutral-500 whitespace-nowrap">廠商</span>
              <SelectField
                value={selectedSupplierId}
                onChange={e => setSelectedSupplierId(e.target.value)}
                className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/20 min-w-[140px]"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
                {suppliers.length === 0 && <option value="">載入中…</option>}
              </SelectField>
            </div>

            {/* 期間按鈕
                小螢幕（< lg）：整條佔滿一行往下折，寬度不夠時自己橫向捲；
                大螢幕：跟廠商選擇、匯出擠同一行。
                按鈕本身 shrink-0 + 文字不換行 —— 不然窄的時候「2026年08月」會被壓成兩行 */}
            {/*
              期間 bar。對齊靠內層的 `w-max ml-auto`，不要在捲動容器上寫 justify-end ——
              那樣塞不下時內容是往「左邊」溢出的，捲軸捲不回去，
              排在最前面的當月（進行中）就永遠看不到，老闆截圖到的正是這個。
              換成 auto margin：塞得下照樣靠右貼著匯出鈕，塞不下時 auto 自動歸零變靠左，
              scrollLeft = 0 第一眼就是當月，其餘往右捲。
            */}
            <div className="order-3 w-full lg:order-none lg:w-auto lg:flex-1 overflow-x-auto scrollbar-hide min-w-0">
              <div className="flex gap-1.5 items-center w-max ml-auto">
                {periods.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPeriodIdx(i)}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      selectedPeriodIdx === i
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {p.label}
                    {p.isCurrent && <span className="ml-1 text-xs opacity-75">進行中</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* 匯出 + 費率設定 */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={!data || loading}
                className="h-9 px-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 transition-colors text-sm font-medium flex items-center gap-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                匯出 CSV
              </button>

              {/* 費率設定浮動：分潤比、代扣稅率、估算費率都是平台端的商業參數，
                  廠商不該看到更不該調 */}
              <div className="relative" ref={settingsRef}>
                {!isSupplier && (
                <button
                  onClick={() => setShowSettings(v => !v)}
                  className={`h-9 px-4 border rounded-lg transition-colors text-sm font-medium flex items-center gap-2 whitespace-nowrap ${
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
                )}

                {!isSupplier && showSettings && (
                  <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-neutral-200 rounded-xl shadow-lg p-4 min-w-[260px]">
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">費率設定</p>
                    <div className="space-y-3">
                      {/*
                        綠界手續費永遠是這一格可填的估算比例，不隨月份切換變成唯讀金額。
                        原本有實際扣款的月份會換成「NT$ x 實際分攤」，切個月份設定欄位就長不一樣，
                        看起來像設定被改掉了 —— 這裡是「設定」，本來就該長期固定；
                        某個月有沒有採用它，寫在驚嘆號裡講就好。
                      */}
                      <div className="flex items-center justify-between gap-3">
                        <FeeLabel
                          text="綠界手續費"
                          tip={
                            '玩家儲值時被金流公司抽走的錢。\n' +
                            '這裡填的是估算比例，只有在該月份沒有綠界實際扣款紀錄時才會拿來算。\n' +
                            '有實際紀錄的月份，結算一律照綠界真的扣走的金額分攤，不受這格影響。'
                          }
                        />
                        {/* 「估算」放輸入框左邊：先讀到這是估的，再看數字（老闆指定） */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-sm text-neutral-500">估算</span>
                          <NumberField value={ecpayRate} onChange={setEcpayRate} min={0} max={10} step={0.05} className="w-16" />
                          <span className="text-sm text-neutral-500">%</span>
                        </div>
                      </div>
                      {[
                        // 上限 100：自家廠商（吉吉比）可能整筆都算自己的，不該被 99 卡住
                        {
                          label: '廠商分潤比', value: supplierShare, setter: setSupplierShare, unit: '%', min: 0, max: 100,
                          tip: '扣掉手續費、稅金、折價券與運費分攤之後，剩下的錢有多少比例要付給廠商。\n填 70 就是廠商拿七成、平台留三成。自家廠商可以填到 100。',
                        },
                        {
                          label: '代扣稅率', value: withholdingRate, setter: setWithholdingRate, unit: '%', min: 0, max: 30,
                          tip: '廠商是個人或工作室、沒有公司統編時，錢不能整筆匯出去，\n平台要先幫他把稅扣下來、之後代為繳給國稅局。\n有統編、開發票請款的廠商填 0。',
                        },
                      ].map(f => (
                        <div key={f.label} className="flex items-center justify-between gap-3">
                          <FeeLabel text={f.label} tip={f.tip} />
                          <div className="flex items-center gap-1 shrink-0">
                            <NumberField value={f.value} onChange={f.setter} min={f.min} max={f.max} className="w-16" />
                            <span className="text-sm text-neutral-500">{f.unit}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-100">
                        <FeeLabel
                          text="積分扣除模式"
                          tip={
                            '玩家用積分折抵掉的那部分，這筆損失要不要算進結算。\n' +
                            `計入：平台補一半給廠商（這期共 ${pointsTotal.toLocaleString()} G）。\n` +
                            '不計：平台自己全部吸收，結算完全不算這筆。'
                          }
                        />
                        <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-xs font-medium shrink-0">
                          <button
                            onClick={() => setPointsMode('A')}
                            className={`px-3 py-1.5 transition-colors ${pointsMode === 'A' ? 'bg-primary text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}
                          >
                            計入
                          </button>
                          <button
                            onClick={() => setPointsMode('B')}
                            className={`px-3 py-1.5 transition-colors border-l border-neutral-200 ${pointsMode === 'B' ? 'bg-primary text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}
                          >
                            不計
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
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

        {loading && <CardSkeleton rows={5} />}

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
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr className="text-xs text-neutral-400 border-b border-neutral-100">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-neutral-500">商品</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500">單價</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500">次數</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-neutral-500">小計</th>
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
              {/* 次數與換算率改掛在驚嘆號裡（老闆指定）：這兩個是「怎麼算出來的」的
                  註解，不是結算項目本身，攤在標題旁邊會跟下面幾列的說明文字打架 */}
              <Row
                label={
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-neutral-800">廠商商品消費</span>
                    <InfoTooltip text={`總次數 ${totalDrawCount.toLocaleString()} 次\n1G = NT$1`} />
                  </div>
                }
                value={fmt(totalTWD)}
                bold
              />
              <Row label={<><span className="text-neutral-600">綠界手續費</span><span className="text-xs text-neutral-400 ml-1.5">{effectiveRatePercent ? `實際費率 ${effectiveRatePercent}%` : `估算 ${ecpayRate}%`}</span></>} value={`−${fmt(ecpayFee)}`} red indent />
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

              {/* ⑤ 廠商分潤 → 再扣回收 */}
              <Row label={<><span className="font-semibold text-neutral-800">廠商分潤</span><span className="text-xs text-neutral-400 ml-1">{supplierShare}%</span></>} value={fmt(supplierGross)} indigo />
              <Row label={<><span className="text-neutral-600">回收退代幣</span><span className="text-xs text-neutral-400 ml-1.5">廠商吸收 100%</span></>} value={`−${fmt(dismantleTotal)}`} red indent />

              {/* 最終結果 */}
              <div className="border-t-2 border-neutral-300 mt-2 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-neutral-800">實際應付廠商</span>
                    <InfoTooltip text={`① 消費 G − 綠界手續費 = 淨收入\n② 淨收入 − 折價券（50%）− 運費（50%）${pointsMode === 'A' ? ' + 積分補償（50%）' : ''} = 可分潤基礎\n③ 可分潤基礎 × ${supplierShare}% = 廠商分潤\n④ 廠商分潤 − 回收退代幣 = 實際應付廠商`} />
                  </div>
                  <span className="text-xl font-bold text-green-600 tabular-nums">{fmt(supplierNet)}</span>
                </div>
                {!period?.isClosed && (
                  <p className="text-xs text-amber-500 mt-1">* 本期尚未結算，以上為預估金額</p>
                )}
              </div>

              {!isSupplier && data?.hasActualFee && (
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
