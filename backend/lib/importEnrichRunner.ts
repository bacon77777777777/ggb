import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { enrichRow } from '@/lib/productEnricher'

/**
 * 補齊一批
 *
 * 同一段邏輯給兩個入口用：
 *   1. 後台頁面 —— 開著補齊結果那一頁時由前端推進，每輪一批
 *   2. pg_cron  —— 沒人看著的時候在背景跑
 *
 * 兩邊同時跑也不會重複處理：撈到之後先把那幾列標成 enriching，
 * 另一邊的查詢只吃 pending，自然就錯開了。
 *
 * 為什麼不能只靠 cron：pg_cron 排的是打正式站的網址，本機與 STG
 * 根本不會有人來處理，工作就永遠停在 0/33。頁面自己推進的話，
 * 三個環境行為一致。
 */

/** 一輪處理幾筆。抓 6 是讓最壞情況也能在 60 秒的 function 上限內收工 */
const BATCH = 6
const CONCURRENCY = 2
/** 同一列最多重跑幾次。一直失敗多半是查不到，再跑也一樣，別無限燒錢 */
const MAX_ATTEMPTS = 2

export async function runEnrichBatch(jobId?: number | string): Promise<{
  processed: number; done: number; failed: number
}> {
  const supabase = getSupabaseAdmin()

  let q = supabase
    .from('import_job_rows')
    .select('id, job_id, product, prizes, attempts, filled, import_jobs!inner(status)')
    .eq('status', 'pending')
    .eq('import_jobs.status', 'enriching')
    .lt('attempts', MAX_ATTEMPTS)
    .order('id', { ascending: true })
    .limit(BATCH)
  if (jobId) q = q.eq('job_id', jobId)

  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  if (!rows?.length) return { processed: 0, done: 0, failed: 0 }

  // 先佔起來，另一個入口就撈不到同一批
  await supabase.from('import_job_rows')
    .update({ status: 'enriching', updated_at: new Date().toISOString() })
    .in('id', rows.map(r => r.id))

  let done = 0, failed = 0, cursor = 0

  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++]
      const attempts = (row.attempts ?? 0) + 1
      try {
        const r = await enrichRow(
          (row.product ?? {}) as Record<string, unknown>,
          (row.prizes ?? []) as Record<string, unknown>[],
        )
        await supabase.from('import_job_rows').update({
          product: r.product,
          prizes: r.prizes,
          // 解析階段記下的補齊項目要留著，補齊層的接在後面
          filled: [...((row.filled ?? []) as unknown[]), ...r.filled],
          status: 'done',
          attempts,
          error: null,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        done++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '補齊失敗'
        await supabase.from('import_job_rows').update({
          // 還沒用完重試次數就退回 pending，下一輪再試
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          error: msg.slice(0, 300),
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        failed++
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))
  return { processed: rows.length, done, failed }
}
