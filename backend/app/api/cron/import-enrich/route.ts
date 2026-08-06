import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { enrichRow } from '@/lib/productEnricher'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 商品補齊工作的執行者
 *
 * pg_cron 每分鐘打一次，每次處理固定筆數。跑不完下一輪繼續 ——
 * 可中斷、可續跑、可重試，這是原本那個 modal 給不了的。
 *
 * 一筆大約 8 秒（查資料 3 秒 + 商品圖 + 每個款式各一張圖），
 * 所以一輪抓 6 筆、併發 2，控在 60 秒的上限內。
 * 33 筆的檔案大約 3~4 分鐘跑完。
 */

const CRON_SECRET = process.env.CRON_SECRET ?? ''
/** 一輪處理幾筆。抓 6 是讓最壞情況也能在 60 秒內收工 */
const BATCH = 6
const CONCURRENCY = 2
/** 同一列最多重跑幾次。一直失敗的多半是查不到，再跑也一樣，別無限燒錢 */
const MAX_ATTEMPTS = 2

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // 只處理還在補齊中的工作，先進先出
  const { data: rows, error } = await supabase
    .from('import_job_rows')
    .select('id, job_id, product, prizes, attempts, filled, import_jobs!inner(status)')
    .eq('status', 'pending')
    .eq('import_jobs.status', 'enriching')
    .lt('attempts', MAX_ATTEMPTS)
    .order('id', { ascending: true })
    .limit(BATCH)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ ok: true, processed: 0 })

  // 先標記成處理中，避免下一輪 cron 重複撈到同一批
  const ids = rows.map(r => r.id)
  await supabase.from('import_job_rows')
    .update({ status: 'enriching', updated_at: new Date().toISOString() })
    .in('id', ids)

  let done = 0
  let failed = 0
  let cursor = 0

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
          // 保留解析階段就記下的補齊項目，補齊層的接在後面
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

  return NextResponse.json({ ok: true, processed: rows.length, done, failed })
}
