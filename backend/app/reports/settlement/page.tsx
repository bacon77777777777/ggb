'use client'

import AdminLayout from '@/components/AdminLayout'
import { CardSkeleton } from '@/components/ui/Skeleton'
import React, { useState, useEffect, useCallback } from 'react'
import SelectField from '@/components/ui/SelectField'
import { useToast } from '@/contexts/ToastContext'
import { useAdmin } from '@/contexts/AdminContext'
import { logExport } from '@/lib/logExport'
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
  dismantleTotal: number         // 回收退代幣（回收價「收」才從廠商扣，「不收」為 0）
  /** 這張單子實際套用的費率，由後端解析（廠商客製 ?? 全站預設）後帶下來 */
  rates?: {
    supplierShare: number
    withholdingRate: number
    pointsMode: 'A' | 'B'
    ecpayRate: number
    customized: string[]
  }
  settlementMode?: 'charge' | 'margin'
  marginSupplierShare?: number   // 差額分給廠商的 %（兩種回收價設定都適用）
  recycleRefundTotal?: number    // 期內退給玩家的回收代幣總額
  recycledRevenueExcluded?: number // margin 模式移出一般分潤基底的抽獎營收
  recycledMarginTotal?: number   // 差額總額＝Σ(單抽價 − 回收價)
  marginToSupplier?: number      // 差額分給廠商的金額
  recycleCount?: number
  /** 往期抽、本期回收造成的調整，有正負號（差額分潤率夠高時會是正的） */
  crossPeriodAdjustment?: number
  crossPeriodCount?: number
  /** 找不到當期快照、用現在的分潤率估的 */
  crossPeriodEstimated?: boolean
  /** 這一期是否已鎖帳（月結快照 confirmed／paid） */
  lock?: {
    id: number | null
    locked: boolean
    status?: 'draft' | 'confirmed' | 'paid' | null
    net?: number | null
    at?: string | null
  }
  /** 未付款期別（僅平台管理員）。取代原本 /settlement-snapshots 那一頁的清單 */
  unpaid?: {
    id: number; supplier_id: number; supplier_name: string
    period_start: string; period_end: string; settlement_date: string
    supplier_net: number; status: 'draft' | 'confirmed'
  }[]
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
  const { toast } = useToast()
  const isSupplier = adminUser?.role === 'supplier'
  /*
   * 確認結算／標記已付款等於「這期對帳單定案了 / 錢付了」，收成 super_admin 專屬
   * （老闆 2026-08-25）。原本那兩顆按鈕在 /settlement-snapshots，
   * 只要有 settlement_snapshots 權限就按得動，而會計角色就有。
   * 這裡只是不畫按鈕，真正的牆在 PATCH /api/admin/settlement-snapshots/[id]。
   */
  const canSettle = adminUser?.role === 'super_admin' || adminUser?.role === 'superadmin'
  const [statusSaving, setStatusSaving] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(1) // default 上月
  const [data, setData] = useState<PeriodData | null>(null)
  const [loading, setLoading] = useState(false)

  /*
   * 費率一律由後端算好帶下來（廠商有客製就用廠商的，否則全站預設）。
   * 這裡不再有可調的 state —— 以前那四個 useState 重整就跳回硬預設，
   * 而且沒有任何地方記得某張對帳單是用幾 % 算的。
   */
  const ecpayRate = data?.rates?.ecpayRate ?? 2.75
  const supplierShare = data?.rates?.supplierShare ?? 70
  const withholdingRate = data?.rates?.withholdingRate ?? 0
  const pointsMode: 'A' | 'B' = data?.rates?.pointsMode ?? 'B'

  const periods = generatePeriods(new Date(), 7)
  const period = periods[selectedPeriodIdx]

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

  const setSnapshotStatus = async (status: 'draft' | 'confirmed' | 'paid') => {
    const id = data?.lock?.id
    if (!id) return
    setStatusSaving(true)
    try {
      const res = await fetch(`/api/admin/settlement-snapshots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '更新失敗')
      toast(status === 'paid' ? '已標記為已付款' : status === 'confirmed' ? '已確認結算' : '已退回草稿')
      await fetchData()
    } catch (e: any) {
      toast(e?.message ?? '更新失敗', 'error')
    } finally {
      setStatusSaving(false)
    }
  }

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

  /*
   * 回收怎麼進結算（老闆 2026-08-25 定案，設定在「商品管理 → 回收價格設定」）
   *
   *   charge ── 抽獎照一般分潤率分，回收價再從廠商扣（改版前的做法）
   *   margin ── 被回收的抽獎整筆移出一般分潤基底，改成
   *             差額 =（單抽價 − 回收價）依比例拆，回收價由平台吸收
   *
   * 兩者互斥，API 已經算好哪一邊是 0，這裡直接用。
   */
  const settlementMode = data?.settlementMode ?? 'margin'
  const recycledRevenueExcluded = Math.round(data?.recycledRevenueExcluded ?? 0)
  const recycledMarginTotal = Math.round(data?.recycledMarginTotal ?? 0)
  const marginToSupplier = Math.round(data?.marginToSupplier ?? 0)
  const marginToPlatform = recycledMarginTotal - marginToSupplier
  const recycleRefundTotal = Math.round(data?.recycleRefundTotal ?? 0)
  const crossPeriodAdjustment = Math.round(data?.crossPeriodAdjustment ?? 0)
  const crossPeriodCount = data?.crossPeriodCount ?? 0
  const lock = data?.lock

  // 先從淨收入扣除共同成本（折價券/運費/積分廠商吸收部分），再按比例分潤
  // margin 模式：被回收的抽獎營收不參與一般分潤，先扣掉
  const distributableBase =
    netAfterTax - couponSupplierShare - shippingSupplierShare - pointsSupplierShare - recycledRevenueExcluded
  const supplierGross = Math.round(distributableBase * (supplierShare / 100))
  const platformShare = distributableBase - supplierGross

  /*
   * 應付廠商 = 一般分潤 + 差額分潤 − 回收扣款
   *
   * ⚠️ 不再用 Math.max(0, …) 夾住。原本扣成負數會被截成 0，那筆欠款就地消失、
   * 也不會結轉到下一期 —— 等於平台自動放棄債權。負數就讓它是負數，
   * 由下面的「本期為負」提示告訴會計要結轉。
   */
  /*
   * 應付廠商 = 一般分潤 + 本期回收差額分潤 − 本期回收扣款 + 往期回收調整
   *
   * 往期回收調整有正負號，不是「追回」—— 差額分潤率高過臨界點時它會是正的。
   */
  const supplierNet = supplierGross + marginToSupplier - dismantleTotal + crossPeriodAdjustment

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
      回收價: settlementMode === 'charge' ? '跟廠商收' : '平台吸收',
      回收筆數: data?.recycleCount ?? 0,
      回收退還玩家代幣: recycleRefundTotal,
      // 0 元的欄位不匯出，理由同畫面上那一列
      ...(settlementMode === 'margin' && recycledRevenueExcluded !== 0
        ? { 被回收抽獎移出分潤基底: -recycledRevenueExcluded } : {}),
      ...(marginToSupplier !== 0
        ? { [`回收差額(共${recycledMarginTotal})廠商分${data?.marginSupplierShare ?? 0}%`]: marginToSupplier } : {}),
      ...(settlementMode === 'charge' && dismantleTotal !== 0
        ? { '回收退代幣(廠商吸收100%)': -dismantleTotal } : {}),
      ...(crossPeriodCount > 0
        ? { [`往期回收調整(${crossPeriodCount}筆上期抽獎)`]: crossPeriodAdjustment }
        : {}),
      ...(lock?.locked ? { 鎖帳狀態: lock.status === 'paid' ? '已付款' : '已確認', 快照金額: lock.net ?? 0 } : {}),
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

              {/*
                「費率設定」浮層已移除（老闆 2026-08-25）。
                那四個值本來是頁面上的 useState，重整就跳回硬預設、也沒人記得某張對帳單
                用了幾 %，而月結 cron 還另外寫死一份自己的常數 —— 兩張單子永遠對不起來。
                現在一律讀 DB：全站預設在「廠商管理 → 廠商結算設定」，每家可在廠商編輯視窗覆蓋。
              */}
            </div>
          </div>
        </div>

        {/* 期間標題列 */}
        {period && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-neutral-700">
              {period.label} 結算期
            </h2>
            <span className="text-xs text-neutral-400">{period.startDate} ～ {period.endDate}</span>
            <span className="text-xs text-neutral-400">結算日 {period.settlementDate}</span>
            {period.isCurrent && (
              <span className="text-xs text-amber-500 font-medium">● 進行中（預估值）</span>
            )}

            {/*
              結算狀態。徽章連廠商都看得到 —— 他最想知道的就是「這期你確認了沒、付了沒」，
              等於免掉一輪追問。按鈕只有 super_admin，而且伺服器端會再擋一次。
            */}
            {data?.lock?.status && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                data.lock.status === 'paid' ? 'bg-green-50 text-green-700'
                : data.lock.status === 'confirmed' ? 'bg-blue-50 text-blue-700'
                : 'bg-neutral-100 text-neutral-500'
              }`}>
                {data.lock.status === 'paid' ? '已付款' : data.lock.status === 'confirmed' ? '已確認' : '草稿'}
              </span>
            )}

            {/* 沒快照就沒得確認。併進標題列這一行，不另外佔一塊（老闆 2026-08-25） */}
            {canSettle && !loading && data && !data.lock?.id && !period.isCurrent && (
              <span className="ml-auto text-xs text-amber-600">
                本期尚未產生月結快照，無法確認結算（快照由月結排程每月 1 日自動產生）
              </span>
            )}

            {canSettle && data?.lock?.id && (
              <div className="ml-auto flex items-center gap-2">
                {data.lock.status === 'draft' && (
                  <button
                    onClick={() => setSnapshotStatus('confirmed')}
                    disabled={statusSaving}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
                  >
                    確認結算
                  </button>
                )}
                {data.lock.status === 'confirmed' && (
                  <>
                    <button
                      onClick={() => setSnapshotStatus('paid')}
                      disabled={statusSaving}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60"
                    >
                      標記已付款
                    </button>
                    <button
                      onClick={() => setSnapshotStatus('draft')}
                      disabled={statusSaving}
                      className="px-3 py-1.5 text-xs text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-60"
                    >
                      退回草稿
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}


        {/*
          未付款期別。取代原本 /settlement-snapshots 那一頁的清單功能 ——
          會計要的是「哪幾期哪幾家還沒付」，那不值得一整頁，放這裡剛好。
          廠商不顯示：他只有自己一家，而且不該看到平台對其他期別的付款節奏。
        */}
        {!isSupplier && (data?.unpaid?.length ?? 0) > 0 && (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-neutral-700">未付款期別</h3>
              <span className="text-xs text-neutral-400">{data?.unpaid?.length} 筆</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-500">期別</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-500">廠商</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-500">結算日</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-neutral-500">應付</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-500">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data?.unpaid?.map(u => (
                    <tr key={u.id} className="transition-colors hover:bg-neutral-50">
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-neutral-500">
                        {u.period_start.slice(0, 7)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-neutral-900">{u.supplier_name}</td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-neutral-500">{u.settlement_date}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums font-medium">
                        {fmt(u.supplier_net)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          u.status === 'confirmed' ? 'bg-blue-50 text-blue-700' : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {u.status === 'confirmed' ? '已確認・待付款' : '草稿'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              {settlementMode === 'margin' && recycledRevenueExcluded > 0 && (
                <Row
                  label={<><span className="text-neutral-600">被回收抽獎</span><span className="text-xs text-neutral-400 ml-1.5">移出一般分潤，改走差額</span></>}
                  value={`−${fmt(recycledRevenueExcluded)}`} red indent
                />
              )}
              <Row label={<span className="font-semibold text-neutral-800">可分潤基礎</span>} value={fmt(distributableBase)} bold />
              <Row label={<><span className="text-neutral-400">平台留存</span><span className="text-xs text-neutral-400 ml-1">{100 - supplierShare}%</span></>} value={`−${fmt(platformShare)}`} red indent />
              <div className="border-t border-neutral-200 my-0.5" />

              {/* ⑤ 廠商分潤 → 再扣回收 */}
              <Row label={<><span className="font-semibold text-neutral-800">廠商分潤</span><span className="text-xs text-neutral-400 ml-1">{supplierShare}%</span></>} value={fmt(supplierGross)} indigo />
              {/*
                差額分潤 0% 時整列不畫（老闆 2026-08-25）。
                對平台管理員那是「+NT$ 0」的噪音；對**廠商**更糟 ——
                看到「差額 NT$ 40,380 · 廠商 0%」會讓人以為別家廠商拿得到分潤，
                而自己被單獨排除。沒有金額就不要提起這件事。
              */}
              {marginToSupplier !== 0 && (
                <Row
                  label={<><span className="text-neutral-600">回收差額分潤</span><span className="text-xs text-neutral-400 ml-1.5">差額 {fmt(recycledMarginTotal)} · 廠商 {data?.marginSupplierShare ?? 0}%</span></>}
                  value={`+${fmt(marginToSupplier)}`} indent
                />
              )}
              {settlementMode === 'charge' && dismantleTotal !== 0 && (
                <Row
                  label={<><span className="text-neutral-600">回收退代幣</span><span className="text-xs text-neutral-400 ml-1.5">廠商吸收 100%</span></>}
                  value={`−${fmt(dismantleTotal)}`} red indent
                />
              )}
              {crossPeriodCount > 0 && crossPeriodAdjustment !== 0 && (
                /*
                  往期抽、本期回收。那筆營收上一期已按一般分潤付過了，
                  這裡補算差額 —— 有正負號，不是單方向的追回。
                */
                <Row
                  label={
                    <>
                      <span className="text-neutral-600">往期回收調整</span>
                      <span className="ml-1.5 text-xs text-neutral-400">
                        {crossPeriodCount} 筆上期抽獎
                        {data?.crossPeriodEstimated && '・估算'}
                      </span>
                    </>
                  }
                  value={`${crossPeriodAdjustment >= 0 ? '+' : '−'}${fmt(Math.abs(crossPeriodAdjustment))}`}
                  red={crossPeriodAdjustment < 0}
                  indent
                />
              )}

              {/* 最終結果 */}
              <div className="border-t-2 border-neutral-300 mt-2 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-neutral-800">實際應付廠商</span>
                    <InfoTooltip text={settlementMode === 'margin'
                      ? `① 消費 G − 綠界手續費 = 淨收入\n② 淨收入 − 折價券（50%）− 運費（50%）${pointsMode === 'A' ? ' + 積分補償（50%）' : ''} − 被回收抽獎營收 = 可分潤基礎\n③ 可分潤基礎 × ${supplierShare}% = 廠商分潤\n④ 廠商分潤 + 回收差額 × ${data?.marginSupplierShare ?? 0}% ± 往期回收調整 = 實際應付廠商\n（回收退給玩家的代幣由平台吸收，不跟廠商收）\n往期回收調整＝上期抽、本期被回收的那幾筆，本期應給與上期已付的差，可正可負`
                      : `① 消費 G − 綠界手續費 = 淨收入\n② 淨收入 − 折價券（50%）− 運費（50%）${pointsMode === 'A' ? ' + 積分補償（50%）' : ''} = 可分潤基礎\n③ 可分潤基礎 × ${supplierShare}% = 廠商分潤\n④ 廠商分潤 − 回收退代幣${(data?.marginSupplierShare ?? 0) > 0 ? ` + 回收差額 × ${data?.marginSupplierShare}%` : ''} ± 往期回收調整 = 實際應付廠商\n（回收價跟廠商收，差額分潤仍可另外給）`} />
                  </div>
                  <span className={`text-xl font-bold tabular-nums ${supplierNet < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(supplierNet)}</span>
                </div>
                {lock?.locked && (
                  /*
                    這一期已經有 confirmed／paid 的月結快照。結算頁本身是每次開都
                    即時重算的，所以本月中發生一筆上月的回收，回頭看上月的數字
                    就會跟當初付款時不一樣 —— 以快照為準，差額走下一期的往期回收調整。
                  */
                  <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
                    <span className="font-medium text-neutral-900">
                      本期已{lock.status === 'paid' ? '付款' : '確認'}鎖帳
                    </span>
                    ，結算金額以月結快照為準：
                    <span className="mx-1 font-mono font-medium text-neutral-900">{fmt(lock.net ?? 0)}</span>
                    {Math.round(lock.net ?? 0) !== supplierNet && (
                      <>
                        <br />
                        上方為即時重算值，差額
                        <span className="mx-1 font-mono">{fmt(Math.abs(supplierNet - (lock.net ?? 0)))}</span>
                        來自鎖帳後才發生的回收，會在下一期以「往期回收調整」沖銷。
                      </>
                    )}
                  </div>
                )}
                {supplierNet < 0 && (
                  /*
                   * 負數以前會被 Math.max(0, …) 夾成 0，那筆欠款就地消失、也不結轉下一期，
                   * 等於平台自動放棄債權。現在照實顯示，由會計決定怎麼沖銷。
                   */
                  <p className="text-xs text-red-500 mt-1">
                    * 本期為負數：廠商當期分潤不足以抵銷回收扣款，差額需結轉下一期沖銷，不可視為 0
                  </p>
                )}
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
