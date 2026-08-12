import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createLinePusher } from '@/lib/linePush'
import { fetchAllRows } from '@/lib/fetchAllRows'
const pushLine = createLinePusher('line_push_finance')

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

const ECPAY_RATE     = 2.75   // 手續費率（無實際資料時用）
const SUPPLIER_SHARE = 70     // 廠商分潤比例


async function calcSupplierSettlement(supabase: any, supplierId: number, start: string, end: string) {
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
      .select('recycle_value, product:products(supplier_id)')
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

  const dismantleTotal  = recycleRows
    .filter((r: any) => String(r.product?.supplier_id) === String(supplierId))
    .reduce((s: number, r: any) => s + (r.recycle_value || 0), 0)

  const supplierOrders  = orderRows
  const couponTotal     = supplierOrders.reduce((s: number, r: any) => s + (r.coupon_discount || 0), 0)
  const shippingTotal   = supplierOrders.reduce((s: number, r: any) => s + (r.total_amount || 0), 0)

  const netRevenue      = totalG - ecpayFee
  const distributable   = netRevenue - Math.round(couponTotal * 0.5) - Math.round(shippingTotal * 0.5)
  const supplierGross   = Math.round(distributable * (SUPPLIER_SHARE / 100))
  const supplierNet     = Math.max(0, supplierGross - dismantleTotal)

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

  const { data: suppliers } = await supabase.from('suppliers').select('id, name').order('id')
  if (!suppliers?.length) return NextResponse.json({ ok: true, created: 0, message: '無廠商' })

  let created = 0
  let skipped = 0
  const results: { supplier: string; net: number; status: string }[] = []

  for (const sup of suppliers) {
    const calc = await calcSupplierSettlement(supabase, sup.id, periodStart, periodEnd)

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
