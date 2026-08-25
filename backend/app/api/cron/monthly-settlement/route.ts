import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createLinePusher } from '@/lib/linePush'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { getSettlementDefaults, resolveRates, type SettlementDefaults } from '@/lib/settlementRates'
const pushLine = createLinePusher('line_push_finance')

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

/*
 * 費率不再寫死在這裡（老闆 2026-08-25）。
 *
 * 以前這兩個常數跟結算頁上那四個 useState 是兩份互不相干的值 ——
 * 頁面調成 65%、cron 出的快照還是 70%，同一期兩張單子對不起來。
 * 現在一律讀 platform_settings，廠商可個別覆蓋（NULL＝跟隨全站預設）。
 *
 * 下面兩個只留作讀不到 DB 時的保底。
 */
const ECPAY_RATE_FALLBACK     = 2.75
const SUPPLIER_SHARE_FALLBACK = 70


async function calcSupplierSettlement(
  supabase: any,
  supplierId: number,
  start: string,
  end: string,
  defaults: SettlementDefaults,
  supplierRow: any,
) {
  // 這家實際套用的費率：有客製用客製，否則全站預設
  const rates = resolveRates(defaults, supplierRow)
  const ECPAY_RATE     = rates.ecpayRate ?? ECPAY_RATE_FALLBACK
  const SUPPLIER_SHARE = rates.supplierShare ?? SUPPLIER_SHARE_FALLBACK

  const endExclusive = new Date(end)
  endExclusive.setDate(endExclusive.getDate() + 1)
  const endStr = endExclusive.toISOString().slice(0, 10)

  /*
   * 全部走 fetchAllRows —— PostgREST 預設只回 1000 列且靜默截斷。
   * 這支寫的是 `settlement_snapshots`，也就是**實際要付給廠商的金額**，
   * 截斷等於少付。同樣的洞在 /api/admin/reports 的結算分頁也修過
   * （實測某廠商整年 totalG 114,940 被截成 32,950）。
   *
   * orders 那支容錯：STG 與 PROD 的 orders schema 不一樣（STG 沒有
   * coupon_discount／total_amount／supplier_id），失敗就以 0 計，
   * 不要讓整個月結 cron 掛掉。
   */
  const [supplierRes, drawRows, rechargeRows, recycleRows, orderRows] = await Promise.all([
    supabase.from('suppliers').select('id, name').eq('id', supplierId).single(),
    fetchAllRows<any>(() => supabase.from('draw_records')
      .select('product_id, created_at, product:products(id, name, price, supplier_id)')
      .gte('created_at', start).lt('created_at', endStr)),
    fetchAllRows<any>(() => supabase.from('recharge_records')
      .select('amount, status, payment_fee, created_at')
      .gte('created_at', start).lt('created_at', endStr)),
    fetchAllRows<any>(() => supabase.from('admin_recycle_pool')
      .select('recycle_value, unit_price, margin, created_at, draw:draw_records(created_at), product:products(supplier_id)')
      .gte('created_at', start).lt('created_at', endStr)),
    fetchAllRows<any>(() => supabase.from('orders')
      .select('coupon_discount, total_amount')
      .eq('supplier_id', supplierId)
      .gte('created_at', start).lt('created_at', endStr))
      .catch((e: any) => {
        console.warn('[monthly-settlement] orders 查詢失敗，折價券／運費以 0 計：', e?.message)
        return [] as any[]
      }),
  ])

  const draws: any[]    = drawRows
  const recharges: any[] = rechargeRows

  const supplierDraws   = draws.filter(d => String(d.product?.supplier_id) === String(supplierId))
  const totalG          = supplierDraws.reduce((s, d) => s + (d.product?.price || 0), 0)
  const totalPlatformG  = draws.reduce((s, d) => s + (d.product?.price || 0), 0)
  const consumptionShare = totalPlatformG > 0 ? totalG / totalPlatformG : 1

  const successRecharges   = recharges.filter(r => r.status === 'success')
  const rechargeTotal      = successRecharges.reduce((s, r) => s + (r.amount || 0), 0)
  const rechargeCount      = successRecharges.length
  /*
   * 手續費算「本廠商消費 × 有效費率」，跟 /api/admin/reports 的結算頁同一套。
   * 兩邊算法要一致，否則月結快照跟畫面上看到的金額會對不起來。
   * 不用平台總額分攤的理由見 reports/route.ts 的註解（會讓廠商反推平台營收）。
   */
  const rechargesWithFee   = successRecharges.filter(r => r.payment_fee != null)
  const platformTotalFee   = rechargesWithFee.reduce((s, r) => s + (r.payment_fee || 0), 0)
  const feeBaseAmount      = rechargesWithFee.reduce((s, r) => s + (r.amount || 0), 0)
  const hasActualFee       = rechargesWithFee.length > 0 && feeBaseAmount > 0
  const effectiveFeeRate   = hasActualFee ? platformTotalFee / feeBaseAmount : null
  const allocatedActualFee = effectiveFeeRate != null ? Math.round(totalG * effectiveFeeRate) : null
  const ecpayFee           = allocatedActualFee ?? Math.round(totalG * (ECPAY_RATE / 100))

  /*
   * 回收拆兩桶，算法必須與結算頁（/api/admin/reports?tab=settlement）完全一致 ——
   * 快照是鎖帳後的權威數字，兩邊用不同算式就會出現「頁面說 A、對帳單說 B」。
   *
   *   本期抽、本期回收 → margin：從基底移出走差額分潤｜charge：扣回收價
   *   往期抽、本期回收 → 基底不動，改列有正負號的「往期回收調整」
   */
  const supplierRecycles = recycleRows
    .filter((r: any) => String(r.product?.supplier_id) === String(supplierId))
  const drawnAt = (r: any) => r.draw?.created_at ?? r.created_at
  const isCurrentDraw = (r: any) => {
    const t = drawnAt(r)
    if (!t) return true
    return t >= start && t < endStr
  }
  const currentRecycles = supplierRecycles.filter(isCurrentDraw)
  const priorRecycles   = supplierRecycles.filter((r: any) => !isCurrentDraw(r))
  const sumBy = (rows: any[], f: string) => rows.reduce((s: number, r: any) => s + (r[f] || 0), 0)

  const dismantleTotal = rates.recycleMode === 'charge' ? sumBy(currentRecycles, 'recycle_value') : 0
  const recycledRevenueExcluded = rates.recycleMode === 'margin' ? sumBy(currentRecycles, 'unit_price') : 0
  const recycledMarginTotal = sumBy(currentRecycles, 'margin')
  // 差額分潤與「回收價收不收」互相獨立（老闆 2026-08-25），兩種模式都算
  const marginToSupplier = Math.round((recycledMarginTotal * rates.recycleMarginShare) / 100)

  const supplierOrders  = orderRows
  const couponTotal     = supplierOrders.reduce((s: number, r: any) => s + (r.coupon_discount || 0), 0)
  const shippingTotal   = supplierOrders.reduce((s: number, r: any) => s + (r.total_amount || 0), 0)

  const netRevenue      = totalG - ecpayFee
  const distributable   = netRevenue
    - Math.round(couponTotal * 0.5)
    - Math.round(shippingTotal * 0.5)
    - recycledRevenueExcluded
  const supplierGross   = Math.round(distributable * (SUPPLIER_SHARE / 100))

  // 往期已付的實得率一律取「當初那一期快照」存的值，不用現在的費率
  const { data: priorSnaps } = await supabase
    .from('settlement_snapshots')
    .select('period_start, period_end, total_g, raw_data')
    .eq('supplier_id', supplierId)
  const paidRateAt = (iso: string | null) => {
    const day = iso ? String(iso).slice(0, 10) : ''
    const sn = (priorSnaps ?? []).find((x: any) => day >= x.period_start && day <= x.period_end)
    const gross = Number(sn?.raw_data?.supplierGross)
    const tg = Number(sn?.total_g)
    return sn && Number.isFinite(gross) && Number.isFinite(tg) && tg > 0
      ? gross / tg
      : SUPPLIER_SHARE / 100
  }

  let crossPeriodAdjustment = 0
  for (const r of priorRecycles) {
    const rate = paidRateAt(drawnAt(r))
    const alreadyPaid = (r.unit_price || 0) * rate
    // 差額分潤兩種模式都給，算式必須與結算頁一致
    const marginShare = ((r.margin || 0) * rates.recycleMarginShare) / 100
    const shouldGet = rates.recycleMode === 'margin'
      ? marginShare
      : alreadyPaid - (r.recycle_value || 0) + marginShare
    crossPeriodAdjustment += shouldGet - alreadyPaid
  }
  crossPeriodAdjustment = Math.round(crossPeriodAdjustment)

  /*
   * ⚠️ 不再用 Math.max(0, …) 夾住。扣成負數會被截成 0，那筆欠款就地消失、
   * 也不會結轉下一期 —— 等於平台自動放棄債權。負數就讓它是負數。
   */
  const supplierNet = supplierGross + marginToSupplier - dismantleTotal + crossPeriodAdjustment

  return {
    supplier_id:      supplierId,
    supplier_name:    supplierRes.data?.name ?? '',
    total_g:          totalG,
    dismantle_total:  dismantleTotal,
    coupon_total:     couponTotal,
    shipping_total:   shippingTotal,
    consumption_share: consumptionShare,
    ecpay_fee:        ecpayFee,
    supplier_net:     supplierNet,
    raw_data: {
      rechargeTotal, rechargeCount,
      hasActualFee, allocatedActualFee, platformTotalFee: hasActualFee ? platformTotalFee : null,
      supplierGross, distributable, netRevenue,
      recycledRevenueExcluded, recycledMarginTotal, marginToSupplier,
      crossPeriodAdjustment, crossPeriodCount: priorRecycles.length,
      /*
       * 當期實際採用的費率一併存進快照。
       * 沒存的話，之後要算「上期就這筆付了多少」（跨期回收調整）就沒有基準 ——
       * 費率隨時可能被後台調動，用現在的值回推歷史一定算錯。
       */
      rates: {
        supplierShare: SUPPLIER_SHARE,
        ecpayRate: ECPAY_RATE,
        withholdingRate: rates.withholdingRate,
        pointsMode: rates.pointsMode,
        recycleMode: rates.recycleMode,
        recycleMarginShare: rates.recycleMarginShare,
        customized: rates.customized,
      },
    },
  }
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 允許手動指定月份（YYYY-MM），預設為上個月
  const monthParam = req.nextUrl.searchParams.get('month')
  let year: number, month: number
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    [year, month] = monthParam.split('-').map(Number)
  } else {
    const now = new Date()
    const tw  = new Date(now.getTime() + 8 * 3600_000)
    year  = tw.getUTCMonth() === 0 ? tw.getUTCFullYear() - 1 : tw.getUTCFullYear()
    month = tw.getUTCMonth() === 0 ? 12 : tw.getUTCMonth()
  }

  const pad   = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const periodStart    = `${year}-${pad(month)}-01`
  const periodEnd      = `${year}-${pad(month)}-${lastDay}`
  const settleYear     = month === 12 ? year + 1 : year
  const settleMonth    = month === 12 ? 1 : month + 1
  const settlementDate = `${settleYear}-${pad(settleMonth)}-05`

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 費率欄位一起撈，每家各自解析（NULL＝跟隨全站預設）
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, profit_share_percent, withholding_rate_percent, points_deduction_mode, recycle_settlement_mode, recycle_margin_supplier_share')
    .order('id')
  if (!suppliers?.length) return NextResponse.json({ ok: true, created: 0, message: '無廠商' })

  const settlementDefaults = await getSettlementDefaults(supabase)

  let created = 0
  let skipped = 0
  const results: { supplier: string; net: number; status: string }[] = []

  for (const sup of suppliers) {
    const calc = await calcSupplierSettlement(supabase, sup.id, periodStart, periodEnd, settlementDefaults, sup)

    const { error } = await supabase.from('settlement_snapshots').upsert({
      supplier_id:    sup.id,
      supplier_name:  calc.supplier_name,
      period_start:   periodStart,
      period_end:     periodEnd,
      settlement_date: settlementDate,
      total_g:        calc.total_g,
      dismantle_total: calc.dismantle_total,
      coupon_total:   calc.coupon_total,
      shipping_total: calc.shipping_total,
      consumption_share: calc.consumption_share,
      ecpay_fee:      calc.ecpay_fee,
      supplier_net:   calc.supplier_net,
      raw_data:       calc.raw_data,
      status:         'draft',
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'supplier_id,period_start', ignoreDuplicates: false })

    if (!error) {
      created++
      results.push({ supplier: calc.supplier_name, net: calc.supplier_net, status: 'draft' })
    } else {
      skipped++
    }
  }

  // LINE 推播月結摘要
  const lines = [
    `📋 ${year}年${pad(month)}月 廠商月結快照完成`,
    ``,
    `共 ${created} 家廠商，結算日 ${settlementDate}`,
    ``,
    ...results.map(r => `• ${r.supplier}：NT$ ${Math.round(r.net).toLocaleString()}`),
    ``,
    `請至後台「月結管理」確認後付款。`,
  ]
  await pushLine(lines.join('\n'))

  return NextResponse.json({ ok: true, period: `${periodStart} ~ ${periodEnd}`, created, skipped, results })
}
