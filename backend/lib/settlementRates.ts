import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * 結算費率的單一來源
 *
 * 「平台毛利」這個數字現在會出現在三個地方：廠商結算頁、營運儀表板的平台健康度、
 * 玩法分析與熱門賞池。三處各寫一份常數，改一次就會有兩處算出不同的毛利率，
 * 老闆一比對就會發現對不起來 —— 所以集中在這裡。
 *
 * ── 為什麼毛利不看進貨成本 ──
 * `products.cost` 與 `product_prizes.sale_price`／`recycle_value` 實測 PROD
 * **117 件商品全部是 0**（要廠商逐件逐品項填成本不現實，老闆確認不會填）。
 * 所以毛利改走「結算口徑」：
 *
 *     平台毛利 = 消費金額 − 綠界手續費分攤 − 廠商分潤
 *
 * 每一項都有真實資料，而且跟廠商結算頁同一條算式，財務對得起來。
 *
 * ⚠️ `products.profit_rate` **不是毛利率**，別拿來用 ——
 * 它只有 0.01 / 1.00 兩種值，是一番賞／抽卡／自製賞的出獎機率調節
 * （見 `app/settings/rates/Panel.tsx`）。
 */

/** 廠商分潤比（%）。結算頁可以臨時改成別的值試算，那是 what-if，預設以這個為準 */
export const SUPPLIER_SHARE_PCT = 70

/** 沒有實際扣款紀錄時的綠界手續費估算比例（%），與結算頁同一個預設值 */
export const ECPAY_FALLBACK_RATE_PCT = 2.75

/**
 * 有效綠界費率：實際被扣的手續費 ÷ 儲值總額。
 *
 * 各種付款方式費率不同（信用卡 2.75%、超商 30 元、ATM 15 元、TWQR 1%…），
 * 混在一起沒辦法用單一比例表示，所以直接用「實際扣了多少」回推。
 * 沒有任何一筆帶 `payment_fee` 時退回估算值。
 */
export function effectiveFeeRate(rechargeTotal: number, feeTotal: number, hasActualFee: boolean): number {
  if (!hasActualFee || rechargeTotal <= 0) return ECPAY_FALLBACK_RATE_PCT / 100
  return feeTotal / rechargeTotal
}

/**
 * 一段消費金額的平台毛利。
 *
 * @param spend    這段期間的消費金額（G，1G = NT$1）
 * @param feeRate  有效綠界費率（小數，例如 0.0275）
 */
export function platformMargin(spend: number, feeRate: number): number {
  const fee = spend * feeRate
  const supplier = (spend - fee) * (SUPPLIER_SHARE_PCT / 100)
  return Math.round(spend - fee - supplier)
}

/** 毛利率（%，一位小數）。消費為 0 時回 0 而不是 NaN */
export function marginPct(spend: number, feeRate: number): number {
  if (spend <= 0) return 0
  return Math.round(platformMargin(spend, feeRate) / spend * 1000) / 10
}


// ═══════════════════════════════════════════════════════════════
// 以下為 2026-08-25「結算費率存 DB」新增的部分
//
// 上面那兩個常數（SUPPLIER_SHARE_PCT / ECPAY_FALLBACK_RATE_PCT）現在只是
// 讀不到 DB 時的保底值。真正的來源是 platform_settings，廠商可個別覆蓋。
// 儀表板那幾支同步函數繼續用常數沒關係（它們算的是全平台概況，不分廠商），
// 但廠商結算一律走 getSettlementDefaults() + resolveRates()。
// ═══════════════════════════════════════════════════════════════

/**
 * 結算費率的 DB 來源
 *
 * 改版前這幾個值有兩份：`/reports/settlement` 頁面上的 useState（重整就跳回硬預設），
 * 以及月結 cron 自己寫死的常數。頁面調了 65%、cron 出的快照還是 70%，兩張單子對不起來。
 * 現在全部收斂到 platform_settings，廠商可個別覆蓋。
 *
 * 語意：廠商欄位為 NULL ＝ 跟隨全站預設。改全站預設時，沒客製過的廠商跟著變，
 * 動過的不受影響。
 */

export const SETTLEMENT_KEYS = [
  'settlement_supplier_share',
  'settlement_withholding_rate',
  'settlement_points_mode',
  'settlement_ecpay_rate',
  'recycle_settlement_mode',
  'recycle_margin_supplier_share',
] as const

export interface SettlementDefaults {
  supplierShare: number
  withholdingRate: number
  pointsMode: 'A' | 'B'
  ecpayRate: number
  recycleMode: 'charge' | 'margin'
  recycleMarginShare: number
}

/** 廠商層級可覆蓋的欄位。綠界手續費不在其中 —— 那是平台與綠界之間的費率 */
export interface SupplierRateOverrides {
  profit_share_percent?: number | null
  withholding_rate_percent?: number | null
  points_deduction_mode?: 'A' | 'B' | null
  recycle_settlement_mode?: 'charge' | 'margin' | null
  recycle_margin_supplier_share?: number | null
}

/** 實際套用到某家廠商的費率（廠商有填就用廠商的，否則用全站預設） */
export interface EffectiveRates extends SettlementDefaults {
  /** 這幾項是不是廠商自己設的，畫面上要標示「已客製」時用 */
  customized: (keyof SettlementDefaults)[]
}

export const DEFAULT_FALLBACK: SettlementDefaults = {
  supplierShare: 70,
  withholdingRate: 0,
  pointsMode: 'B',
  ecpayRate: 2.75,
  // 回收價預設「收」（老闆 2026-08-25）
  recycleMode: 'charge',
  recycleMarginShare: 0,
}

export async function getSettlementDefaults(
  supabase = getSupabaseAdmin(),
): Promise<SettlementDefaults> {
  const { data } = await supabase
    .from('platform_settings').select('key, value').in('key', SETTLEMENT_KEYS as unknown as string[])
  const m = Object.fromEntries((data ?? []).map((s: any) => [s.key, s.value]))
  return {
    supplierShare: numOr(m.settlement_supplier_share, DEFAULT_FALLBACK.supplierShare),
    withholdingRate: numOr(m.settlement_withholding_rate, DEFAULT_FALLBACK.withholdingRate),
    pointsMode: m.settlement_points_mode === 'A' ? 'A' : 'B',
    ecpayRate: numOr(m.settlement_ecpay_rate, DEFAULT_FALLBACK.ecpayRate),
    // 沒設過就用 DEFAULT_FALLBACK（收）；只有明確寫 margin 才是不收
    recycleMode: m.recycle_settlement_mode === 'margin' ? 'margin' : DEFAULT_FALLBACK.recycleMode,
    recycleMarginShare: numOr(m.recycle_margin_supplier_share, DEFAULT_FALLBACK.recycleMarginShare),
  }
}

/** 把廠商覆蓋疊在全站預設上。NULL／undefined 一律視為「跟隨預設」 */
export function resolveRates(
  defaults: SettlementDefaults,
  supplier: SupplierRateOverrides | null | undefined,
): EffectiveRates {
  const customized: (keyof SettlementDefaults)[] = []
  const pick = <K extends keyof SettlementDefaults>(
    key: K, raw: unknown, cast: (v: any) => SettlementDefaults[K],
  ): SettlementDefaults[K] => {
    if (raw === null || raw === undefined || raw === '') return defaults[key]
    customized.push(key)
    return cast(raw)
  }

  return {
    supplierShare: pick('supplierShare', supplier?.profit_share_percent, Number),
    withholdingRate: pick('withholdingRate', supplier?.withholding_rate_percent, Number),
    pointsMode: pick('pointsMode', supplier?.points_deduction_mode, v => (v === 'A' ? 'A' : 'B')),
    // 綠界手續費不分廠商
    ecpayRate: defaults.ecpayRate,
    recycleMode: pick('recycleMode', supplier?.recycle_settlement_mode, v => (v === 'charge' ? 'charge' : 'margin')),
    recycleMarginShare: pick('recycleMarginShare', supplier?.recycle_margin_supplier_share, Number),
    customized,
  }
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
