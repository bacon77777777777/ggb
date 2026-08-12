/**
 * 分頁把整批列撈完
 *
 * PostgREST（Supabase）預設一次最多回 **1000 列**，而且是**靜默截斷** ——
 * 不報錯、不給任何提示，就只是少給你資料。所以任何「撈回來自己在 JS 加總」
 * 的查詢，只要筆數過千，統計就開始偏低而且沒人會發現。
 *
 * 實測（2026-08-12，STG）：
 *   - 廠商結算：某廠商整年 totalG 應為 114,940，API 回 32,950（少 71%）
 *     —— 那是廠商分潤的計算基底，等於實際少付
 *   - 分析頁：全站整年消費筆數 2,896 被截成 1,000
 *   - 廠商分析：品項 1,315 被截成 1,000
 *
 * 用法：把「還沒 await 的 query builder」包成 function 傳進來，
 * 這裡負責一頁一頁接到底。
 *
 *   const rows = await fetchAllRows(() => db.from('draw_records').select('...').eq(...))
 *
 * 注意：**每次呼叫都要重新 build** —— Supabase 的 query builder 是 thenable，
 * 同一個實例重複加 `.range()` 會疊在一起，所以參數收的是 function 不是 builder。
 */

const PAGE = 1000

export async function fetchAllRows<T = any>(build: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

export default fetchAllRows
