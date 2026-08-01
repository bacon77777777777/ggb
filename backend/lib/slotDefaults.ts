/**
 * 老虎機玩法定版參數 —— 單一真實來源
 *
 * 返還池刻意寫死不開放後台編輯：這組權重直接決定 RTP，
 * 調鬆一點就會讓 RTP 超過 100%（平台每輪倒賠），且畫面上看不出來
 * ——單轉返還金額不變（10 檔皆為 2G），變的只有出現機率。
 *
 * 曾因為這組數值在「主題編輯頁」與「新增主題 API」各寫死一份、
 * 兩邊不同步，導致主題頁一存檔就把 DB 覆蓋成舊值，
 * RTP 從 82% 變成 108%（見 migration 410）。故統一由此匯出。
 *
 * 返還期望 = Σ(weight × multiplier) / Σ(weight) = 38.7%
 * 搭配保底 200 轉、觸發 0.2%、延續 30%（衰減 0.5）→ RTP ≈ 82%（毛利約 18%）
 *
 * 要改動請先重算 RTP，並同步 backend/db/migrations 的對應 migration。
 */
export const CANONICAL_SPIN_RETURNS = [
  { name: '神域共鳴', multiplier: 2.4, weight: 20 },
  { name: '命運之瞳', multiplier: 1.5, weight: 50 },
  { name: '緋色幸運', multiplier: 0.8, weight: 130 },
  { name: '黃金序章', multiplier: 0.2, weight: 800 },
] as const

/** 返還期望值（占投注額比例） */
export const CANONICAL_RETURN_EV =
  CANONICAL_SPIN_RETURNS.reduce((s, r) => s + r.multiplier * r.weight, 0) /
  CANONICAL_SPIN_RETURNS.reduce((s, r) => s + r.weight, 0)
