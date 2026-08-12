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
